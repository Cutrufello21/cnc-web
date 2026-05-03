// Restore cold_chain on daily_stops by matching OrderID against a Trellis CSV.
// Cold chain markers are in DestComments / SpecialInst free-text.
// Usage: node scripts/restore-cold-chain-from-csv.mjs <csv-path> <YYYY-MM-DD>

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
const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const [csvPath, deliveryDate] = process.argv.slice(2)
if (!csvPath || !deliveryDate) {
  console.error('Usage: <csv> <YYYY-MM-DD>')
  process.exit(1)
}

function parseCSV(text) {
  const rows = []; let row = []; let cell = ''; let inQuotes = false
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

const COLD_RE = /(^|[^a-z])(cold chain|refrigerat|frozen|keep cold|cooler)([^a-z]|$)/i

const text = readFileSync(csvPath, 'utf8')
const rows = parseCSV(text)
const headers = rows[0].map(h => h.trim().toLowerCase())
const orderIdx = headers.indexOf('orderid')
const destCommentsIdx = headers.indexOf('destcomments')
const specialIdx = headers.indexOf('specialinst')
if (orderIdx < 0) { console.error('Missing OrderID'); process.exit(1) }

const csvCold = new Map()
for (const r of rows.slice(1)) {
  const id = (r[orderIdx] || '').trim()
  if (!id) continue
  const text = `${destCommentsIdx >= 0 ? r[destCommentsIdx] || '' : ''} ${specialIdx >= 0 ? r[specialIdx] || '' : ''}`
  csvCold.set(id, COLD_RE.test(text))
}
const csvColdCount = [...csvCold.values()].filter(Boolean).length
console.log(`CSV: ${csvCold.size} rows, ${csvColdCount} cold chain`)

const { data: stops, error } = await supabase
  .from('daily_stops')
  .select('id, order_id, cold_chain, cc_edited')
  .eq('delivery_date', deliveryDate)
if (error) { console.error(error); process.exit(1) }
console.log(`DB: ${stops.length} stops on ${deliveryDate}`)

let setTrue = 0, setFalse = 0, skippedEdited = 0, unmatched = 0
for (const s of stops) {
  if (s.cc_edited) { skippedEdited++; continue } // respect manual dispatcher edits
  const csvIsCold = csvCold.get((s.order_id || '').trim())
  if (csvIsCold === undefined) { unmatched++; continue }
  if (csvIsCold === s.cold_chain) continue
  const { error: upErr } = await supabase.from('daily_stops').update({ cold_chain: csvIsCold }).eq('id', s.id)
  if (upErr) { console.error(s.order_id, upErr.message); continue }
  if (csvIsCold) setTrue++; else setFalse++
}

console.log(`Set TRUE: ${setTrue}, set FALSE: ${setFalse}, skipped (cc_edited): ${skippedEdited}, unmatched (likely other-pharmacy): ${unmatched}`)
