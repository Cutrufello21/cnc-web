import { fetchRange, updateCell, fetchMultipleRanges, getSheetTabs, MASTER_SHEET_ID, DAILY_SHEETS } from './_lib/sheets.js'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const SNAPSHOT_PATH = join(process.env.HOME || '/tmp', '.cnc-payroll-snapshot.json')
function loadSnapshot() { try { if (existsSync(SNAPSHOT_PATH)) return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) } catch {} return null }
function saveSnapshot(data) { try { writeFileSync(SNAPSHOT_PATH, JSON.stringify(data, null, 2)) } catch {} }

// Per-stop rates from cnc-dispatch
const RATES = {
  Adam:     { mth: 6.75, wf: 8.25 },
  Alex:     { mth: 6.75, wf: 6.75 },
  Jake:     { mth: 6.75, wf: 6.75 },
  Josh:     { mth: 6.50, wf: 6.50 },
  Kasey:    { mth: 7.00, wf: 7.00 },
  Laura:    { mth: 7.00, wf: 7.00 },
  Nick:     { mth: 7.00, wf: 7.00 },
  Bobby:    { mth: 7.35, wf: 7.35 },
  Theresa:  { mth: 7.00, wf: 7.00 },
  Rob:      { mth: 6.50, wf: 6.50 },
  Mike:     { mth: 8.25, wf: 8.25 },
  Tara:     { mth: 8.25, wf: 8.25 },
  Nicholas: { mth: 8.35, wf: 8.35 },
}

const OFFICE_FEES = {
  Adam: -35, Alex: -35, Josh: -35, Nick: -35, Bobby: -35, Theresa: -35,
  Kasey: -25, Laura: -25,
}

const FLAT_SALARY = {
  Mark: 1550,
  Dom: 2500,
  Paul: 2000,
}

// GET /api/payroll — returns payroll data with calculated pay
export default async function handler(req, res) {
  if (req.method === 'GET' && req.query.snapshot === 'true') {
    return handleSnapshot(req, res)
  }
  if (req.method === 'GET') {
    return handleGet(req, res)
  }
  if (req.method === 'POST') {
    return handlePost(req, res)
  }
  return res.status(405).json({ error: 'Method not allowed' })
}

async function handleGet(req, res) {
  try {
    const rows = await fetchRange(MASTER_SHEET_ID, 'Weekly Stops!A1:K25')
    if (rows.length < 2) return res.status(200).json({ drivers: [], total: {} })

    const headers = rows[0].map(h => h.trim())
    const drivers = []
    let totalRow = null

    for (let i = 1; i < rows.length; i++) {
      const obj = {}
      headers.forEach((h, j) => { obj[h] = rows[i][j] || '' })
      const name = obj['Driver Name']
      if (!name) continue
      if (name === 'TOTAL') {
        totalRow = obj
        continue
      }

      const mon = parseInt(obj.Mon) || 0
      const tue = parseInt(obj.Tue) || 0
      const wed = parseInt(obj.Wed) || 0
      const thu = parseInt(obj.Thu) || 0
      const fri = parseInt(obj.Fri) || 0
      const weekTotal = mon + tue + wed + thu + fri
      const willCalls = parseInt(obj['Will Calls']) || 0
      const officeFee = OFFICE_FEES[name] || 0
      const rate = RATES[name]
      const flatSalary = FLAT_SALARY[name]

      let calculatedPay = 0
      if (flatSalary) {
        calculatedPay = flatSalary
      } else if (name === 'Brad') {
        // Brad is manual entry
        calculatedPay = parseFloat((obj['Weekly Pay'] || '0').replace(/[$,]/g, '')) || 0
      } else if (rate) {
        // (stops per day × day rate) + (will calls × $9) - office fee
        const mthStops = mon + tue + thu
        const wfStops = wed + fri
        calculatedPay = (mthStops * rate.mth) + (wfStops * rate.wf) + (willCalls * 9)
        if (weekTotal > 0 || willCalls > 0) {
          calculatedPay += officeFee // officeFee is negative
        } else {
          calculatedPay = 0 // Zero-stop protection
        }
      }

      // Parse the sheet's Weekly Pay value for comparison
      const sheetPay = parseFloat((obj['Weekly Pay'] || '0').replace(/[$,]/g, '')) || 0

      drivers.push({
        name,
        id: obj['Driver #'],
        mon, tue, wed, thu, fri,
        weekTotal,
        willCalls,
        officeFee,
        rate: rate || null,
        flatSalary: flatSalary || null,
        calculatedPay: Math.round(calculatedPay * 100) / 100,
        sheetPay,
        isBrad: name === 'Brad',
        isFlat: !!flatSalary,
        rowIndex: i + 1, // 1-indexed sheet row
      })
    }

    const grandTotal = drivers.reduce((sum, d) => sum + d.calculatedPay, 0)

    return res.status(200).json({
      drivers,
      grandTotal: Math.round(grandTotal * 100) / 100,
      sheetTotal: totalRow ? parseFloat((totalRow['Weekly Pay'] || '0').replace(/[$,]/g, '')) : 0,
    })
  } catch (err) {
    console.error('[payroll GET]', err.message)
    return res.status(500).json({ error: err.message })
  }
}

