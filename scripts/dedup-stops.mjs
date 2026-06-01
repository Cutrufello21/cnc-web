// One-time: remove duplicate daily_stops for a delivery_date.
// Keeps the lowest-id row per order_id, deletes the rest. Only dedupes rows
// that share a non-empty order_id. Usage: node scripts/dedup-stops.mjs 2026-05-26 [--dry]
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(readFileSync(join(here, '..', '.env'), 'utf8').split('\n').filter(Boolean).map(l => {
  const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '')]
}))
const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const date = process.argv[2]
const dry = process.argv.includes('--dry')
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error('Pass a delivery date: node scripts/dedup-stops.mjs 2026-05-26 [--dry]'); process.exit(1)
}

const { data: rows, error } = await supabase
  .from('daily_stops')
  .select('id, order_id, driver_name')
  .eq('delivery_date', date)
  .order('id', { ascending: true })
if (error) { console.error('fetch error:', error.message); process.exit(1) }

const seen = new Set()
const toDelete = []
for (const r of rows) {
  const oid = (r.order_id || '').trim()
  if (!oid) continue           // never dedupe rows without an order_id
  if (seen.has(oid)) toDelete.push(r.id)
  else seen.add(oid)
}

console.log(`${date}: ${rows.length} total rows, ${seen.size} distinct order_ids, ${toDelete.length} duplicates to delete`)
if (dry) { console.log('[dry run] no writes'); process.exit(0) }
if (toDelete.length === 0) { console.log('Nothing to delete.'); process.exit(0) }

let deleted = 0
for (let i = 0; i < toDelete.length; i += 200) {
  const batch = toDelete.slice(i, i + 200)
  const { error: derr } = await supabase.from('daily_stops').delete().in('id', batch)
  if (derr) { console.error('delete error:', derr.message); process.exit(1) }
  deleted += batch.length
}
console.log(`Done. Deleted ${deleted} duplicate rows.`)
