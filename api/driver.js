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

    const payroll = payrollRes.data?.[0]
    let weekTotal = 0
    let dailyStops = {}
    if (payroll) {
      const dayAbbrevs = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
      dayAbbrevs.forEach(d => { dailyStops[d] = payroll[d.toLowerCase()] || 0 })
      weekTotal = payroll.week_total || 0
    }

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
