import { supabase } from './_lib/supabase.js'
import { parseBody } from './_lib/sheets.js'
import { requireAuth } from './_lib/auth.js'

// Allowed tables and operations — everything else is blocked
const ALLOWED = {
  time_off_requests: ['insert', 'update'],
  delivery_confirmations: ['insert'],
  driver_routes: ['upsert'],
  daily_stops: ['update'],
  driver_notifications: ['update'],
  stop_reconciliation: ['insert', 'update', 'upsert'],
  driver_favorites: ['insert', 'delete'],
  mileage_log: ['upsert'],
  address_notes: ['upsert'],
  order_deletions: ['insert'],
}

// Generic DB write proxy — all client-side writes route through here
// Uses service role key, bypasses RLS
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Auth check — require valid Supabase JWT or API secret
  const user = await requireAuth(req, res, { allowApiSecret: true })
  if (!user) return

  const { table, operation, data, match, onConflict } = await parseBody(req)

  if (!table || !operation) {
    return res.status(400).json({ error: 'Missing table or operation' })
  }

  // Validate against allowed tables and operations
  const allowed = ALLOWED[table]
  if (!allowed) {
    return res.status(403).json({ error: `Table "${table}" is not accessible via this endpoint` })
  }
  if (!allowed.includes(operation)) {
    return res.status(403).json({ error: `Operation "${operation}" is not allowed on table "${table}"` })
  }

  try {
    let result

    if (operation === 'insert') {
      const { data: rows, error } = await supabase.from(table).insert(data).select()
      if (error) throw error
      result = rows
    }

    else if (operation === 'update') {
      if (!match) return res.status(400).json({ error: 'Missing match criteria for update' })
      let query = supabase.from(table).update(data)
      for (const [key, value] of Object.entries(match)) {
        query = query.eq(key, value)
      }
      const { data: rows, error } = await query.select()
      if (error) throw error
      result = rows
    }

    else if (operation === 'delete') {
      if (!match) return res.status(400).json({ error: 'Missing match criteria for delete' })
      let query = supabase.from(table).delete()
      for (const [key, value] of Object.entries(match)) {
        query = query.eq(key, value)
      }
      const { data: rows, error } = await query.select()
      if (error) throw error
      result = rows
    }

    else if (operation === 'upsert') {
      const opts = onConflict ? { onConflict } : {}
      const { data: rows, error } = await supabase.from(table).upsert(data, opts).select()
      if (error) throw error
      result = rows
    }

    else {
      return res.status(400).json({ error: `Unknown operation: ${operation}` })
    }

    return res.status(200).json({ success: true, data: result })
  } catch (err) {
    console.error(`[db ${operation}] ${table}:`, err.message)
    return res.status(500).json({ error: err.message })
  }
}
