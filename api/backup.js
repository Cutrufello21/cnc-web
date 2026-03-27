import { supabase } from './_lib/supabase.js'

const TABLES = ['orders', 'drivers', 'routing_rules', 'dispatch_logs', 'payroll', 'daily_stops', 'unassigned_orders', 'time_off_requests', 'sort_list']
const CRON_SECRET = process.env.CRON_SECRET

async function fetchAll(table) {
  let all = [], offset = 0
  while (true) {
    const { data } = await supabase.from(table).select('*').range(offset, offset + 999)
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < 1000) break
    offset += 1000
  }
  return all
}

export default async function handler(req, res) {
  // Verify cron secret (Vercel sets this header for cron jobs)
  const authHeader = req.headers['authorization']
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const snapshot = {}
    const counts = {}

    for (const t of TABLES) {
      snapshot[t] = await fetchAll(t)
      counts[t] = snapshot[t].length
    }

    const totalRows = Object.values(counts).reduce((a, b) => a + b, 0)
    const sizeBytes = Buffer.byteLength(JSON.stringify(snapshot))
    const sizeMB = (sizeBytes / 1024 / 1024).toFixed(2)

    // Store backup in Supabase backups table
    const { error: insertError } = await supabase.from('backups').insert({
      snapshot: snapshot,
      table_counts: counts,
      total_rows: totalRows,
      size_mb: parseFloat(sizeMB),
      created_at: new Date().toISOString(),
    })

    if (insertError) throw insertError

    // Keep only last 30 backups — delete older ones
    const { data: allBackups } = await supabase.from('backups')
      .select('id, created_at')
      .order('created_at', { ascending: false })
    if (allBackups && allBackups.length > 30) {
      const toDelete = allBackups.slice(30).map(b => b.id)
      await supabase.from('backups').delete().in('id', toDelete)
    }

    console.log(`Backup complete: ${totalRows} rows, ${sizeMB} MB`)

    return res.status(200).json({
      ok: true,
      totalRows,
      sizeMB: parseFloat(sizeMB),
      counts,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Backup error:', err)

    // Log backup failure to error_logs
    try {
      await supabase.from('error_logs').insert({
        type: 'backup_failure',
        message: err.message,
        stack: err.stack,
        metadata: { tables: TABLES },
        created_at: new Date().toISOString(),
      })
    } catch (_) { /* best-effort */ }

    return res.status(500).json({ error: err.message })
  }
}
