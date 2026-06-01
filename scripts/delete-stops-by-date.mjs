// One-time: delete ALL daily_stops for a delivery_date (used to undo a bad import).
// Usage: node scripts/delete-stops-by-date.mjs 2026-05-26 [--go]
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
const go = process.argv.includes('--go')
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error('Usage: node scripts/delete-stops-by-date.mjs 2026-05-26 [--go]'); process.exit(1)
}

const { data: rows, error } = await supabase
  .from('daily_stops').select('id').eq('delivery_date', date)
if (error) { console.error('fetch error:', error.message); process.exit(1) }
console.log(`${date}: ${rows.length} rows would be deleted`)
if (!go) { console.log('[dry run] pass --go to delete'); process.exit(0) }

const ids = rows.map(r => r.id)
let deleted = 0
for (let i = 0; i < ids.length; i += 200) {
  const batch = ids.slice(i, i + 200)
  const { error: derr } = await supabase.from('daily_stops').delete().in('id', batch)
  if (derr) { console.error('delete error:', derr.message); process.exit(1) }
  deleted += batch.length
}
console.log(`Done. Deleted ${deleted} rows.`)
