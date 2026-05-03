// Migrate missing orders from `orders` table into `daily_stops`
// Only inserts rows where the order_id + date combo doesn't already exist in daily_stops

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config()

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

function getDayName(dateStr) {
  if (!dateStr) return ''
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  try {
    return days[new Date(dateStr + 'T12:00:00').getDay()]
  } catch { return '' }
}

async function main() {
  console.log('=== Migrate orders → daily_stops ===\n')

  // Get all existing order_ids in daily_stops for dedup
  console.log('Loading existing daily_stops order_ids...')
  const existingIds = new Set()
  let offset = 0
  while (true) {
    const { data } = await supabase
      .from('daily_stops')
      .select('order_id')
      .range(offset, offset + 9999)
    if (!data || data.length === 0) break
    data.forEach(r => { if (r.order_id) existingIds.add(String(r.order_id)) })
    offset += 10000
    if (data.length < 10000) break
  }
  console.log(`Found ${existingIds.size} existing order_ids in daily_stops\n`)

  // Paginate through all orders
  let totalOrders = 0
  let inserted = 0
  let skipped = 0
  let errors = 0
  let pageOffset = 0
  const BATCH = 1000

  while (true) {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .order('date_delivered', { ascending: true })
      .range(pageOffset, pageOffset + BATCH - 1)

    if (error) {
      console.error('Query error:', error.message)
      break
    }
    if (!orders || orders.length === 0) break

    totalOrders += orders.length

    // Filter out orders that already exist in daily_stops
    const newOrders = orders.filter(o => !existingIds.has(String(o.order_id)))
    skipped += orders.length - newOrders.length

    if (newOrders.length > 0) {
      // Map orders columns → daily_stops columns
      const rows = newOrders.map(o => ({
        order_id: o.order_id || '',
        patient_name: o.patient_name || '',
        address: o.address || '',
        city: o.city || '',
        zip: o.zip || '',
        pharmacy: o.pharmacy || '',
        driver_name: o.driver_name || '',
        delivery_date: o.date_delivered || null,
        delivery_day: getDayName(o.date_delivered),
        cold_chain: o.cold_chain || false,
        lat: o.lat || null,
        lng: o.lng || null,
        notes: o.notes || null,
        status: 'delivered', // Historical orders were delivered
        created_at: o.created_at || null,
      }))

      // Insert in sub-batches of 500
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500)
        const { error: insertErr } = await supabase.from('daily_stops').insert(batch)
        if (insertErr) {
          console.error(`Insert error at offset ${pageOffset + i}: ${insertErr.message}`)
          errors += batch.length
        } else {
          inserted += batch.length
          // Add to existingIds to prevent dupes in subsequent pages
          batch.forEach(r => existingIds.add(String(r.order_id)))
        }
      }
    }

    if (totalOrders % 10000 < BATCH) {
      console.log(`Processed ${totalOrders} orders... (${inserted} inserted, ${skipped} skipped, ${errors} errors)`)
    }

    if (orders.length < BATCH) break
    pageOffset += BATCH
  }

  console.log('\n=== DONE ===')
  console.log(`Total orders scanned: ${totalOrders}`)
  console.log(`Inserted into daily_stops: ${inserted}`)
  console.log(`Skipped (already existed): ${skipped}`)
  console.log(`Errors: ${errors}`)

  // Verify counts
  const { count: dsCount } = await supabase.from('daily_stops').select('*', { count: 'exact', head: true })
  const { count: oCount } = await supabase.from('orders').select('*', { count: 'exact', head: true })
  console.log(`\nFinal counts — orders: ${oCount}, daily_stops: ${dsCount}`)
}

main().catch(console.error)
