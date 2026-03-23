import { fetchRange, fetchMultipleRanges, getSheetTabs, MASTER_SHEET_ID, DAILY_SHEETS } from './sheets.js'

// GET /api/dispatch — returns all data needed for the dispatch workspace
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const now = new Date()
    const hour = now.getHours()
    const todayIdx = now.getDay()
    const todayName = dayNames[todayIdx]

    // Allow ?day=Monday override from the frontend
    let deliveryDay = req.query.day

    if (!deliveryDay || !DAILY_SHEETS[deliveryDay]) {
      // Smart default: after 5 PM, show next business day (what dispatch just prepared)
      // Before 5 PM, show today's delivery
      if (hour >= 17) {
        // Next business day
        if (todayIdx === 5) deliveryDay = 'Monday'      // Friday evening → Monday
        else if (todayIdx === 6) deliveryDay = 'Monday'  // Saturday → Monday
        else deliveryDay = dayNames[todayIdx + 1]        // Weeknight → tomorrow
      } else {
        // Morning/afternoon — show today's delivery
        if (todayIdx === 0) deliveryDay = 'Monday'       // Sunday → Monday
        else if (todayIdx === 6) deliveryDay = 'Friday'   // Saturday → Friday
        else deliveryDay = todayName
      }
    }

    const dailySheetId = DAILY_SHEETS[deliveryDay]
    const allDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

    // Fetch in parallel: drivers list, routing rules, daily sheet tabs, log
    const [driversRaw, routingRaw, dailyTabs, logRaw, weeklyStopsRaw] = await Promise.all([
      fetchRange(MASTER_SHEET_ID, 'Drivers!A1:F20'),
      fetchRange(MASTER_SHEET_ID, 'Routing Rules!A1:F500'),
      dailySheetId ? getSheetTabs(dailySheetId) : Promise.resolve([]),
      fetchRange(MASTER_SHEET_ID, 'Log!A1:M500'),
      fetchRange(MASTER_SHEET_ID, 'Weekly Stops!A1:J20'),
    ])

    // Parse drivers
    const driverHeaders = driversRaw[0]?.map((h) => h.trim()) || []
    const drivers = driversRaw.slice(1).map((row) => {
      const obj = {}
      driverHeaders.forEach((h, i) => { obj[h] = row[i] || '' })
      return obj
    }).filter((d) => d['Driver Name'])

    // Parse routing rules
    const routingHeaders = routingRaw[0] || []
    const routingRules = routingRaw.slice(1).map((row) => {
      const obj = {}
      routingHeaders.forEach((h, i) => { obj[h.trim()] = row[i] || '' })
      return obj
    })

    // Get all assigned ZIPs from routing rules
    const assignedZips = new Set()
    routingRules.forEach((rule) => {
      if (rule.ZIP) assignedZips.add(rule.ZIP)
    })

    // Now fetch each driver tab from the daily sheet to get stop counts
    const driverTabs = dailyTabs.filter((tab) => {
      const title = tab.title || ''
      // Driver tabs are named like "Bobby - 55493"
      return title.includes(' - ') && !['SHSP Sort', 'Aultman Sort', 'Summary', 'Unassigned'].includes(title)
    })

    // Fetch stop counts for each driver tab + Summary + Unassigned
    let driverStops = {}
    let summaryData = null
    let unassignedData = []

    if (dailySheetId && driverTabs.length > 0) {
      const ranges = [
        ...driverTabs.map((t) => `'${t.title}'!A1:I100`),
        'Summary!A1:D10',
        'Unassigned!A1:K50',
      ]

      const batchResults = await fetchMultipleRanges(dailySheetId, ranges)

      // Parse driver stops — include full stop details
      driverTabs.forEach((tab, i) => {
        const rows = batchResults[i]?.values || []
        if (rows.length < 2) {
          const driverName = tab.title.split(' - ')[0].trim()
          driverStops[driverName] = {
            tabName: tab.title, stops: 0, coldChain: 0,
            hidden: tab.hidden || false, stopDetails: [],
          }
          return
        }
        const headers = rows[0].map((h) => h.trim())
        const dataRows = rows.slice(1).filter((r) => r.length > 0 && r[0])
        const driverName = tab.title.split(' - ')[0].trim()

        const stopDetails = dataRows.map((row) => {
          const obj = {}
          headers.forEach((h, idx) => { obj[h] = row[idx] || '' })
          // Cold Chain column — non-empty means cold chain
          const ccIdx = headers.indexOf('Cold Chain')
          const ccVal = ccIdx >= 0 ? (row[ccIdx] || '').trim() : ''
          obj._coldChain = ccVal !== '' && ccVal.toLowerCase() !== 'no' && ccVal.toLowerCase() !== 'n'
          return obj
        })

        driverStops[driverName] = {
          tabName: tab.title,
          stops: stopDetails.length,
          coldChain: stopDetails.filter((s) => s._coldChain).length,
          hidden: tab.hidden || false,
          stopDetails,
        }
      })

      // Parse summary
      const summaryIdx = batchResults.length - 2
      const summaryRows = batchResults[summaryIdx]?.values || []
      if (summaryRows.length > 0) {
        summaryData = {}
        summaryRows.forEach((row) => {
          if (row[0] && row[1]) summaryData[row[0]] = row[1]
        })
      }

      // Parse unassigned
      const unassignedIdx = batchResults.length - 1
      const unassignedRows = batchResults[unassignedIdx]?.values || []
      if (unassignedRows.length > 1) {
        const uHeaders = unassignedRows[0]
        unassignedData = unassignedRows.slice(1).filter((r) => r[0]).map((row) => {
          const obj = {}
          uHeaders.forEach((h, i) => { obj[h] = row[i] || '' })
          return obj
        })
      }
    }

    // Parse log — get last few entries, weekdays only
    const logHeaders = logRaw[0] || []
    const WEEKDAYS = new Set(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])
    const allLogs = logRaw.slice(1).map((row) => {
      const obj = {}
      logHeaders.forEach((h, i) => { obj[h.trim()] = row[i] || '' })
      return obj
    }).filter((r) => r.Date && WEEKDAYS.has(r['Delivery Day']))
    const recentLogs = allLogs.slice(-7).reverse()

    // Parse Weekly Stops for stop totals
    const wsHeaders = weeklyStopsRaw[0]?.map((h) => h.trim()) || []
    const weeklyStops = weeklyStopsRaw.slice(1).map((row) => {
      const obj = {}
      wsHeaders.forEach((h, i) => { obj[h] = row[i] || '' })
      return obj
    }).filter((r) => r[wsHeaders[0]])

    // Build warnings
    const warnings = []

    // Unassigned orders warning
    if (unassignedData.length > 0) {
      warnings.push({
        type: 'unassigned',
        severity: 'high',
        message: `${unassignedData.length} unassigned order${unassignedData.length > 1 ? 's' : ''} — ZIPs need routing rules`,
        details: unassignedData.map((u) => u.ZIP || 'Unknown').filter(Boolean),
      })
    }

    // TODO: Calendar day-off conflicts would go here
    // (Requires Google Calendar API integration)

    return res.status(200).json({
      deliveryDay,
      allDays,
      drivers: drivers.map((d) => ({
        ...d,
        stops: driverStops[d['Driver Name']]?.stops ?? 0,
        coldChain: driverStops[d['Driver Name']]?.coldChain ?? 0,
        hidden: driverStops[d['Driver Name']]?.hidden ?? false,
        tabName: driverStops[d['Driver Name']]?.tabName ?? '',
        stopDetails: driverStops[d['Driver Name']]?.stopDetails ?? [],
      })),
      summary: summaryData,
      unassigned: unassignedData,
      warnings,
      recentLogs,
      weeklyStops,
      routingRuleCount: routingRules.length,
      assignedZipCount: assignedZips.size,
    })
  } catch (err) {
    console.error('Dispatch API error:', err)
    return res.status(500).json({ error: err.message })
  }
}
