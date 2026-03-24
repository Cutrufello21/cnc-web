import { fetchRange, MASTER_SHEET_ID } from './sheets.js'

const WEEKDAYS = new Set(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const period = req.query.period || 'month' // week, month, all

  try {
    const [logRaw, zipRaw, patientRaw, locationRaw, weeklyRaw] = await Promise.all([
      fetchRange(MASTER_SHEET_ID, 'Log!A1:M500'),
      fetchRange(MASTER_SHEET_ID, 'ZIP Analytics!A1:Z50'),
      fetchRange(MASTER_SHEET_ID, 'Patient Analytics!A1:Z50'),
      fetchRange(MASTER_SHEET_ID, 'Location Intelligence!A1:Z30'),
      fetchRange(MASTER_SHEET_ID, 'Weekly Stops!A1:K25'),
    ])

    // Parse log — weekdays only
    const logHeaders = logRaw[0]?.map(h => h.trim()) || []
    const allLogs = logRaw.slice(1).map(row => {
      const obj = {}
      logHeaders.forEach((h, i) => { obj[h] = row[i] || '' })
      return obj
    }).filter(r => r.Date && WEEKDAYS.has(r['Delivery Day']))

    // Period filter
    let logs = allLogs
    if (period === 'week') logs = allLogs.slice(-5)
    else if (period === 'month') logs = allLogs.slice(-60) // ~12 weeks

    // KPIs
    const totalOrders = logs.reduce((s, r) => s + (parseInt(r['Orders Processed']) || 0), 0)
    const totalColdChain = logs.reduce((s, r) => s + (parseInt(r['Cold Chain']) || 0), 0)
    const totalUnassigned = logs.reduce((s, r) => s + (parseInt(r['Unassigned Count']) || 0), 0)
    const totalCorrections = logs.reduce((s, r) => s + (parseInt(r['Corrections']) || 0), 0)
    const shspTotal = logs.reduce((s, r) => s + (parseInt(r['SHSP Orders']) || 0), 0)
    const aultmanTotal = logs.reduce((s, r) => s + (parseInt(r['Aultman Orders']) || 0), 0)
    const avgPerNight = logs.length ? Math.round(totalOrders / logs.length) : 0

    // Volume trend (all logs in period)
    const volumeTrend = logs.map(r => ({
      date: r.Date,
      day: r['Delivery Day'],
      orders: parseInt(r['Orders Processed']) || 0,
      shsp: parseInt(r['SHSP Orders']) || 0,
      aultman: parseInt(r['Aultman Orders']) || 0,
      coldChain: parseInt(r['Cold Chain']) || 0,
      unassigned: parseInt(r['Unassigned Count']) || 0,
    }))

    // Day of week breakdown
    const dayBreakdown = {}
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    dayNames.forEach(d => { dayBreakdown[d] = { orders: 0, count: 0 } })
    logs.forEach(r => {
      const d = r['Delivery Day']
      if (dayBreakdown[d]) {
        dayBreakdown[d].orders += parseInt(r['Orders Processed']) || 0
        dayBreakdown[d].count++
      }
    })
    const dayAvg = dayNames.map(d => ({
      day: d,
      avg: dayBreakdown[d].count ? Math.round(dayBreakdown[d].orders / dayBreakdown[d].count) : 0,
      total: dayBreakdown[d].orders,
    }))

    // Driver leaderboard from weekly stops
    const wsHeaders = weeklyRaw[0]?.map(h => h.trim()) || []
    const driverStats = weeklyRaw.slice(1)
      .map(row => {
        const obj = {}
        wsHeaders.forEach((h, i) => { obj[h] = row[i] || '' })
        return obj
      })
      .filter(r => r['Driver Name'] && r['Driver Name'] !== 'TOTAL' && r['Driver Name'] !== 'Paul')
      .map(d => ({
        name: d['Driver Name'],
        weekTotal: parseInt(d['Week Total']) || 0,
        mon: parseInt(d.Mon) || 0,
        tue: parseInt(d.Tue) || 0,
        wed: parseInt(d.Wed) || 0,
        thu: parseInt(d.Thu) || 0,
        fri: parseInt(d.Fri) || 0,
      }))
      .sort((a, b) => b.weekTotal - a.weekTotal)

    // Top driver from logs
    const driverCounts = {}
    logs.forEach(r => {
      const driver = r['Top Driver']
      if (driver) driverCounts[driver] = (driverCounts[driver] || 0) + 1
    })
    const topDriverOverall = Object.entries(driverCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, timesTop: count }))

    // Parse ZIP Analytics
    const zipHeaders = zipRaw[0]?.map(h => h.trim()) || []
    const topZips = zipRaw.slice(1, 21).map(row => {
      const obj = {}
      zipHeaders.forEach((h, i) => { obj[h] = row[i] || '' })
      return obj
    })

    // Parse Patient Analytics
    const patHeaders = patientRaw[0]?.map(h => h.trim()) || []
    const patientData = patientRaw.slice(1, 21).map(row => {
      const obj = {}
      patHeaders.forEach((h, i) => { obj[h] = row[i] || '' })
      return obj
    })

    // Parse Location Intelligence
    const locHeaders = locationRaw[0]?.map(h => h.trim()) || []
    const topLocations = locationRaw.slice(1, 11).map(row => {
      const obj = {}
      locHeaders.forEach((h, i) => { obj[h] = row[i] || '' })
      return obj
    })

    // Pharmacy split over time (weekly buckets)
    const pharmaSplit = []
    for (let i = 0; i < logs.length; i += 5) {
      const chunk = logs.slice(i, i + 5)
      const s = chunk.reduce((sum, r) => sum + (parseInt(r['SHSP Orders']) || 0), 0)
      const a = chunk.reduce((sum, r) => sum + (parseInt(r['Aultman Orders']) || 0), 0)
      pharmaSplit.push({
        label: chunk[0]?.Date || '',
        shsp: s,
        aultman: a,
      })
    }

    return res.status(200).json({
      period,
      dispatches: logs.length,
      kpis: {
        totalOrders,
        avgPerNight,
        totalColdChain,
        coldChainPct: totalOrders ? Math.round((totalColdChain / totalOrders) * 100) : 0,
        totalUnassigned,
        totalCorrections,
        shspTotal,
        aultmanTotal,
        shspPct: totalOrders ? Math.round((shspTotal / totalOrders) * 100) : 0,
      },
      volumeTrend,
      dayAvg,
      driverLeaderboard: driverStats,
      topDriverOverall,
      topZips,
      patientData,
      topLocations,
      pharmaSplit,
    })
  } catch (err) {
    console.error('[analytics API]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
