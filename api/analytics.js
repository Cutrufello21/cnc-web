import { supabase } from './_lib/supabase.js'

const WEEKDAYS = new Set(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const period = req.query.period || 'month'

  try {
    // Fetch dispatch logs, payroll, and order-based analytics in parallel
    const [logsRes, weeklyRes, zipRes, patientRes, locationRes] = await Promise.all([
      supabase.from('dispatch_logs').select('*').order('date', { ascending: true }),
      supabase.from('payroll').select('*').order('week_of', { ascending: false }).limit(25),
      supabase.rpc('get_zip_analytics'),
      supabase.rpc('get_patient_analytics'),
      supabase.rpc('get_location_analytics'),
    ])

    // Fallback to direct queries if RPCs don't exist yet
    let topZips = zipRes.data || []
    let patientData = patientRes.data || []
    let topLocations = locationRes.data || []

    if (zipRes.error) {
      const { data } = await supabase.from('orders').select('zip')
        .not('zip', 'is', null).not('zip', 'eq', '')
      const zipCounts = {}
      ;(data || []).forEach(r => { zipCounts[r.zip] = (zipCounts[r.zip] || 0) + 1 })
      topZips = Object.entries(zipCounts)
        .sort((a, b) => b[1] - a[1]).slice(0, 20)
        .map(([zip, count]) => ({ ZIP: zip, 'Total Deliveries': count }))
    }
    if (patientRes.error) {
      const { data } = await supabase.from('orders').select('patient_name')
        .not('patient_name', 'is', null).not('patient_name', 'eq', '')
      const patCounts = {}
      ;(data || []).forEach(r => { patCounts[r.patient_name] = (patCounts[r.patient_name] || 0) + 1 })
      patientData = Object.entries(patCounts)
        .sort((a, b) => b[1] - a[1]).slice(0, 20)
        .map(([name, count]) => ({ Name: name, 'Total Deliveries': count }))
    }
    if (locationRes.error) {
      const { data } = await supabase.from('orders').select('address, city, zip')
        .not('address', 'is', null).not('address', 'eq', '')
      const locCounts = {}
      ;(data || []).forEach(r => {
        const key = `${r.address}|${r.city}|${r.zip}`
        locCounts[key] = (locCounts[key] || 0) + 1
      })
      topLocations = Object.entries(locCounts)
        .sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([key, count]) => {
          const [address, city, zip] = key.split('|')
          return { Address: address, City: city, ZIP: zip, 'Total Deliveries': count }
        })
    }

    // Parse logs — weekdays only
    const allLogs = (logsRes.data || []).filter(r => WEEKDAYS.has(r.delivery_day))

    // Period filter
    let logs = allLogs
    if (period === 'week') logs = allLogs.slice(-5)
    else if (period === 'month') logs = allLogs.slice(-60)

    // KPIs
    const totalOrders = logs.reduce((s, r) => s + (r.orders_processed || 0), 0)
    const totalColdChain = logs.reduce((s, r) => s + (r.cold_chain || 0), 0)
    const totalUnassigned = logs.reduce((s, r) => s + (r.unassigned_count || 0), 0)
    const totalCorrections = logs.reduce((s, r) => s + (r.corrections || 0), 0)
    const shspTotal = logs.reduce((s, r) => s + (r.shsp_orders || 0), 0)
    const aultmanTotal = logs.reduce((s, r) => s + (r.aultman_orders || 0), 0)
    const avgPerNight = logs.length ? Math.round(totalOrders / logs.length) : 0

    // Volume trend
    const volumeTrend = logs.map(r => ({
      date: r.date,
      day: r.delivery_day,
      orders: r.orders_processed || 0,
      shsp: r.shsp_orders || 0,
      aultman: r.aultman_orders || 0,
      coldChain: r.cold_chain || 0,
      unassigned: r.unassigned_count || 0,
    }))

    // Day of week breakdown
    const dayBreakdown = {}
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    dayNames.forEach(d => { dayBreakdown[d] = { orders: 0, count: 0 } })
    logs.forEach(r => {
      if (dayBreakdown[r.delivery_day]) {
        dayBreakdown[r.delivery_day].orders += r.orders_processed || 0
        dayBreakdown[r.delivery_day].count++
      }
    })
    const dayAvg = dayNames.map(d => ({
      day: d,
      avg: dayBreakdown[d].count ? Math.round(dayBreakdown[d].orders / dayBreakdown[d].count) : 0,
      total: dayBreakdown[d].orders,
    }))

    // Driver leaderboard from payroll
    const currentWeek = weeklyRes.data?.filter(r => r.week_of === weeklyRes.data[0]?.week_of) || []
    const driverStats = currentWeek
      .filter(r => r.driver_name !== 'Paul')
      .map(d => ({
        name: d.driver_name,
        weekTotal: d.week_total || 0,
        mon: d.mon || 0, tue: d.tue || 0, wed: d.wed || 0,
        thu: d.thu || 0, fri: d.fri || 0,
      }))
      .sort((a, b) => b.weekTotal - a.weekTotal)

    // Top driver from logs
    const driverCounts = {}
    logs.forEach(r => {
      if (r.top_driver) driverCounts[r.top_driver] = (driverCounts[r.top_driver] || 0) + 1
    })
    const topDriverOverall = Object.entries(driverCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([name, count]) => ({ name, timesTop: count }))

    // Pharmacy split over time
    const pharmaSplit = []
    for (let i = 0; i < logs.length; i += 5) {
      const chunk = logs.slice(i, i + 5)
      pharmaSplit.push({
        label: chunk[0]?.date || '',
        shsp: chunk.reduce((s, r) => s + (r.shsp_orders || 0), 0),
        aultman: chunk.reduce((s, r) => s + (r.aultman_orders || 0), 0),
      })
    }

    // === TREND DATA (always computed from ALL logs, not period-filtered) ===
    const allForTrends = allLogs

    // 7-day moving average
    const movingAvg = allForTrends.map((r, i) => {
      const window = allForTrends.slice(Math.max(0, i - 6), i + 1)
      return {
        date: r.date,
        avg: Math.round(window.reduce((s, d) => s + (d.orders_processed || 0), 0) / window.length),
      }
    })

    // Month-over-month: group by YYYY-MM, compute totals and growth
    const byMonth = {}
    allForTrends.forEach(r => {
      const m = r.date?.slice(0, 7)
      if (!m) return
      if (!byMonth[m]) byMonth[m] = { orders: 0, cc: 0, shsp: 0, aultman: 0, days: 0 }
      byMonth[m].orders += r.orders_processed || 0
      byMonth[m].cc += r.cold_chain || 0
      byMonth[m].shsp += r.shsp_orders || 0
      byMonth[m].aultman += r.aultman_orders || 0
      byMonth[m].days++
    })
    const months = Object.keys(byMonth).sort()
    const monthlyTrend = months.map((m, i) => {
      const cur = byMonth[m]
      const prev = i > 0 ? byMonth[months[i - 1]] : null
      const growth = prev && prev.orders > 0 ? Math.round(((cur.orders - prev.orders) / prev.orders) * 100) : null
      const total = cur.orders || 1
      return {
        month: m,
        orders: cur.orders,
        avgPerDay: cur.days ? Math.round(cur.orders / cur.days) : 0,
        growth,
        ccPct: Math.round((cur.cc / total) * 100),
        shspPct: Math.round((cur.shsp / total) * 100),
        aultmanPct: Math.round((cur.aultman / total) * 100),
        shsp: cur.shsp,
        aultman: cur.aultman,
        cc: cur.cc,
        days: cur.days,
      }
    })

    // Group by payroll week (Mon-Fri, labeled by Week Ending Saturday)
    const weekBuckets = {}
    allForTrends.forEach(r => {
      const d = new Date(r.date + 'T12:00:00')
      const day = d.getDay() // 0=Sun..6=Sat
      const satOffset = day === 0 ? 6 : 6 - day
      const sat = new Date(d)
      sat.setDate(d.getDate() + satOffset)
      const key = sat.toISOString().split('T')[0]
      if (!weekBuckets[key]) weekBuckets[key] = []
      weekBuckets[key].push(r)
    })
    const weekKeys = Object.keys(weekBuckets).sort()

    // Cold chain % over time (payroll weeks)
    const ccTrend = weekKeys.map(wk => {
      const rows = weekBuckets[wk]
      const total = rows.reduce((s, r) => s + (r.orders_processed || 0), 0)
      const cc = rows.reduce((s, r) => s + (r.cold_chain || 0), 0)
      return { date: wk, pct: total ? Math.round((cc / total) * 100) : 0, total, cc }
    })

    // SHSP vs Aultman share over time (payroll weeks)
    const pharmaTrend = weekKeys.map(wk => {
      const rows = weekBuckets[wk]
      const shsp = rows.reduce((s, r) => s + (r.shsp_orders || 0), 0)
      const aultman = rows.reduce((s, r) => s + (r.aultman_orders || 0), 0)
      const total = shsp + aultman || 1
      return { date: wk, shsp, aultman, shspPct: Math.round((shsp / total) * 100) }
    })

    return res.status(200).json({
      period,
      dispatches: logs.length,
      kpis: {
        totalOrders, avgPerNight, totalColdChain,
        coldChainPct: totalOrders ? Math.round((totalColdChain / totalOrders) * 100) : 0,
        totalUnassigned, totalCorrections, shspTotal, aultmanTotal,
        shspPct: totalOrders ? Math.round((shspTotal / totalOrders) * 100) : 0,
      },
      volumeTrend, dayAvg, driverLeaderboard: driverStats,
      topDriverOverall, topZips, patientData, topLocations, pharmaSplit,
      movingAvg, monthlyTrend, ccTrend, pharmaTrend,
    })
  } catch (err) {
    console.error('[analytics API]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
