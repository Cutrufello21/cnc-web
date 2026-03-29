import { supabase } from './_lib/supabase.js'
import { parseBody } from './_lib/sheets.js'

const FLOATING_DRIVERS = new Set(['Brad', 'Kasey'])
const DAY_MAP = { Monday: 'mon', Tuesday: 'tue', Wednesday: 'wed', Thursday: 'thu', Friday: 'fri' }
const MAX_STOPS_PER_DRIVER = 45

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { deliveryDate, deliveryDay, mode } = await parseBody(req)
  if (!deliveryDate || !deliveryDay) return res.status(400).json({ error: 'Missing deliveryDate or deliveryDay' })

  const dayCol = DAY_MAP[deliveryDay]
  if (!dayCol) return res.status(400).json({ error: `Invalid delivery day: ${deliveryDay}` })

  try {
    // 1. Fetch all current stops, routing rules, drivers, schedule, time off
    const [stopsRes, rulesRes, driversRes, scheduleRes, timeOffRes] = await Promise.all([
      supabase.from('daily_stops').select('*').eq('delivery_date', deliveryDate),
      supabase.from('routing_rules').select('*'),
      supabase.from('drivers').select('*').eq('active', true),
      supabase.from('driver_schedule').select('*'),
      supabase.from('time_off_requests').select('driver_name, date_off, status')
        .eq('date_off', deliveryDate).eq('status', 'approved'),
    ])

    const stops = stopsRes.data || []
    const rules = rulesRes.data || []
    const drivers = (driversRes.data || []).filter(d => d.driver_name !== 'Paul')
    const schedules = scheduleRes.data || []
    const timeOff = (timeOffRes.data || []).map(r => r.driver_name)

    if (stops.length === 0) return res.status(200).json({ success: true, message: 'No stops to optimize', changes: [] })

    // 2. Build driver availability map
    const driverMap = {}
    drivers.forEach(d => { driverMap[d.driver_name] = d })

    const availableDrivers = new Set()
    const floatingAvailable = []

    drivers.forEach(d => {
      const name = d.driver_name
      if (timeOff.includes(name)) return // off today

      // Check schedule
      const sched = schedules.find(s => s.driver_name === name)
      if (sched && !sched[dayCol]) return // not scheduled for this day

      if (FLOATING_DRIVERS.has(name)) {
        floatingAvailable.push(name)
      } else {
        availableDrivers.add(name)
      }
    })

    // 3. Build routing rules lookup
    const ruleMap = {}
    rules.forEach(r => {
      const key = `${r.zip_code}|${r.pharmacy || ''}`
      ruleMap[key] = r
    })

    function getAssignedDriver(zip, pharmacy) {
      let rule = ruleMap[`${zip}|${pharmacy}`] || ruleMap[`${zip}|`]
      if (!rule) {
        const alt = pharmacy === 'SHSP' ? 'Aultman' : 'SHSP'
        rule = ruleMap[`${zip}|${alt}`]
      }
      if (!rule) return null
      const raw = (rule[dayCol] || '').trim()
      if (!raw) return null
      // "Name/ID" or just "ID"
      const name = raw.includes('/') ? raw.split('/')[0] : null
      return name
    }

    // 4. Propose optimal assignments
    const changes = []
    const driverLoads = {}

    // Initialize loads for available drivers
    availableDrivers.forEach(name => { driverLoads[name] = 0 })
    floatingAvailable.forEach(name => { driverLoads[name] = 0 })

    // Count current loads
    stops.forEach(s => {
      if (driverLoads[s.driver_name] !== undefined) {
        driverLoads[s.driver_name]++
      }
    })

    // Pass 1: Check each stop — is the assigned driver available?
    const needsReassign = []
    const correctlyAssigned = []

    stops.forEach(s => {
      const currentDriver = s.driver_name
      const ruleDriver = getAssignedDriver(s.zip, s.pharmacy)

      if (!currentDriver || !availableDrivers.has(currentDriver)) {
        // Driver not available — needs reassignment
        needsReassign.push(s)
      } else {
        correctlyAssigned.push(s)
      }
    })

    // Pass 2: Reassign stops from unavailable drivers
    for (const stop of needsReassign) {
      const ruleDriver = getAssignedDriver(stop.zip, stop.pharmacy)

      // Try the routing rule driver first
      if (ruleDriver && availableDrivers.has(ruleDriver)) {
        changes.push({
          orderId: stop.order_id,
          from: stop.driver_name,
          to: ruleDriver,
          reason: 'Routing rule match',
          zip: stop.zip,
          city: stop.city,
        })
        driverLoads[ruleDriver] = (driverLoads[ruleDriver] || 0) + 1
        continue
      }

      // Try floating drivers
      const floater = floatingAvailable.sort((a, b) => (driverLoads[a] || 0) - (driverLoads[b] || 0))[0]
      if (floater) {
        changes.push({
          orderId: stop.order_id,
          from: stop.driver_name,
          to: floater,
          reason: 'Floating driver (original driver off)',
          zip: stop.zip,
          city: stop.city,
        })
        driverLoads[floater] = (driverLoads[floater] || 0) + 1
        continue
      }

      // Find least loaded available driver
      const leastLoaded = [...availableDrivers].sort((a, b) => (driverLoads[a] || 0) - (driverLoads[b] || 0))[0]
      if (leastLoaded) {
        changes.push({
          orderId: stop.order_id,
          from: stop.driver_name,
          to: leastLoaded,
          reason: 'Load balance (no rule match)',
          zip: stop.zip,
          city: stop.city,
        })
        driverLoads[leastLoaded] = (driverLoads[leastLoaded] || 0) + 1
      }
    }

    // Pass 3: Rebalance — move stops from overloaded to underloaded
    const rebalanceChanges = []
    const avgLoad = Math.round(stops.length / (availableDrivers.size + floatingAvailable.length) || 1)
    const threshold = Math.max(avgLoad + 8, MAX_STOPS_PER_DRIVER) // only rebalance if significantly over

    // Apply pass 2 changes to load counts
    changes.forEach(c => {
      if (driverLoads[c.from] !== undefined) driverLoads[c.from]--
      if (driverLoads[c.to] !== undefined) driverLoads[c.to]++
    })

    // Find overloaded drivers
    for (const [driver, load] of Object.entries(driverLoads)) {
      if (load <= threshold || FLOATING_DRIVERS.has(driver)) continue

      const excess = load - avgLoad
      const stopsForDriver = [...correctlyAssigned, ...needsReassign]
        .filter(s => {
          // Check if this stop is currently assigned to this driver (after changes)
          const change = changes.find(c => c.orderId === s.order_id)
          const currentAssignment = change ? change.to : s.driver_name
          return currentAssignment === driver
        })

      // Move excess stops to underloaded drivers
      let moved = 0
      for (const stop of stopsForDriver) {
        if (moved >= Math.floor(excess / 2)) break // only move half the excess

        const underloaded = [...Object.entries(driverLoads)]
          .filter(([name, l]) => l < avgLoad - 3 && name !== driver && (availableDrivers.has(name) || floatingAvailable.includes(name)))
          .sort((a, b) => a[1] - b[1])

        if (underloaded.length === 0) break

        const [targetDriver] = underloaded[0]
        rebalanceChanges.push({
          orderId: stop.order_id,
          from: driver,
          to: targetDriver,
          reason: `Rebalance (${driver}: ${load} → ${targetDriver}: ${driverLoads[targetDriver]})`,
          zip: stop.zip,
          city: stop.city,
        })
        driverLoads[driver]--
        driverLoads[targetDriver]++
        moved++
      }
    }

    const allChanges = [...changes, ...rebalanceChanges]

    // Mode: preview (default) or apply
    if (mode === 'apply' && allChanges.length > 0) {
      for (const change of allChanges) {
        const driverData = driverMap[change.to]
        await supabase.from('daily_stops').update({
          driver_name: change.to,
          driver_number: driverData?.driver_number || '',
          assigned_driver_number: driverData?.driver_number || '',
        }).eq('order_id', change.orderId)
      }
    }

    return res.status(200).json({
      success: true,
      mode: mode || 'preview',
      totalStops: stops.length,
      availableDrivers: [...availableDrivers, ...floatingAvailable],
      driversOff: timeOff,
      changes: allChanges,
      loads: driverLoads,
      avgLoad,
    })
  } catch (err) {
    console.error('[auto-dispatch]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
