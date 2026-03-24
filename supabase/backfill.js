import { config } from 'dotenv'
import { GoogleAuth } from 'google-auth-library'
import { createClient } from '@supabase/supabase-js'

config()

// --- Google Sheets setup ---
const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets'
const auth = new GoogleAuth({
  credentials: {
    type: 'service_account',
    project_id: 'cnc-dispatch',
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
})

async function fetchRange(spreadsheetId, range) {
  const client = await auth.getClient()
  const token = await client.getAccessToken()
  const url = `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token.token || token}` },
  })
  if (!res.ok) throw new Error(`Sheets error ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.values || []
}

// --- Supabase setup ---
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const MASTER = process.env.MASTER_SHEET_ID

// --- Helpers ---
function parseRows(rows) {
  if (rows.length < 2) return { headers: [], data: [] }
  const headers = rows[0].map(h => h.trim())
  const data = rows.slice(1)
    .filter(r => r.length > 0 && r.some(c => c?.trim()))
    .map(row => {
      const obj = {}
      headers.forEach((h, i) => { obj[h] = (row[i] || '').trim() })
      return obj
    })
  return { headers, data }
}

async function upsertBatch(table, rows, batchSize = 500, onConflict) {
  let inserted = 0
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const query = supabase.from(table).upsert(batch, { onConflict, ignoreDuplicates: true })
    const { error } = await query
    if (error) {
      console.error(`  Error in ${table} batch ${i}: ${error.message}`)
    } else {
      inserted += batch.length
    }
  }
  return inserted
}

// --- Import functions ---

async function importOrders() {
  console.log('\n--- ORDERS ---')
  const rows = await fetchRange(MASTER, 'Orders!A1:K25000')
  const { data } = parseRows(rows)
  console.log(`  Found ${data.length} rows in sheet`)

  const mapped = data
    .filter(r => r['Order ID'])
    .map(r => {
      const cc = (r['Cold Chain'] || '').toLowerCase()
      return {
        order_id: r['Order ID'],
        patient_name: r['Name'] || null,
        address: r['Address'] || null,
        city: r['City'] || null,
        zip: r['ZIP'] || null,
        pharmacy: r['Pharmacy'] || null,
        driver_name: r['Driver Name'] || null,
        date_delivered: parseDate(r['Date Delivered']),
        cold_chain: cc !== '' && cc !== 'no' && cc !== 'n',
        source: r['Source'] || null,
      }
    })
    .filter(r => r.date_delivered) // skip rows with unparseable dates

  const count = await upsertBatch('orders', mapped, 500, 'order_id')
  console.log(`  Inserted/updated: ${count}`)
}

async function importRoutingRules() {
  console.log('\n--- ROUTING RULES ---')
  const rows = await fetchRange(MASTER, 'Routing Rules!A1:H500')
  const { data } = parseRows(rows)
  console.log(`  Found ${data.length} rows in sheet`)

  const mapped = data
    .filter(r => r['ZIP Code'] || r['ZIP'])
    .map(r => ({
      zip_code: r['ZIP Code'] || r['ZIP'],
      mon: r['Mon'] || '',
      tue: r['Tue'] || '',
      wed: r['Wed'] || '',
      thu: r['Thu'] || '',
      fri: r['Fri'] || '',
      route: r['Route'] || '',
      pharmacy: r['Pharmacy'] || '',
    }))

  const count = await upsertBatch('routing_rules', mapped, 500, 'zip_code')
  console.log(`  Inserted/updated: ${count}`)
}

async function importDispatchLogs() {
  console.log('\n--- DISPATCH LOGS ---')
  const rows = await fetchRange(MASTER, 'Log!A1:M500')
  const { data } = parseRows(rows)
  console.log(`  Found ${data.length} rows in sheet`)

  const mapped = data
    .filter(r => r['Date'] && r['Delivery Day'])
    .map(r => ({
      date: parseDate(r['Date']),
      delivery_day: r['Delivery Day'],
      status: r['Status'] || 'Complete',
      orders_processed: parseInt(r['Orders Processed']) || 0,
      cold_chain: parseInt(r['Cold Chain']) || 0,
      unassigned_count: parseInt(r['Unassigned Count']) || 0,
      corrections: parseInt(r['Corrections']) || 0,
      shsp_orders: parseInt(r['SHSP Orders']) || 0,
      aultman_orders: parseInt(r['Aultman Orders']) || 0,
      top_driver: r['Top Driver'] || null,
      notes: r['Notes'] || null,
    }))
    .filter(r => r.date)

  const count = await upsertBatch('dispatch_logs', mapped, 500, 'date,delivery_day')
  console.log(`  Inserted/updated: ${count}`)
}

async function importPayroll() {
  console.log('\n--- PAYROLL (current week) ---')
  const rows = await fetchRange(MASTER, 'Weekly Stops!A1:K25')
  const { data } = parseRows(rows)
  console.log(`  Found ${data.length} rows in sheet`)

  // Calculate current week's Monday
  const now = new Date()
  const dayOfWeek = now.getDay()
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = new Date(now)
  monday.setDate(now.getDate() + mondayOffset)
  const weekOf = monday.toISOString().split('T')[0]

  const mapped = data
    .filter(r => r['Driver Name'] && r['Driver Name'] !== 'TOTAL')
    .map(r => ({
      week_of: weekOf,
      driver_name: r['Driver Name'],
      driver_number: r['Driver #'] || null,
      mon: parseInt(r['Mon']) || 0,
      tue: parseInt(r['Tue']) || 0,
      wed: parseInt(r['Wed']) || 0,
      thu: parseInt(r['Thu']) || 0,
      fri: parseInt(r['Fri']) || 0,
      week_total: parseInt(r['Week Total']) || 0,
      will_calls: parseInt(r['Will Calls']) || 0,
      weekly_pay: parseFloat((r['Weekly Pay'] || '0').replace(/[$,]/g, '')) || 0,
    }))

  const count = await upsertBatch('payroll', mapped, 500, 'week_of,driver_name')
  console.log(`  Inserted/updated: ${count} (week of ${weekOf})`)
}

async function importUnassigned() {
  console.log('\n--- UNASSIGNED ORDERS ---')
  const rows = await fetchRange(MASTER, 'Unassigned History!A1:F500')
  const { data } = parseRows(rows)
  console.log(`  Found ${data.length} rows in sheet`)

  const mapped = data
    .filter(r => r['ZIP'])
    .map(r => ({
      date: parseDate(r['Date']) || new Date().toISOString().split('T')[0],
      delivery_day: r['Delivery Day'] || null,
      zip: r['ZIP'],
      address: r['Address'] || null,
      pharmacy: r['Pharmacy'] || null,
      patient_name: r['Name'] || r['Patient'] || null,
    }))

  const count = await upsertBatch('unassigned_orders', mapped, 500)
  console.log(`  Inserted/updated: ${count}`)
}

// --- Date parser ---
// Handles MM/DD/YYYY, M/D/YYYY, YYYY-MM-DD
function parseDate(str) {
  if (!str) return null
  str = str.trim()
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.split('T')[0]
  // MM/DD/YYYY
  const parts = str.split('/')
  if (parts.length === 3) {
    const [m, d, y] = parts
    const year = y.length === 2 ? `20${y}` : y
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return null
}

// --- Main ---
async function main() {
  console.log('=== CNC Delivery — Backfill Google Sheets → Supabase ===')
  console.log(`Master Sheet: ${MASTER}`)
  console.log(`Supabase: ${process.env.VITE_SUPABASE_URL}`)

  await importOrders()
  await importRoutingRules()
  await importDispatchLogs()
  await importPayroll()
  await importUnassigned()

  console.log('\n=== DONE ===')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
