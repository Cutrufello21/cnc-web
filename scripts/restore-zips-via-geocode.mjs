// Restore zip on daily_stops by geocoding address+city via Google.
// Usage: node scripts/restore-zips-via-geocode.mjs <YYYY-MM-DD> [pharmacy]

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
const SUPABASE_URL = env.VITE_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const GOOGLE_KEY = env.VITE_GOOGLE_MAPS_API_KEY
if (!GOOGLE_KEY) { console.error('Missing VITE_GOOGLE_MAPS_API_KEY'); process.exit(1) }
const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

const [deliveryDate, pharmacy] = process.argv.slice(2)
if (!deliveryDate) { console.error('Usage: <YYYY-MM-DD> [pharmacy]'); process.exit(1) }

let q = supabase.from('daily_stops')
  .select('id, address, city, zip')
  .eq('delivery_date', deliveryDate)
  .or('zip.is.null,zip.eq.')
if (pharmacy) q = q.eq('pharmacy', pharmacy)
const { data: stops, error } = await q
if (error) { console.error(error); process.exit(1) }
console.log(`${stops.length} stops missing zip on ${deliveryDate}${pharmacy ? ` (${pharmacy})` : ''}`)

async function geocodeOne(s) {
  const addr = `${s.address}, ${s.city || ''}, OH`
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addr)}&key=${GOOGLE_KEY}`
  const resp = await fetch(url, { signal: AbortSignal.timeout(8000) })
  const data = await resp.json()
  const match = data?.results?.[0]
  if (!match) return null
  const comp = (match.address_components || []).find(c => c.types?.includes('postal_code'))
  return comp?.short_name || null
}

let fixed = 0
let failed = 0
const CONCURRENCY = 8
for (let i = 0; i < stops.length; i += CONCURRENCY) {
  const chunk = stops.slice(i, i + CONCURRENCY)
  const results = await Promise.all(chunk.map(async s => {
    try {
      const zip = await geocodeOne(s)
      return { s, zip }
    } catch (e) { return { s, zip: null, err: e.message } }
  }))
  for (const { s, zip, err } of results) {
    if (zip && /^\d{5}$/.test(zip)) {
      const { error: upErr } = await supabase.from('daily_stops').update({ zip }).eq('id', s.id)
      if (upErr) { failed++; console.error(s.address, upErr.message) }
      else fixed++
    } else {
      failed++
      console.warn(`No ZIP: ${s.address}, ${s.city}${err ? ' — ' + err : ''}`)
    }
  }
  process.stdout.write(`  ${Math.min(i + CONCURRENCY, stops.length)}/${stops.length}\r`)
}

console.log(`\nFixed ${fixed}, failed ${failed}`)
