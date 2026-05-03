// Restore correct zip on daily_stops by matching OrderID against a Trellis CSV.
// Usage: node scripts/restore-zips-from-csv.mjs <csv-path> <delivery-date YYYY-MM-DD>

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const envText = readFileSync(join(here, '..', '.env'), 'utf8')
const env = Object.fromEntries(envText.split('\n').filter(Boolean).map(l => {
  const i = l.indexOf('=')
  return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '')]
}))
const SUPABASE_URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

const [csvPath, deliveryDate] = process.argv.slice(2)
if (!csvPath || !deliveryDate) {
  console.error('Usage: node scripts/restore-zips-from-csv.mjs <csv> <YYYY-MM-DD>')
  process.exit(1)
}

function parseCSV(text) {
  const rows = []
  let row = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') inQuotes = false
      else cell += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') { row.push(cell); cell = '' }
      else if (c === '\n' || c === '\r') {
        if (cell || row.length) { row.push(cell); rows.push(row); row = []; cell = '' }
        if (c === '\r' && text[i + 1] === '\n') i++
      } else cell += c
    }
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows
}

const text = readFileSync(csvPath, 'utf8')
const rows = parseCSV(text)
const headers = rows[0].map(h => h.trim())
const orderIdx = headers.findIndex(h => h.toLowerCase() === 'orderid')
const zipIdx = headers.findIndex(h => h.toLowerCase() === 'destzip')
const cityIdx = headers.findIndex(h => h.toLowerCase() === 'destcity')
if (orderIdx < 0 || zipIdx < 0) {
  console.error('Missing OrderID or DestZip in CSV header:', headers)
  process.exit(1)
}

const csvByOrderId = new Map()
for (const r of rows.slice(1)) {
  const id = (r[orderIdx] || '').trim()
  if (!id) continue
  csvByOrderId.set(id, { zip: (r[zipIdx] || '').trim(), city: cityIdx >= 0 ? (r[cityIdx] || '').trim() : null })
}
console.log(`CSV: ${csvByOrderId.size} rows for matching`)

const { data: stops, error } = await supabase
  .from('daily_stops')
  .select('id, order_id, address, city, zip')
  .eq('delivery_date', deliveryDate)
if (error) { console.error(error); process.exit(1) }
console.log(`DB: ${stops.length} stops on ${deliveryDate}`)

let updated = 0
let cityFixed = 0
let unmatched = 0
const samples = []
for (const s of stops) {
  const csv = csvByOrderId.get((s.order_id || '').trim())
  if (!csv) { unmatched++; continue }
  const update = {}
  if (csv.zip && /^\d{5}$/.test(csv.zip) && s.zip !== csv.zip) update.zip = csv.zip
  if (csv.city && s.city !== csv.city.toUpperCase() && s.city !== csv.city) {
    // Only fix city if it's blank or upper/lowercase mismatch — don't blow away manual edits
    if (!s.city) { update.city = csv.city; cityFixed++ }
  }
  if (Object.keys(update).length) {
    const { error: upErr } = await supabase.from('daily_stops').update(update).eq('id', s.id)
    if (upErr) { console.error(`row ${s.id}:`, upErr.message); continue }
    updated++
    if (samples.length < 5) samples.push({ order_id: s.order_id, before: s.zip, after: update.zip })
  }
}

console.log(`Updated ${updated} rows (${cityFixed} city fixed). Unmatched: ${unmatched}.`)
console.log('Samples:', samples)
