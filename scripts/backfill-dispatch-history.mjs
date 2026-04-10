// Backfill dispatch_history_import from daily_stops (last 90 days).
// Gives the AI suggestion engine immediate training data while
// we wait for the Gmail Takeout correction email import.
//
// Run:
//   DRY RUN:  node scripts/backfill-dispatch-history.mjs --dry-run
//   LIVE:     node scripts/backfill-dispatch-history.mjs
//
// Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.argv.includes('--dry-run')
const SOURCE = 'daily_stops_backfill'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY not set'); process.exit(1)
}

// 90 days ago
const cutoff = new Date()
cutoff.setDate(cutoff.getDate() - 90)
const cutoffStr = cutoff.toISOString().split('T')[0]
console.log(`\n=== ${DRY_RUN ? 'DRY RUN' : 'LIVE'} MODE ===`)
console.log(`Backfilling from daily_stops where delivery_date >= ${cutoffStr}\n`)

// ── 1. Check what's already been backfilled ─────────────────────
const { data: existing, error: exErr } = await supabase
  .from('dispatch_history_import')
  .select('order_id')
  .eq('source', SOURCE)
if (exErr) { console.error('Failed to check existing:', exErr.message); process.exit(1) }
const existingIds = new Set((existing || []).map(r => r.order_id))
console.log(`Already backfilled: ${existingIds.size} order_ids`)

// ── 2. Fetch daily_stops in pages (1000 per page) ───────────────
let page = 0
const PAGE_SIZE = 1000
let totalFetched = 0
let totalNew = 0
let totalSkipped = 0
let totalInserted = 0
const dayCounts = {}
const driverCounts = {}
const pharmacyCounts = {}

while (true) {
  const { data: stops, error: fetchErr } = await supabase
    .from('daily_stops')
    .select('order_id, delivery_date, delivery_day, driver_name, zip, city, address, pharmacy, cold_chain')
    .gte('delivery_date', cutoffStr)
    .neq('status', 'DELETED')
    .order('delivery_date', { ascending: true })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

  if (fetchErr) { console.error(`Fetch error page ${page}:`, fetchErr.message); break }
  if (!stops || stops.length === 0) break

  totalFetched += stops.length

  // Filter out already-backfilled
  const newStops = stops.filter(s => s.order_id && !existingIds.has(s.order_id))
  totalSkipped += stops.length - newStops.length
  totalNew += newStops.length

  // Build rows
  const rows = newStops.map(s => ({
    delivery_date: s.delivery_date,
    day_of_week: s.delivery_day || null,
    driver_name: s.driver_name,
    zip: s.zip,
    city: s.city,
    address: s.address,
    order_id: s.order_id,
    pharmacy: s.pharmacy,
    cold_chain: !!s.cold_chain,
    source: SOURCE,
  }))

  // Track stats
  for (const r of rows) {
    dayCounts[r.day_of_week || 'Unknown'] = (dayCounts[r.day_of_week || 'Unknown'] || 0) + 1
    driverCounts[r.driver_name || 'Unassigned'] = (driverCounts[r.driver_name || 'Unassigned'] || 0) + 1
    pharmacyCounts[r.pharmacy || 'Unknown'] = (pharmacyCounts[r.pharmacy || 'Unknown'] || 0) + 1
  }

  if (!DRY_RUN && rows.length > 0) {
    // Insert in sub-batches of 500 (Supabase limit)
    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500)
      const { error: insErr } = await supabase
        .from('dispatch_history_import')
        .insert(batch)
      if (insErr) {
        console.error(`  ✗ Insert error page ${page} batch ${i}: ${insErr.message}`)
      } else {
        totalInserted += batch.length
      }
    }
    // Track so we don't re-insert
    for (const r of rows) existingIds.add(r.order_id)
  } else if (DRY_RUN) {
    totalInserted += rows.length // count what WOULD be inserted
  }

  console.log(`  Page ${page}: ${stops.length} fetched, ${newStops.length} new`)
  page++
}

// ── 3. Report ───────────────────────────────────────────────────
console.log(`\n=== REPORT ===`)
console.log(`Date range: ${cutoffStr} → today`)
console.log(`Total fetched from daily_stops: ${totalFetched}`)
console.log(`Already backfilled (skipped): ${totalSkipped}`)
console.log(`New records ${DRY_RUN ? 'to insert' : 'inserted'}: ${totalInserted}`)

console.log(`\nBy day of week:`)
for (const [day, count] of Object.entries(dayCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${day.padEnd(12)} ${count}`)
}

console.log(`\nBy driver (top 15):`)
const topDrivers = Object.entries(driverCounts).sort((a, b) => b[1] - a[1]).slice(0, 15)
for (const [name, count] of topDrivers) {
  console.log(`  ${(name || 'Unassigned').padEnd(18)} ${count}`)
}

console.log(`\nBy pharmacy:`)
for (const [pharm, count] of Object.entries(pharmacyCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${pharm.padEnd(12)} ${count}`)
}

console.log(`\n=== END REPORT ===`)
if (DRY_RUN) {
  console.log(`\nThis was a DRY RUN — nothing was inserted.`)
  console.log(`Run without --dry-run to insert for real.`)
}
