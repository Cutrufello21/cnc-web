import { supabase } from './_lib/supabase.js'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default async function handler(req, res) {
  const driverEmail = req.query.email?.toLowerCase()
  if (!driverEmail) return res.status(400).json({ error: 'Missing email' })

  const { data: driverRow, error: driverErr } = await supabase.from('drivers')
    .select('*').eq('email', driverEmail).single()

  if (driverErr || !driverRow) return res.status(403).json({ error: 'Driver not found' })

  const driverName = driverRow.driver_name
  const driverId = driverRow.driver_number
  const pharmacy = driverRow.pharmacy || 'SHSP'
  const tabName = `${driverName} - ${driverId}`

  const todayIdx = new Date().getDay()
  const todayName = DAYS[todayIdx]

  if (todayIdx === 0 || todayIdx === 6) {
    return res.status(200).json({
      approved: false, noDeliveryToday: true,
      deliveryDay: todayName, driverName, driverId, pharmacy,
      stops: [], weekTotal: 0,
    })
  }

  try {
    // Get today's date for delivery
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]

    const [stopsRes, logsRes, payrollRes] = await Promise.all([
      supabase.from('daily_stops').select('*')
        .eq('delivery_date', todayStr)
        .eq('driver_name', driverName),
      supabase.from('dispatch_logs').select('*').eq('date', todayStr),
      supabase.from('payroll').select('*').eq('driver_name', driverName)
        .order('week_of', { ascending: false }).limit(1),
    ])

    const approved = (logsRes.data && logsRes.data.length > 0)

    const stops = (stopsRes.data || []).map((s, idx) => ({
      _index: idx,
      'Order ID': s.order_id,
      'Name': s.patient_name,
      'Address': s.address,
      'City': s.city,
      'ZIP': s.zip,
      'Zip Code': s.zip,
      'Pharmacy': s.pharmacy,
      'Cold Chain': s.cold_chain ? 'Yes' : '',
      'Notes': s.notes || '',
      _coldChain: s.cold_chain || false,
      order_id: s.order_id,
      patient_name: s.patient_name,
      address: s.address,
      city: s.city,
      zip: s.zip,
      pharmacy: s.pharmacy,
      cold_chain: s.cold_chain,
      notes: s.notes,
      dispatch_driver_number: s.dispatch_driver_number,
      assigned_driver_number: s.assigned_driver_number,
    }))

    // Count actual stops per day from daily_stops (reflects transfers)
    const today = new Date()
    const dow = today.getDay()
    const monOffset = dow === 0 ? -6 : 1 - dow
    const monday = new Date(today)
    monday.setDate(today.getDate() + monOffset)
    const friday = new Date(monday)
    friday.setDate(monday.getDate() + 4)
    const fmtD = d => d.toISOString().split('T')[0]

    const { data: weekStops } = await supabase.from('daily_stops').select('delivery_day')
      .eq('driver_name', driverName)
      .gte('delivery_date', fmtD(monday))
      .lte('delivery_date', fmtD(friday))

    const dayMap = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri' }
    let dailyStops = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0 }
    for (const s of (weekStops || [])) {
      const abbr = dayMap[s.delivery_day]
      if (abbr) dailyStops[abbr]++
    }
    let weekTotal = Object.values(dailyStops).reduce((s, v) => s + v, 0)

    return res.status(200).json({
      approved, deliveryDay: todayName,
      driverName, driverId, tabName, pharmacy, stops,
      stopCount: stops.length,
      coldChainCount: stops.filter(s => s._coldChain).length,
      weekTotal, dailyStops,
    })
  } catch (err) {
    console.error('[driver API]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
