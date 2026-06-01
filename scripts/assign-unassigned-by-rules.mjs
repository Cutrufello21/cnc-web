// One-time: apply routing_rules to already-imported Unassigned daily_stops.
// Mirrors the assignment logic now in api/upload-orders.js.
// Usage: node scripts/assign-unassigned-by-rules.mjs 2026-05-26 [--dry]
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

const date = process.argv[2]
const dry = process.argv.includes('--dry')
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error('Pass a delivery date: node scripts/assign-unassigned-by-rules.mjs 2026-05-26 [--dry]')
  process.exit(1)
}
const dayCol = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(date + 'T12:00:00').getDay()]

// Build rule map: zip -> [{ pharmacy, name, number }]
const { data: rules, error: rerr } = await supabase
  .from('routing_rules')
  .select(`zip_code, pharmacy, ${dayCol}`)
if (rerr) { console.error('routing_rules error:', rerr.message); process.exit(1) }

const ruleMap = {}
for (const r of (rules || [])) {
  const raw = (r[dayCol] || '').trim()
  if (!raw) continue
  const zip = String(r.zip_code || '').trim()
  if (!zip) continue
  const name = (raw.includes('/') ? raw.split('/')[0] : raw).trim()
  const number = raw.includes('/') ? raw.split('/')[1].trim() : ''
  if (!name || /^[-—–\s]+$/.test(name) || name.toLowerCase() === 'unassigned') continue
  ;(ruleMap[zip] ||= []).push({ pharmacy: (r.pharmacy || '').trim(), name, number })
}
function resolveDriver(zip, pharm) {
  const list = ruleMap[zip]
  if (!list || !list.length) return null
  const p = (pharm || '').toLowerCase()
  return list.find(x => x.pharmacy && x.pharmacy.toLowerCase() === p)
    || list.find(x => !x.pharmacy) || null
}

// Fetch the Unassigned stops for the date
const { data: stops, error: serr } = await supabase
  .from('daily_stops')
  .select('id, zip, pharmacy')
  .eq('delivery_date', date)
  .eq('driver_name', 'Unassigned')
if (serr) { console.error('daily_stops error:', serr.message); process.exit(1) }

console.log(`${date} (${dayCol}): ${stops.length} Unassigned stops, ${Object.keys(ruleMap).length} zip rules`)

// Group ids by resolved driver
const byDriver = {} // "name|number" -> ids[]
let matched = 0
for (const s of stops) {
  const zip = String(s.zip || '').slice(0, 5)
  const d = zip ? resolveDriver(zip, s.pharmacy) : null
  if (!d) continue
  matched++
  const k = `${d.name}|${d.number}`
  ;(byDriver[k] ||= []).push(s.id)
}

console.log(`Matched ${matched} → ${Object.keys(byDriver).length} drivers; ${stops.length - matched} stay Unassigned`)
for (const [k, ids] of Object.entries(byDriver)) console.log(`  ${k.split('|')[0]}: ${ids.length}`)

if (dry) { console.log('\n[dry run] no writes'); process.exit(0) }

let updated = 0
for (const [k, ids] of Object.entries(byDriver)) {
  const [name, number] = k.split('|')
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200)
    const { error } = await supabase.from('daily_stops')
      .update({ driver_name: name, driver_number: number || null, assigned_driver_number: number || null })
      .in('id', batch)
    if (error) { console.error(`update error for ${name}:`, error.message); process.exit(1) }
    updated += batch.length
  }
}
console.log(`\nDone. Updated ${updated} stops.`)