// POST /api/payroll — update a driver's Weekly Pay or Will Calls
// Body: { driver, field, value } or { action: 'approve', email: 'mcutrufello2121@gmail.com' }
async function handlePost(req, res) {
  let body = ''
  await new Promise((resolve) => {
    req.on('data', (chunk) => { body += chunk })
    req.on('end', resolve)
  })

  const data = JSON.parse(body)

  if (data.action === 'approve') {
    return res.status(200).json({ success: true, approvedAt: new Date().toISOString() })
  }

  if (data.action === 'reset-snapshot') {
    saveSnapshot({ drivers: {}, weekOf: '', resetAt: new Date().toISOString() })
    return res.status(200).json({ success: true, message: 'Snapshot reset' })
  }

  // Update a cell in Weekly Stops
  const { driverRow, field, value } = data
  if (!driverRow || !field) {
    return res.status(400).json({ error: 'Missing driverRow or field' })
  }

  const colMap = {
    'Will Calls': 'I',
    'Weekly Pay': 'K',
    'Mon': 'C', 'Tue': 'D', 'Wed': 'E', 'Thu': 'F', 'Fri': 'G',
  }

  const col = colMap[field]
  if (!col) return res.status(400).json({ error: `Invalid field: ${field}` })

  try {
    const cellRange = `Weekly Stops!${col}${driverRow}`
    await updateCell(MASTER_SHEET_ID, cellRange, value)
    return res.status(200).json({ success: true, cell: cellRange, value })
  } catch (err) {
    console.error('[payroll POST]', err.message)
    return res.status(500).json({ error: err.message })
  }
}

async function handleSnapshot(req, res) {
  try {
    let snapshot = loadSnapshot()
    const now = new Date()
    const dayOfWeek = now.getDay()
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const monday = new Date(now)
    monday.setDate(now.getDate() + mondayOffset)
    const weekOf = `${monday.getMonth() + 1}/${monday.getDate()}/${monday.getFullYear()}`

    if (!snapshot || snapshot.weekOf !== weekOf) {
      snapshot = { drivers: {}, weekOf, createdAt: new Date().toISOString() }
    }

    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    const dayAbbrevs = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

    for (let di = 0; di < dayNames.length; di++) {
      const sheetId = DAILY_SHEETS[dayNames[di]]
      if (!sheetId) continue
      try {
        const tabs = await getSheetTabs(sheetId)
        const driverTabs = tabs.filter(t => t.title.includes(' - ') && !['SHSP Sort','Aultman Sort','Summary','Unassigned'].includes(t.title))
        if (!driverTabs.length) continue
        const ranges = driverTabs.map(t => `'${t.title}'!A1:A200`)
        const results = await fetchMultipleRanges(sheetId, ranges)
        driverTabs.forEach((tab, i) => {
          const rows = results[i]?.values || []
          const stopCount = rows.length > 1 ? rows.slice(1).filter(r => r[0]?.trim()).length : 0
          const name = tab.title.split(' - ')[0].trim()
          if (!snapshot.drivers[name]) snapshot.drivers[name] = { name, id: tab.title.split(' - ')[1] || '', Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0 }
          snapshot.drivers[name][dayAbbrevs[di]] = Math.max(snapshot.drivers[name][dayAbbrevs[di]] || 0, stopCount)
        })
      } catch {}
    }

    const weeklyRows = await fetchRange(MASTER_SHEET_ID, 'Weekly Stops!A1:K25')
    const wsHeaders = weeklyRows[0]?.map(h => h.trim()) || []
    weeklyRows.slice(1).forEach(row => {
      const name = row[0]?.trim()
      if (!name || name === 'TOTAL' || name === 'Paul') return
      if (!snapshot.drivers[name]) snapshot.drivers[name] = { name, id: row[wsHeaders.indexOf('Driver #')] || '', Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0 }
      dayAbbrevs.forEach(d => {
        const idx = wsHeaders.indexOf(d)
        if (idx >= 0) snapshot.drivers[name][d] = Math.max(snapshot.drivers[name][d] || 0, parseInt(row[idx]) || 0)
      })
    })

    saveSnapshot(snapshot)
    const drivers = Object.values(snapshot.drivers).map(d => ({ ...d, weekTotal: (d.Mon||0)+(d.Tue||0)+(d.Wed||0)+(d.Thu||0)+(d.Fri||0) }))

    return res.status(200).json({ weekOf, drivers, lastUpdated: new Date().toISOString() })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
