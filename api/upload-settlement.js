// Parse OpenForce settlement Excel and store revenue per driver per week
import { supabase } from './_lib/supabase.js'
import XLSX from 'xlsx'

// Map OpenForce names (LAST, FIRST) to driver_name (First) in our system
const NAME_MAP = {
  'BERNDT, TARA': 'Tara',
  'BOTTORFF, BRADLEY': 'Brad',
  'CABINESS, THERESA': 'Theresa',
  'CHISNELL, MICHAEL': 'Mike',
  'CUTRUFELLO, DOMINIC': 'Dom',
  'CUTRUFELLO, MARK': 'Mark',
  'EAGER, NICHOLAS': 'Nick', // Nick Eager — was 'Nicholas' in old payroll
  'EVANS, LAURA': 'Laura',
  'HARVEY, KASEY': 'Kasey',
  'MILLER, ROBERT': 'Bobby',
  'POLLACK, NICK': 'Nick P',
  'REED, ALEXANDER': 'Alex',
  'ROBERTS JR, ROBERT': 'Rob',
  'SHONDEL, ADAM': 'Adam',
  'SHONDEL, JACOB': 'Jake',
  'YEAGER, JOSHUA': 'Josh',
}

function matchDriverName(ofName) {
  // "Commission - BERNDT, TARA Lea" → "BERNDT, TARA"
  const cleaned = ofName.replace(/^Commission\s*-\s*/i, '').trim()
  // Try exact match first
  for (const [key, val] of Object.entries(NAME_MAP)) {
    if (cleaned.toUpperCase().startsWith(key)) return val
  }
  // Fallback: return first name capitalized
  const parts = cleaned.split(',')
  if (parts.length >= 2) {
    const first = parts[1].trim().split(' ')[0]
    return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
  }
  return cleaned
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  try {
    // Read raw body as buffer
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const buffer = Buffer.concat(chunks)

    // Parse Excel
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })

    // Find the sheet with commission data (usually first or "Commissions" sheet)
    let ws = null
    for (const name of wb.SheetNames) {
      const sheet = wb.Sheets[name]
      const json = XLSX.utils.sheet_to_json(sheet, { header: 1 })
      // Look for a row that contains "Incomes" or "Commission"
      if (json.some(row => row.some(cell => String(cell || '').includes('Commission')))) {
        ws = json
        break
      }
    }

    if (!ws) {
      // Try first sheet
      ws = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })
    }

    // Find settlement date columns
    // Excel dates can be: Date objects, strings "2026-01-02 00:00:00", numbers (serial), or "YYYY-MM-DD"
    let dateRow = null
    const dates = []

    function parseExcelDate(val) {
      if (val == null) return null
      // Already a Date
      if (val instanceof Date && !isNaN(val.getTime())) return val.toISOString().split('T')[0]
      // Excel serial number (e.g. 46023)
      if (typeof val === 'number' && val > 40000 && val < 60000) {
        const d = new Date((val - 25569) * 86400000)
        if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
      }
      // String date
      const s = String(val).trim()
      const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
      if (match) return `${match[1]}-${match[2]}-${match[3]}`
      // MM/DD/YYYY
      const match2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
      if (match2) return `${match2[3]}-${match2[1].padStart(2,'0')}-${match2[2].padStart(2,'0')}`
      return null
    }

    for (const row of ws) {
      const rowDates = []
      for (let i = 3; i < row.length; i++) {
        const parsed = parseExcelDate(row[i])
        if (parsed) rowDates.push({ col: i, date: parsed })
      }
      if (rowDates.length >= 2) {
        dateRow = row
        dates.push(...rowDates)
        break
      }
    }

    if (dates.length === 0) {
      return res.status(400).json({ error: 'Could not find settlement dates in the file. Make sure this is an OpenForce settlement export.' })
    }

    // Parse commission rows
    const records = []
    for (const row of ws) {
      const desc = String(row[2] || '')
      if (!desc.includes('Commission -')) continue
      if (desc.includes('Total')) continue

      const driverName = matchDriverName(desc)

      for (const { col, date } of dates) {
        const amount = parseFloat(row[col])
        if (!isNaN(amount) && amount > 0) {
          records.push({
            week_of: date,
            driver_name: driverName,
            revenue: amount,
            source: 'openforce',
          })
        }
      }
    }

    if (records.length === 0) {
      return res.status(400).json({ error: 'No commission data found in file' })
    }

    // Upsert to Supabase
    const { data: upserted, error } = await supabase
      .from('settlements')
      .upsert(records, { onConflict: 'week_of,driver_name' })
      .select()

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    // Summarize
    const weeks = [...new Set(records.map(r => r.week_of))].sort()
    const totalRevenue = records.reduce((s, r) => s + r.revenue, 0)
    const driverCount = new Set(records.map(r => r.driver_name)).size

    return res.json({
      success: true,
      weeks,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      driverCount,
      recordCount: records.length,
      records: records.map(r => ({ ...r, revenue: Math.round(r.revenue * 100) / 100 })),
    })
  } catch (err) {
    console.error('[upload-settlement]', err)
    return res.status(500).json({ error: err.message })
  }
}
