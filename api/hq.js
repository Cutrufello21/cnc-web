import { fetchRange, fetchMultipleRanges, MASTER_SHEET_ID } from './sheets.js'

// GET /api/hq — returns aggregated data for the HQ dashboard
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const [
      logRaw,
      weeklyRaw,
      driversRaw,
      ordersRaw,
      unassignedRaw,
      zipRaw,
      patientRaw,
    ] = await Promise.all([
      fetchRange(MASTER_SHEET_ID, 'Log!A1:M500'),
      fetchRange(MASTER_SHEET_ID, 'Weekly Stops!A1:J20'),
      fetchRange(MASTER_SHEET_ID, 'Drivers!A1:F20'),
      fetchRange(MASTER_SHEET_ID, 'Orders!A1:K2'),   // Just headers + count trick
      fetchRange(MASTER_SHEET_ID, 'Unassigned History!A1:F500'),
      fetchRange(MASTER_SHEET_ID, 'ZIP Analytics!A1:F30'),
      fetchRange(MASTER_SHEET_ID, 'Patient Analytics!A1:F30'),
    ])

    // Parse log — filter to Mon-Fri delivery days only
    const logHeaders = logRaw[0]?.map(h => h.trim()) || []
    const WEEKDAYS = new Set(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])
    const logData = logRaw.slice(1).map(row => {
      const obj = {}
      logHeaders.forEach((h, i) => { obj[h] = row[i] || '' })
      return obj
    }).filter(r => r.Date && WEEKDAYS.has(r['Delivery Day']))

    // Recent 7 logs (weekdays only)
    const recentLogs = logData.slice(-7).reverse()

    // Last dispatch info
    const lastDispatch = logData[logData.length - 1] || {}

    // Volume trends — last 30 dispatches
    const last30 = logData.slice(-30)
    const totalOrders = last30.reduce((sum, r) => sum + (parseInt(r['Orders Processed']) || 0), 0)
    const avgOrders = last30.length ? Math.round(totalOrders / last30.length) : 0
    const totalColdChain = last30.reduce((sum, r) => sum + (parseInt(r['Cold Chain']) || 0), 0)

    // SHSP vs Aultman split
    const shspTotal = last30.reduce((sum, r) => sum + (parseInt(r['SHSP Orders']) || 0), 0)
    const aultmanTotal = last30.reduce((sum, r) => sum + (parseInt(r['Aultman Orders']) || 0), 0)

    // Week over week
    const thisWeek = logData.slice(-5)
    const lastWeek = logData.slice(-10, -5)
    const thisWeekOrders = thisWeek.reduce((sum, r) => sum + (parseInt(r['Orders Processed']) || 0), 0)
    const lastWeekOrders = lastWeek.reduce((sum, r) => sum + (parseInt(r['Orders Processed']) || 0), 0)
    const wowChange = lastWeekOrders ? Math.round(((thisWeekOrders - lastWeekOrders) / lastWeekOrders) * 100) : 0

    // Weekly stops / driver leaderboard
    const wsHeaders = weeklyRaw[0]?.map(h => h.trim()) || []
    const weeklyStops = weeklyRaw.slice(1)
      .map(row => {
        const obj = {}
        wsHeaders.forEach((h, i) => { obj[h] = row[i] || '' })
        return obj
      })
      .filter(r => r['Driver Name'] && r['Driver Name'] !== 'TOTAL' && r['Driver Name'] !== 'Paul')

    const leaderboard = weeklyStops
      .map(d => ({
        name: d['Driver Name'],
        id: d['Driver #'],
        weekTotal: parseInt(d['Week Total']) || 0,
        mon: parseInt(d['Mon']) || 0,
        tue: parseInt(d['Tue']) || 0,
        wed: parseInt(d['Wed']) || 0,
        thu: parseInt(d['Thu']) || 0,
        fri: parseInt(d['Fri']) || 0,
      }))
      .sort((a, b) => b.weekTotal - a.weekTotal)

    // Active drivers count
    const activeThisWeek = leaderboard.filter(d => d.weekTotal > 0).length

    // Parse drivers
    const driverHeaders = driversRaw[0]?.map(h => h.trim()) || []
    const driverCount = driversRaw.slice(1).filter(r => r[0]).length

    // Unassigned history — recent
    const uhHeaders = unassignedRaw[0]?.map(h => h.trim()) || []
    const recentUnassigned = unassignedRaw.slice(-10).reverse().map(row => {
      const obj = {}
      uhHeaders.forEach((h, i) => { obj[h] = row[i] || '' })
      return obj
    }).filter(r => r.Date || r.ZIP)

    // Top ZIPs
    const zipHeaders = zipRaw[0]?.map(h => h.trim()) || []
    const topZips = zipRaw.slice(1, 11).map(row => {
      const obj = {}
      zipHeaders.forEach((h, i) => { obj[h] = row[i] || '' })
      return obj
    })

    // Volume chart data (last 14 dispatches)
    const volumeChart = logData.slice(-14).map(r => ({
      date: r.Date,
      day: r['Delivery Day'],
      orders: parseInt(r['Orders Processed']) || 0,
      shsp: parseInt(r['SHSP Orders']) || 0,
      aultman: parseInt(r['Aultman Orders']) || 0,
      coldChain: parseInt(r['Cold Chain']) || 0,
    }))

    // All-time stats
    const allTimeOrders = logData.reduce((sum, r) => sum + (parseInt(r['Orders Processed']) || 0), 0)

    return res.status(200).json({
      lastDispatch,
      kpis: {
        totalOrdersLast30: totalOrders,
        avgOrdersPerNight: avgOrders,
        coldChainLast30: totalColdChain,
        shspTotal,
        aultmanTotal,
        thisWeekOrders,
        lastWeekOrders,
        wowChange,
        activeDrivers: activeThisWeek,
        totalDrivers: driverCount,
        allTimeOrders,
        totalDispatches: logData.length,
      },
      leaderboard,
      recentLogs,
      recentUnassigned,
      topZips,
      volumeChart,
    })
  } catch (err) {
    console.error('[hq API]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
