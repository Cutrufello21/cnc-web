import { fetchRange, MASTER_SHEET_ID, DAILY_SHEETS } from './sheets.js'
import { fetchMultipleRanges, getSheetTabs } from './sheets.js'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const SNAPSHOT_PATH = join(process.env.HOME || '/tmp', '.cnc-payroll-snapshot.json')

function loadSnapshot() {
  try {
    if (existsSync(SNAPSHOT_PATH)) {
      return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'))
    }
  } catch {}
  return null
}

function saveSnapshot(data) {
  try {
    writeFileSync(SNAPSHOT_PATH, JSON.stringify(data, null, 2))
  } catch {}
}

// GET /api/payroll-snapshot — returns accumulated Mon-Fri payroll data
// POST /api/payroll-snapshot — { action: 'reset' } clears snapshot after payroll sent
export default async function handler(req, res) {
  if (req.method === 'POST') {
    let body = ''
    await new Promise((resolve) => {
      req.on('data', (chunk) => { body += chunk })
      req.on('end', resolve)
    })
    const data = JSON.parse(body)
    if (data.action === 'reset') {
      saveSnapshot({ drivers: {}, weekOf: '', resetAt: new Date().toISOString() })
      return res.status(200).json({ success: true, message: 'Payroll snapshot reset' })
    }
    return res.status(400).json({ error: 'Invalid action' })
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    // Load existing snapshot
    let snapshot = loadSnapshot()

    // Determine current week's Monday date
    const now = new Date()
    const dayOfWeek = now.getDay()
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const monday = new Date(now)
    monday.setDate(now.getDate() + mondayOffset)
    const weekOf = `${monday.getMonth() + 1}/${monday.getDate()}/${monday.getFullYear()}`

    // If snapshot is from a different week or doesn't exist, start fresh
    if (!snapshot || snapshot.weekOf !== weekOf) {
      snapshot = { drivers: {}, weekOf, createdAt: new Date().toISOString() }
    }

    // Fetch stop counts from each daily sheet to build/update the snapshot
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    const dayAbbrevs = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

    for (let di = 0; di < dayNames.length; di++) {
      const dayName = dayNames[di]
      const dayAbbr = dayAbbrevs[di]
      const sheetId = DAILY_SHEETS[dayName]
      if (!sheetId) continue

      try {
        const tabs = await getSheetTabs(sheetId)
        const driverTabs = tabs.filter(t => t.title.includes(' - ') &&
          !['SHSP Sort', 'Aultman Sort', 'Summary', 'Unassigned'].includes(t.title))

        if (driverTabs.length === 0) continue

        const ranges = driverTabs.map(t => `'${t.title}'!A1:A200`)
        const results = await fetchMultipleRanges(sheetId, ranges)

        driverTabs.forEach((tab, i) => {
          const rows = results[i]?.values || []
          const stopCount = rows.length > 1 ? rows.slice(1).filter(r => r[0]?.trim()).length : 0
          const driverName = tab.title.split(' - ')[0].trim()

          if (!snapshot.drivers[driverName]) {
            snapshot.drivers[driverName] = {
              name: driverName,
              id: tab.title.split(' - ')[1] || '',
              Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0,
            }
          }

          // Only update if we got real data (> 0) or if today is past this day
          const dayIdx = dayNames.indexOf(dayName)
          const todayIdx = now.getDay() === 0 ? 6 : now.getDay() - 1 // 0=Mon, 4=Fri

          if (stopCount > 0 || todayIdx > dayIdx) {
            // Keep the higher value — don't let a cleared sheet erase accumulated data
            snapshot.drivers[driverName][dayAbbr] = Math.max(
              snapshot.drivers[driverName][dayAbbr] || 0,
              stopCount
            )
          }
        })
      } catch {
        // Skip days that fail (e.g., sheet not populated yet)
      }
    }

    // Also pull from Weekly Stops for any data we might have missed
    const weeklyRows = await fetchRange(MASTER_SHEET_ID, 'Weekly Stops!A1:K25')
    const wsHeaders = weeklyRows[0]?.map(h => h.trim()) || []

    weeklyRows.slice(1).forEach(row => {
      const name = row[0]?.trim()
      if (!name || name === 'TOTAL' || name === 'Paul') return

      const idIdx = wsHeaders.indexOf('Driver #')
      const id = idIdx >= 0 ? row[idIdx] || '' : ''

      if (!snapshot.drivers[name]) {
        snapshot.drivers[name] = { name, id, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0 }
      }

      // Merge — take the max of snapshot vs sheet for each day
      dayAbbrevs.forEach(d => {
        const idx = wsHeaders.indexOf(d)
        if (idx >= 0) {
          const sheetVal = parseInt(row[idx]) || 0
          snapshot.drivers[name][d] = Math.max(snapshot.drivers[name][d] || 0, sheetVal)
        }
      })

      if (!snapshot.drivers[name].id && id) {
        snapshot.drivers[name].id = id
      }
    })

    // Save updated snapshot
    saveSnapshot(snapshot)

    // Build response with totals
    const drivers = Object.values(snapshot.drivers).map(d => ({
      ...d,
      weekTotal: (d.Mon || 0) + (d.Tue || 0) + (d.Wed || 0) + (d.Thu || 0) + (d.Fri || 0),
    }))

    // Add Paul (flat salary, no stops)
    if (!snapshot.drivers['Paul']) {
      drivers.push({ name: 'Paul', id: '—', Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, weekTotal: 0 })
    }

    return res.status(200).json({
      weekOf,
      drivers,
      snapshotAge: snapshot.createdAt,
      lastUpdated: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[payroll-snapshot]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
