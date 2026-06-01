// One-off: fix a daily_stops row whose `pharmacy` field is wrong
// (e.g. the Thomas Lorkowski row in the 2026-05-29 screenshot where
// the upload mapped the patient name into the pharmacy column).
//
// Targets a single order_id by default. Pass --order <id> to override.
// Dry-run unless --go is passed.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter(Boolean).map(l => {
      const i = l.indexOf('=')
      return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '')]
    })
)
const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const args = process.argv.slice(2)
const GO = args.includes('--go')
const orderIdx = args.indexOf('--order')
const ORDER_ID = orderIdx >= 0 ? args[orderIdx + 1] : '13476198'
const newPharmacyIdx = args.indexOf('--pharmacy')
const NEW_PHARMACY = newPharmacyIdx >= 0 ? args[newPharmacyIdx + 1] : 'SHSP'

const { data: rows, error } = await supabase
  .from('daily_stops')
  .select('id, order_id, patient_name, address, city, pharmacy, driver_name, delivery_date')
  .eq('order_id', ORDER_ID)

if (error) { console.error('fetch error:', error.message); process.exit(1) }
if (!rows || rows.length === 0) { console.log(`No rows found for order_id ${ORDER_ID}.`); process.exit(0) }

for (const r of rows) {
  console.log(`  ${r.delivery_date} | ${r.order_id} | ${r.patient_name} | pharmacy="${r.pharmacy}" → ${NEW_PHARMACY}`)
}

if (!GO) { console.log('\n[dry run] pass --go to update.'); process.exit(0) }

const ids = rows.map(r => r.id)
const { error: uerr } = await supabase
  .from('daily_stops')
  .update({ pharmacy: NEW_PHARMACY })
  .in('id', ids)
if (uerr) { console.error('update error:', uerr.message); process.exit(1) }
console.log(`\n✓ Updated ${ids.length} row(s) to pharmacy = ${NEW_PHARMACY}.`)
