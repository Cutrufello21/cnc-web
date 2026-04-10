// Backfill orders.driver_name from daily_stops.driver_name
// so the orders table reflects the FINAL driver assignment,
// not the original import-time assignment.
//
// Run:
//   DRY RUN:  node scripts/backfill-orders-driver.mjs --dry-run
//   LIVE:     node scripts/backfill-orders-driver.mjs
//
// Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.argv.includes('--dry-run')

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY not set'); process.exit(1)
}

console.log(`\n=== ${DRY_RUN ? 'DRY RUN' : 'LIVE'} MODE ===`)
console.log(`Syncing orders.driver_name from daily_stops.driver_name\n`)

// ── 1. Build a map of order_id → final driver_name from daily_stops ─
// daily_stops is the source of truth for who actually had the stop.
// Paginate to handle large datasets.
const dsMap = {} // order_id → driver_name
let page = 0
const PAGE_SIZE = 1000
let totalDS = 0

console.log('Loading daily_stops...')
while (true) {
  const { data, error } = await supabase
    .from('daily_stops')
    .select('order_id, driver_name')
    .not('order_id', 'is', null)
    .not('driver_name', 'is', null)
    .neq('status', 'DELETED')
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

  if (error) { console.error(`daily_stops fetch error page ${page}:`, error.message); break }
  if (!data || data.length === 0) break

  for (const row of data) {
    // If same order_id appears on multiple dates, use the latest
    // (daily_stops is ordered by default insertion, latest wins)
    dsMap[row.order_id] = row.driver_name
  }

  totalDS += data.length
  page++
}
console.log(`  Loaded ${totalDS} daily_stops rows → ${Object.keys(dsMap).length} unique order_ids\n`)

// ── 2. Scan orders table and find mismatches ────────────────────
let totalOrders = 0
let mismatches = 0
let noMatch = 0
let alreadyCorrect = 0
const mismatchSamples = [] // first 20 for dry-run report
const updateBatches = [] // { order_id, correctDriver }

page = 0
console.log('Scanning orders table for mismatches...')
while (true) {
  const { data, error } = await supabase
    .from('orders')
    .select('order_id, driver_name')
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

  if (error) { console.error(`orders fetch error page ${page}:`, error.message); break }
  if (!data || data.length === 0) break

  totalOrders += data.length

  for (const order of data) {
    const correctDriver = dsMap[order.order_id]
    if (!correctDriver) {
      // No daily_stops record for this order — skip
      noMatch++
      continue
    }
    if (order.driver_name === correctDriver) {
      alreadyCorrect++
      continue
    }
    // Mismatch found
    mismatches++
    updateBatches.push({ order_id: order.order_id, correctDriver })
    if (mismatchSamples.length < 20) {
      mismatchSamples.push({
        order_id: order.order_id,
        orders_driver: order.driver_name,
        daily_stops_driver: correctDriver,
      })
    }
  }

  if (totalOrders % 10000 === 0) {
    console.log(`  ... scanned ${totalOrders} orders (${mismatches} mismatches so far)`)
  }
  page++
}

// ── 3. Report ───────────────────────────────────────────────────
console.log(`\n=== REPORT ===`)
console.log(`Total orders scanned:     ${totalOrders}`)
console.log(`Already correct:          ${alreadyCorrect}`)
console.log(`Mismatches to fix:        ${mismatches}`)
console.log(`No daily_stops match:     ${noMatch} (older orders not in daily_stops)`)

if (mismatchSamples.length > 0) {
  console.log(`\nSample mismatches (first ${mismatchSamples.length}):`)
  console.log('  order_id               orders.driver    daily_stops.driver')
  console.log('  ─────────────────────  ───────────────  ──────────────────')
  for (const s of mismatchSamples) {
    console.log(`  ${(s.order_id || '').padEnd(23)}  ${(s.orders_driver || 'NULL').padEnd(15)}  ${s.daily_stops_driver}`)
  }
}

// ── 4. Apply fixes (if not dry run) ─────────────────────────────
if (!DRY_RUN && updateBatches.length > 0) {
  console.log(`\nApplying ${updateBatches.length} updates...`)
  let updated = 0
  let errors = 0

  // Batch updates by target driver to minimize API calls
  // Group by correctDriver → array of order_ids
  const byDriver = {}
  for (const u of updateBatches) {
    if (!byDriver[u.correctDriver]) byDriver[u.correctDriver] = []
    byDriver[u.correctDriver].push(u.order_id)
  }

  for (const [driverName, orderIds] of Object.entries(byDriver)) {
    // Supabase .in() has a limit, chunk at 200
    for (let i = 0; i < orderIds.length; i += 200) {
      const chunk = orderIds.slice(i, i + 200)
      const { error } = await supabase
        .from('orders')
        .update({ driver_name: driverName })
        .in('order_id', chunk)

      if (error) {
        console.error(`  ✗ Update error for ${driverName} (${chunk.length} orders): ${error.message}`)
        errors += chunk.length
      } else {
        updated += chunk.length
      }
    }
  }

  console.log(`\nUpdated: ${updated}`)
  console.log(`Errors:  ${errors}`)
} else if (DRY_RUN) {
  console.log(`\nThis was a DRY RUN — nothing was updated.`)
  console.log(`Run without --dry-run to apply ${mismatches} fixes.`)
}

console.log(`\n=== END ===`)
