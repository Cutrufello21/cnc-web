import { fetchMultipleRanges, getSheetTabs, DAILY_SHEETS } from './_lib/sheets.js'

// GET /api/dispatch — returns daily stop assignments from Google Sheets
// Supabase data (drivers, routing, logs) is now fetched directly by the frontend

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

    let deliveryDay = req.query.day

    if (!deliveryDay || !DAILY_SHEETS[deliveryDay]) {
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

    const dailySheetId = DAILY_SHEETS[deliveryDay]
    const allDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

    // Fetch daily driver tabs from Google Sheets
    const dailyTabs = dailySheetId ? await getSheetTabs(dailySheetId) : []

    const driverTabs = dailyTabs.filter((tab) => {
      const title = tab.title || ''
      return title.includes(' - ') && !['SHSP Sort', 'Aultman Sort', 'Summary', 'Unassigned'].includes(title)
    })

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

    // Build warnings
    const warnings = []
    if (unassignedData.length > 0) {
      warnings.push({
        type: 'unassigned', severity: 'high',
        message: `${unassignedData.length} unassigned order${unassignedData.length > 1 ? 's' : ''} — ZIPs need routing rules`,
        details: unassignedData.map((u) => u.ZIP || 'Unknown').filter(Boolean),
      })
    }

    return res.status(200).json({
      deliveryDay, allDays,
      driverStops,
      summary: summaryData,
      unassigned: unassignedData,
      warnings,
    })
  } catch (err) {
    console.error('Dispatch API error:', err)
    return res.status(500).json({ error: err.message })
  }
}
