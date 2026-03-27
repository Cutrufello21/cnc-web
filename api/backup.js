import { supabase } from './_lib/supabase.js'

const TABLES = ['drivers', 'routing_rules', 'payroll', 'driver_schedule', 'time_off_requests', 'sort_list', 'profiles']
const CRON_SECRET = process.env.CRON_SECRET

export default async function handler(req, res) {
  const authHeader = req.headers['authorization']
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const counts = {}

    for (const t of TABLES) {
      const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true })
      if (error) throw error
      counts[t] = count
    }

    const totalRows = Object.values(counts).reduce((a, b) => a + b, 0)

    // Store only metadata — no snapshot blob
    const { error: insertError } = await supabase.from('backups').insert({
      snapshot: {},
      table_counts: counts,
      total_rows: totalRows,
      size_mb: 0,
      created_at: new Date().toISOString(),
    })

    if (insertError) throw insertError

    // Keep only last 30 records
    const { data: allBackups } = await supabase.from('backups')
      .select('id, created_at')
      .order('created_at', { ascending: false })
    if (allBackups && allBackups.length > 30) {
      const toDelete = allBackups.slice(30).map(b => b.id)
      await supabase.from('backups').delete().in('id', toDelete)
    }

    console.log(`Backup check complete: ${totalRows} rows across ${TABLES.length} tables`)

    return res.status(200).json({
      ok: true,
      totalRows,
      counts,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Backup error:', err)

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
