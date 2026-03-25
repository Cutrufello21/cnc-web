import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'

config()

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const TABLES = ['orders', 'drivers', 'routing_rules', 'dispatch_logs', 'payroll', 'daily_stops', 'unassigned_orders', 'time_off_requests', 'sort_list']

async function fetchAll(table) {
  let all = [], offset = 0
  while (true) {
    const { data } = await sb.from(table).select('*').range(offset, offset + 999)
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < 1000) break
    offset += 1000
  }
  return all
}

async function backup() {
  console.log('=== CNC Backup ===\n')
  const data = {}
  for (const t of TABLES) {
    data[t] = await fetchAll(t)
    console.log(`  ${t}: ${data[t].length} rows`)
  }
  const date = new Date().toISOString().split('T')[0]
  const time = new Date().toTimeString().split(' ')[0].replace(/:/g, '')
  const path = join(process.env.HOME, 'Desktop', `cnc-backup-${date}-${time}.json`)
  writeFileSync(path, JSON.stringify(data, null, 2))
  const size = (Buffer.byteLength(JSON.stringify(data)) / 1024 / 1024).toFixed(1)
  console.log(`\nSaved: ${path} (${size} MB)`)
}

async function restore(file) {
  if (!existsSync(file)) { console.log('File not found:', file); return }
  const data = JSON.parse(readFileSync(file, 'utf8'))
  console.log('=== CNC Restore ===\n')
  console.log('⚠ This will REPLACE all data. Press Ctrl+C to cancel.\n')
  await new Promise(r => setTimeout(r, 3000))

  for (const t of TABLES) {
    if (!data[t]) continue
    // Delete all existing
    await sb.from(t).delete().neq('id', 0)
    // Insert in batches
    let inserted = 0
    for (let i = 0; i < data[t].length; i += 500) {
      const batch = data[t].slice(i, i + 500).map(row => {
        const { id, ...rest } = row  // Remove id to let Supabase auto-generate
        return rest
      })
      await sb.from(t).insert(batch)
      inserted += batch.length
    }
    console.log(`  ${t}: ${inserted} rows restored`)
  }
  console.log('\nRestore complete.')
}

const cmd = process.argv[2]
if (cmd === 'restore') {
  const file = process.argv[3]
  if (!file) { console.log('Usage: node backup.js restore <path-to-backup.json>'); process.exit(1) }
  restore(file)
} else {
  backup()
}
