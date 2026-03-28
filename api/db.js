import { supabase } from './_lib/supabase.js'
import { parseBody } from './_lib/sheets.js'

// Generic DB write proxy — all client-side writes route through here
// Uses service role key, bypasses RLS
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { table, operation, data, match, onConflict } = await parseBody(req)

  if (!table || !operation) {
    return res.status(400).json({ error: 'Missing table or operation' })
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
