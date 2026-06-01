// Delete the stray duplicate import on 2026-05-25 (holiday). SCOPED to pending only.
// Tuesday's real orders live on 2026-05-26 and are NOT touched.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n').filter(Boolean).map(l => {
  const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '')]
}))
const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const DATE = '2026-05-25'
const GO = process.argv.includes('--go')

// 1. Safety re-check: load all 5-25 rows, abort if ANY are delivered/failed/assigned.
const { data: rows, error } = await supabase.from('daily_stops')
  .select('id,status,driver_name').eq('delivery_date', DATE)
if (error) { console.error('fetch error:', error.message); process.exit(1) }
const bad = rows.filter(r => r.status !== 'pending' || (r.driver_name && r.driver_name !== 'Unassigned'))
console.log(`${DATE}: ${rows.length} rows | pending+unassigned: ${rows.length - bad.length} | real/assigned: ${bad.length}`)
if (bad.length) {
  console.error('ABORT: found delivered/failed/assigned rows on this date — not safe to bulk-delete. Sample:', JSON.stringify(bad.slice(0, 5)))
  process.exit(1)
}
if (!GO) { console.log('[dry run] all rows are pending/unassigned. pass --go to delete.'); process.exit(0) }

// 2. Delete only pending rows on this date.
const ids = rows.map(r => r.id)
let deleted = 0
for (let i = 0; i < ids.length; i += 200) {
  const batch = ids.slice(i, i + 200)
  const { error: derr } = await supabase.from('daily_stops').delete().in('id', batch).eq('status', 'pending')
  if (derr) { console.error('delete error:', derr.message); process.exit(1) }
  deleted += batch.length
}
// 3. Verify nothing remains on 5-25; confirm 5-26 untouched.
const { count: remain } = await supabase.from('daily_stops').select('id', { count: 'exact', head: true }).eq('delivery_date', DATE)
const { count: tues } = await supabase.from('daily_stops').select('id', { count: 'exact', head: true }).eq('delivery_date', '2026-05-26')
console.log(`Deleted ~${deleted}. Remaining on ${DATE}: ${remain}. Tuesday (5-26) still has: ${tues}`)
