import { fetchRange, updateCell, MASTER_SHEET_ID } from './sheets.js'

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
    // For now, mark as approved. Email sending would need Gmail API or SMTP.
    return res.status(200).json({
      success: true,
      message: 'Payroll approved. Ready to send to accountant.',
      approvedAt: new Date().toISOString(),
    })
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
