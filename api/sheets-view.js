import { supabase } from './_lib/supabase.js'

// Available tables that map to old sheet tabs
const TABLE_MAP = {
  'Orders': 'orders',
  'Drivers': 'drivers',
  'Routing Rules': 'routing_rules',
  'Log': 'dispatch_logs',
  'Weekly Stops': 'payroll',
  'Unassigned History': 'unassigned_orders',
}

// GET /api/sheets-view?action=tabs — list all tables
// GET /api/sheets-view?tab=Orders&rows=500 — get table data
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    if (req.query.action === 'tabs') {
      const tabs = Object.keys(TABLE_MAP).map((title, index) => ({
        title, sheetId: index, index,
      }))
      return res.status(200).json({ tabs })
    }

    const tab = req.query.tab
    if (!tab) return res.status(400).json({ error: 'Missing ?tab= or ?action=tabs' })

    const tableName = TABLE_MAP[tab]
    if (!tableName) return res.status(400).json({ error: `Unknown tab: ${tab}` })

    const maxRows = parseInt(req.query.rows) || 500
    const { data, error } = await supabase.from(tableName).select('*').limit(maxRows)
    if (error) throw error

    if (!data || data.length === 0) {
      return res.status(200).json({ tab, headers: [], data: [], rowCount: 0 })
    }

    const headers = Object.keys(data[0]).filter(k => k !== 'id' && k !== 'created_at')
    const mapped = data.map(row => {
      const obj = {}
      headers.forEach(h => { obj[h] = row[h] ?? '' })
      return obj
    })

    return res.status(200).json({ tab, headers, data: mapped, rowCount: mapped.length })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
