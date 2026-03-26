import { supabase } from './_lib/supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const now = new Date()
    const hour = now.getHours()
    const todayIdx = now.getDay()
    const todayName = dayNames[todayIdx]

    let deliveryDay = req.query.day

    if (!deliveryDay || !['Monday','Tuesday','Wednesday','Thursday','Friday'].includes(deliveryDay)) {
      if (hour >= 17) {
        if (todayIdx === 5) deliveryDay = 'Monday'
        else if (todayIdx === 6) deliveryDay = 'Monday'
        else deliveryDay = dayNames[todayIdx + 1]
      } else {
        if (todayIdx === 0) deliveryDay = 'Monday'
        else if (todayIdx === 6) deliveryDay = 'Friday'
        else deliveryDay = todayName
      }
    }

    // Calculate delivery date for this day
    const today = new Date()
    const targetDayIdx = dayNames.indexOf(deliveryDay)
    let diff = targetDayIdx - todayIdx
    if (diff < 0) diff += 7
    if (diff === 0 && hour >= 17) diff = 7
    const deliveryDate = new Date(today)
    deliveryDate.setDate(today.getDate() + diff)
    const dateStr = deliveryDate.toISOString().split('T')[0]

    // Also check today's date and yesterday for the current day
    const todayStr = today.toISOString().split('T')[0]
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().split('T')[0]

    // Try delivery date first, then today, then yesterday
    let stopsData = null
    for (const d of [dateStr, todayStr, yesterdayStr]) {
      const { data } = await supabase.from('daily_stops').select('*')
        .eq('delivery_date', d)
      if (data && data.length > 0) {
        stopsData = data
        break
      }
    }

    const allDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    const driverStops = {}

    // Get active drivers to include empty ones
    const { data: activeDrivers } = await supabase.from('drivers').select('*').eq('active', true)

    // Group stops by driver
    const stopsByDriver = {}
    for (const s of (stopsData || [])) {
      const name = s.driver_name
      if (!stopsByDriver[name]) stopsByDriver[name] = []
      stopsByDriver[name].push(s)
    }

    // Build driver data
    for (const driver of (activeDrivers || [])) {
      const name = driver.driver_name
      const id = driver.driver_number
      const stops = stopsByDriver[name] || []

      const stopDetails = stops.map(s => ({
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

      driverStops[name] = {
        tabName: `${name} - ${id}`,
        stops: stopDetails.length,
        coldChain: stopDetails.filter(s => s._coldChain).length,
        hidden: false,
        stopDetails,
      }
    }

    // Unassigned
    const { data: unassigned } = await supabase.from('unassigned_orders').select('*')
      .eq('delivery_date', stopsData?.[0]?.delivery_date || dateStr)
    const unassignedData = (unassigned || []).map(u => ({
      'Order ID': u.order_id,
      'Name': u.patient_name,
      'Address': u.address,
      'City': u.city,
      'ZIP': u.zip,
      'Pharmacy': u.pharmacy,
    }))

    const warnings = []
    if (unassignedData.length > 0) {
      warnings.push({
        type: 'unassigned', severity: 'high',
        message: `${unassignedData.length} unassigned order${unassignedData.length > 1 ? 's' : ''} — ZIPs need routing rules`,
        details: unassignedData.map(u => u.ZIP || 'Unknown').filter(Boolean),
      })
    }

    return res.status(200).json({
      deliveryDay, allDays,
      driverStops,
      summary: null,
      unassigned: unassignedData,
      warnings,
    })
  } catch (err) {
    console.error('Dispatch API error:', err)
    return res.status(500).json({ error: err.message })
  }
}
