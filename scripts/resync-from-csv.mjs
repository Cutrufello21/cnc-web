// Resync daily_stops for a given delivery_date from a Trellis CSV.
// Treats the CSV as source of truth for: patient_name, address, city, zip, cold_chain, delivery_note, pharmacy.
// Preserves: driver_name, sort_order, status, cc_edited, lat/lng, id.
// Inserts rows present in CSV but missing in DB.
// Usage: node scripts/resync-from-csv.mjs <csv-path> <YYYY-MM-DD>

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
const GOOGLE_KEY = env.VITE_GOOGLE_MAPS_API_KEY

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

function normalizePharmacy(origin) {
  const o = (origin || '').toLowerCase()
  if (o.includes('aultman')) return 'Aultman'
  if (o.includes('shsp')) return 'SHSP'
  if (o.includes('trellis')) return 'Aultman' // Trellis Rx - Canton Aultman
  return origin
}

const dayName = (() => {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return days[new Date(deliveryDate + 'T12:00:00').getDay()]
})()

const text = readFileSync(csvPath, 'utf8')
const rows = parseCSV(text)
const h = rows[0].map(x => x.trim().toLowerCase())
const idx = {
  orderId: h.indexOf('orderid'),
  origin: h.indexOf('originname'),
  destName: h.indexOf('destname'),
  destAddr: h.indexOf('destaddress'),
  destCity: h.indexOf('destcity'),
  destZip: h.indexOf('destzip'),
  destComments: h.indexOf('destcomments'),
  specialInst: h.indexOf('specialinst'),
}
// specialInst is optional (not present in the slimmed Numbers export)
const required = ['orderId', 'origin', 'destName', 'destAddr', 'destCity', 'destZip', 'destComments']
for (const k of required) {
  if (idx[k] < 0) { console.error(`CSV missing column: ${k}`); process.exit(1) }
}

const csvRows = []
for (const r of rows.slice(1)) {
  const id = (r[idx.orderId] || '').trim()
  if (!id) continue
  const note = `${r[idx.destComments] || ''} ${idx.specialInst >= 0 ? r[idx.specialInst] || '' : ''}`.trim()
  csvRows.push({
    order_id: id,
    pharmacy: normalizePharmacy(r[idx.origin]),
    patient_name: (r[idx.destName] || '').trim(),
    address: (r[idx.destAddr] || '').trim(),
    city: (r[idx.destCity] || '').trim(),
    zip: (r[idx.destZip] || '').trim(),
    cold_chain: COLD_RE.test(note),
    delivery_note: note || null,
  })
}
console.log(`CSV: ${csvRows.length} rows`)

const { data: existing, error } = await supabase
  .from('daily_stops')
  .select('*')
  .eq('delivery_date', deliveryDate)
if (error) { console.error(error); process.exit(1) }
const byOrderId = new Map(existing.map(r => [(r.order_id || '').trim(), r]))
console.log(`DB: ${existing.length} stops on ${deliveryDate}`)

const toInsert = []
let updated = 0, unchanged = 0, ccPreserved = 0
const fields = ['patient_name', 'address', 'city', 'zip', 'cold_chain', 'delivery_note', 'pharmacy']

for (const csv of csvRows) {
  const row = byOrderId.get(csv.order_id)
  if (!row) {
    toInsert.push({
      delivery_date: deliveryDate,
      delivery_day: dayName,
      order_id: csv.order_id,
      patient_name: csv.patient_name,
      address: csv.address,
      city: csv.city,
      zip: csv.zip,
      pharmacy: csv.pharmacy,
      cold_chain: csv.cold_chain,
      delivery_note: csv.delivery_note,
      status: 'pending',
    })
    continue
  }
  const update = {}
  for (const f of fields) {
    if (f === 'cold_chain' && row.cc_edited) continue
    const cur = row[f] ?? ''
    const next = csv[f] ?? ''
    if (cur && !next) continue // don't overwrite DB value with empty CSV
    // Trellis sometimes puts phone digits in DestZip — never overwrite a valid 5-digit DB zip with garbage.
    if (f === 'zip') {
      if (next && !/^\d{5}(-\d{4})?$/.test(next)) continue
    }
    if (cur !== next) update[f] = csv[f]
  }
  if (row.cc_edited && csv.cold_chain !== row.cold_chain) ccPreserved++
  if (Object.keys(update).length === 0) { unchanged++; continue }
  const { error: upErr } = await supabase.from('daily_stops').update(update).eq('id', row.id)
  if (upErr) { console.error(csv.order_id, upErr.message); continue }
  updated++
}

let inserted = 0
if (toInsert.length) {
  const { error: insErr } = await supabase.from('daily_stops').insert(toInsert)
  if (insErr) console.error('Insert error:', insErr.message)
  else inserted = toInsert.length
}

const dbOnly = existing.filter(r => !csvRows.some(c => c.order_id === (r.order_id || '').trim()))
console.log(`Updated: ${updated}, Inserted: ${inserted}, Unchanged: ${unchanged}, cc_edited preserved: ${ccPreserved}`)
console.log(`In DB but not in CSV: ${dbOnly.length} (left untouched)`)

// Geocode any remaining blank zips
const { data: blanks } = await supabase
  .from('daily_stops')
  .select('id, address, city, zip')
  .eq('delivery_date', deliveryDate)
  .or('zip.is.null,zip.eq.')
if (blanks?.length && GOOGLE_KEY) {
  console.log(`Geocoding ${blanks.length} stops with blank zip…`)
  for (const s of blanks) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(`${s.address}, ${s.city}, OH`)}&key=${GOOGLE_KEY}`
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
      const d = await r.json()
      const m = d?.results?.[0]
      const z = (m?.address_components || []).find(c => c.types?.includes('postal_code'))?.short_name
      if (z && /^\d{5}$/.test(z)) {
        await supabase.from('daily_stops').update({ zip: z }).eq('id', s.id)
      }
    } catch {}
  }
  console.log('Geocode pass done.')
}
