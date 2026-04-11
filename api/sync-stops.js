// POST /api/sync-stops
// Syncs Google Sheets driver tabs → Supabase daily_stops for the current week
// Called automatically by payroll page to ensure stop counts are up to date

import { fetchMultipleRanges, getSheetTabs, DAILY_SHEETS } from './_lib/sheets.js'
import { supabase } from './_lib/supabase.js'

const SKIP_TABS = new Set(['SHSP Sort', 'Aultman Sort', 'Summary', 'Unassigned'])

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    // Figure out target week's dates
    const now = new Date()
    const dayOfWeek = now.getDay()
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const monday = new Date(now)
    monday.setDate(now.getDate() + mondayOffset)

    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    const dayDates = {}
    dayNames.forEach((name, i) => {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      dayDates[name] = d.toISOString().split('T')[0]
    })

    let totalSynced = 0
    const results = {}

    for (const [dayName, sheetId] of Object.entries(DAILY_SHEETS)) {
      if (!sheetId) continue
      const deliveryDate = dayDates[dayName]

      try {
        const tabs = await getSheetTabs(sheetId)
        const driverTabs = tabs.filter(t => {
          const title = t.title || ''
          return title.includes(' - ') && !SKIP_TABS.has(title)
        })

        if (driverTabs.length === 0) {
          results[dayName] = { stops: 0, drivers: 0 }
          continue
        }

        // Read all driver tabs — use A1:I500 to avoid truncation
        const ranges = driverTabs.map(t => `'${t.title}'!A1:I500`)
        const batchData = await fetchMultipleRanges(sheetId, ranges)

        const rows = []
        driverTabs.forEach((tab, i) => {
          const data = batchData[i]?.values || []
          if (data.length < 2) return

          const headers = data[0].map(h => h.trim())
          const driverName = tab.title.split(' - ')[0].trim()
          const driverNumber = tab.title.split(' - ')[1]?.trim() || ''

          const orderIdIdx = headers.indexOf('Order ID')
          const nameIdx = headers.indexOf('Name')
          const addrIdx = headers.indexOf('Address')
          const cityIdx = headers.indexOf('City')
          const zipIdx = headers.indexOf('Zip Code') >= 0 ? headers.indexOf('Zip Code') : headers.indexOf('ZIP')
          const pharmaIdx = headers.indexOf('Pharmacy')
          const ccIdx = headers.indexOf('Cold Chain')
          const dispatchIdx = headers.indexOf('Dispatch Driver #')
          const assignedIdx = headers.indexOf('Assigned Driver #')

          data.slice(1).forEach(row => {
            if (!row.some(c => c?.trim())) return
            const ccVal = (ccIdx >= 0 ? (row[ccIdx] || '') : '').trim().toLowerCase()

            rows.push({
              delivery_date: deliveryDate,
              delivery_day: dayName,
              driver_name: driverName,
              driver_number: driverNumber,
              order_id: orderIdIdx >= 0 ? (row[orderIdIdx] || '') : '',
              patient_name: nameIdx >= 0 ? (row[nameIdx] || '') : '',
              address: addrIdx >= 0 ? (row[addrIdx] || '') : '',
              city: cityIdx >= 0 ? (row[cityIdx] || '') : '',
              zip: zipIdx >= 0 ? (row[zipIdx] || '') : '',
              pharmacy: pharmaIdx >= 0 ? (row[pharmaIdx] || '') : '',
              cold_chain: ccVal !== '' && ccVal !== 'no' && ccVal !== 'n',
              dispatch_driver_number: dispatchIdx >= 0 ? (row[dispatchIdx] || '') : '',
              assigned_driver_number: assignedIdx >= 0 ? (row[assignedIdx] || '') : '',
              status: 'dispatched',
            })
          })
        })

        if (rows.length > 0) {
          // Delete existing and re-insert (full refresh per day)
          await supabase.from('daily_stops').delete().eq('delivery_date', deliveryDate)
          for (let i = 0; i < rows.length; i += 500) {
            const { error } = await supabase.from('daily_stops').insert(rows.slice(i, i + 500))
            if (error) console.error(`[sync-stops] ${dayName}: ${error.message}`)
          }
        }

        results[dayName] = { stops: rows.length, drivers: driverTabs.length }
        totalSynced += rows.length
      } catch (dayErr) {
        console.error(`[sync-stops] ${dayName}:`, dayErr.message)
        results[dayName] = { error: dayErr.message }
      }
    }

    return res.status(200).json({ success: true, total: totalSynced, days: results })
  } catch (err) {
    console.error('[sync-stops]', err)
    return res.status(500).json({ error: err.message })
  }
}
