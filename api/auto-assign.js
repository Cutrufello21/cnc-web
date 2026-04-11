// POST /api/auto-assign
// Called after orders are imported into daily_stops.
// Re-assigns stops based on driver_schedule + time_off_requests.
//
// 1. Reads daily_stops for the given date
// 2. Reads driver_schedule to know who's working and which pharmacy
// 3. Reads time_off_requests for approved/pending off
// 4. Reassigns any stops assigned to drivers who are OFF
// 5. Assigns unassigned stops to the best available driver
//
// Body: { deliveryDate, deliveryDay }
// Returns: { success, reassigned, unassigned, summary }

import { supabase } from './_lib/supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { deliveryDate, deliveryDay } = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    if (!deliveryDate) return res.status(400).json({ error: 'Missing deliveryDate' })

    const dayCol = (deliveryDay || '').slice(0, 3).toLowerCase() || (() => {
      const d = new Date(deliveryDate + 'T12:00:00')
      return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][d.getDay()]
    })()

    // Fetch everything in parallel
    const [stopsRes, schedRes, driversRes, timeOffRes, rulesRes] = await Promise.all([
      supabase.from('daily_stops')
        .select('id, order_id, driver_name, driver_number, zip, pharmacy')
        .eq('delivery_date', deliveryDate)
        .not('status', 'eq', 'DELETED'),
      supabase.from('driver_schedule').select('*'),
      supabase.from('drivers').select('driver_name, driver_number, pharmacy, shift, active').eq('active', true),
      supabase.from('time_off_requests').select('driver_name, status')
        .eq('date_off', deliveryDate).in('status', ['approved', 'pending']),
      supabase.from('routing_rules').select('*').limit(500),
    ])

    // Fetch overrides separately
    const { data: overData } = await supabase.from('schedule_overrides').select('*').eq('date', deliveryDate)
    const overrideMap = {}
    ;(overData || []).forEach(r => { overrideMap[r.driver_name] = r })

    const stops = stopsRes.data || []
    if (stops.length === 0) return res.status(200).json({ success: true, message: 'No stops for this date' })

    // Build schedule lookup
    const schedMap = {}
    ;(schedRes.data || []).forEach(s => { schedMap[s.driver_name] = s })
    const driversOff = new Set((timeOffRes.data || []).map(r => r.driver_name))

    // Determine available drivers — override → time off → default schedule
    const available = (driversRes.data || [])
      .filter(d => {
        if (d.driver_name === 'Demo Driver') return false
        if (driversOff.has(d.driver_name)) return false
        // Check override first
        const override = overrideMap[d.driver_name]
        if (override) return override.status === 'working'
        // Check default schedule
        const sched = schedMap[d.driver_name]
        if (sched && (sched[dayCol] === false || sched[dayCol] === 'false' || sched[dayCol] === 0)) return false
        return true
      })
      .map(d => {
        const override = overrideMap[d.driver_name]
        const sched = schedMap[d.driver_name]
        const pharmacy = override?.pharmacy || sched?.[`${dayCol}_pharm`] || d.pharmacy || 'SHSP'
        const shift = override?.shift || sched?.[`${dayCol}_shift`] || d.shift || 'AM'
        return { ...d, todayPharmacy: pharmacy === 'Both' ? 'SHSP' : pharmacy, todayShift: shift }
      })

    const availableNames = new Set(available.map(d => d.driver_name))
    const availableByPharm = { SHSP: [], Aultman: [] }
    available.forEach(d => {
      if (d.todayPharmacy === 'Aultman') availableByPharm.Aultman.push(d)
      else availableByPharm.SHSP.push(d)
    })

    // Build routing rules lookup for ZIP → preferred driver
    const rules = {}
    ;(rulesRes.data || []).forEach(r => {
      if (r[dayCol]) rules[r.zip] = r[dayCol]
    })

    // Track load per driver for balancing
    const driverLoad = {}
    available.forEach(d => { driverLoad[d.driver_name] = 0 })
    stops.forEach(s => {
      if (availableNames.has(s.driver_name)) {
        driverLoad[s.driver_name] = (driverLoad[s.driver_name] || 0) + 1
      }
    })

    // Find stops that need reassignment
    const needsReassign = stops.filter(s => !availableNames.has(s.driver_name))
    const reassigned = []
    const unassigned = []

    for (const stop of needsReassign) {
      const stopPharm = stop.pharmacy || 'SHSP'
      const pool = stopPharm === 'Aultman' ? availableByPharm.Aultman : availableByPharm.SHSP

      if (pool.length === 0) {
        unassigned.push(stop.order_id)
        continue
      }

      // Try routing rule first
      let target = null
      const ruleDriver = rules[stop.zip]
      if (ruleDriver) {
        const name = ruleDriver.includes('/') ? ruleDriver.split('/')[0].trim() : ruleDriver
        target = pool.find(d => d.driver_name === name)
      }

      // Fallback: lowest load driver in the right pharmacy
      if (!target) {
        target = pool.reduce((best, d) =>
          (driverLoad[d.driver_name] || 0) < (driverLoad[best.driver_name] || 0) ? d : best
        )
      }

      if (target) {
        const { error } = await supabase.from('daily_stops').update({
          driver_name: target.driver_name,
          driver_number: target.driver_number,
          assigned_driver_number: target.driver_number,
        }).eq('id', stop.id)

        if (!error) {
          driverLoad[target.driver_name] = (driverLoad[target.driver_name] || 0) + 1
          reassigned.push({ orderId: stop.order_id, from: stop.driver_name, to: target.driver_name, zip: stop.zip })
        }
      } else {
        unassigned.push(stop.order_id)
      }
    }

    // Build summary
    const summary = `${stops.length} total stops. ${reassigned.length} reassigned from off-duty drivers. ${unassigned.length} unassigned.`
    const driverSummary = {}
    available.forEach(d => { driverSummary[d.driver_name] = driverLoad[d.driver_name] || 0 })

    return res.status(200).json({
      success: true,
      totalStops: stops.length,
      reassigned: reassigned.length,
      unassigned: unassigned.length,
      reassignedDetails: reassigned,
      unassignedOrderIds: unassigned,
      driverLoads: driverSummary,
      availableDrivers: available.length,
      summary,
    })
  } catch (err) {
    console.error('[auto-assign]', err)
    return res.status(500).json({ error: err.message })
  }
}
