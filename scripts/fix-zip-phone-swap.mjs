// One-shot cleanup for stops where the import wrote phone digits into `zip`.
// Detects rows where zip is not a 5-digit ZIP, moves digits to `phone`, clears `zip`.
// Run: node scripts/fix-zip-phone-swap.mjs [YYYY-MM-DD]
//   (defaults to today + tomorrow)

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
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Missing supabase env'); process.exit(1) }

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

const args = process.argv.slice(2)
let dates
if (args.length) {
  dates = args
} else {
  const today = new Date()
  const tomorrow = new Date(today.getTime() + 86400000)
  dates = [today, tomorrow].map(d => d.toLocaleDateString('en-CA'))
}

console.log(`Scanning dates: ${dates.join(', ')}`)

const { data: stops, error } = await supabase
  .from('daily_stops')
  .select('id, order_id, address, city, zip, delivery_date')
  .in('delivery_date', dates)

if (error) { console.error(error); process.exit(1) }

const isValidZip = z => /^\d{5}(-\d{4})?$/.test((z || '').trim())
const isPhoneShape = z => /^\d{7,11}$/.test((z || '').replace(/\D/g, ''))

const toFix = stops.filter(s => s.zip && !isValidZip(s.zip) && isPhoneShape(s.zip))
console.log(`${stops.length} stops loaded, ${toFix.length} have phone-in-zip`)

if (!toFix.length) { console.log('Nothing to fix.'); process.exit(0) }

let fixed = 0
for (const s of toFix) {
  const { error: upErr } = await supabase.from('daily_stops').update({ zip: '' }).eq('id', s.id)
  if (upErr) { console.error(`row ${s.id}:`, upErr.message); continue }
  fixed++
}

console.log(`Cleared bad zip on ${fixed} rows. Geocoder will use address + city on next dispatch refresh.`)
