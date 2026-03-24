import { fetchRange, getSheetTabs, MASTER_SHEET_ID } from './_lib/sheets.js'

// GET /api/sheets-view?action=tabs — list all tabs
// GET /api/sheets-view?tab=Routing Rules&rows=500 — get tab data
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    if (req.query.action === 'tabs') {
      const tabs = await getSheetTabs(MASTER_SHEET_ID)
      return res.status(200).json({
        tabs: tabs.map((t) => ({ title: t.title, sheetId: t.sheetId, index: t.index })),
      })
    }

    const tab = req.query.tab
    if (!tab) return res.status(400).json({ error: 'Missing ?tab= or ?action=tabs' })

    const maxRows = parseInt(req.query.rows) || 500
    const rows = await fetchRange(MASTER_SHEET_ID, `'${tab}'!A1:Z${maxRows}`)
    if (rows.length === 0) return res.status(200).json({ tab, headers: [], data: [], rowCount: 0 })

    const headers = rows[0].map((h) => h.trim())
    const data = rows.slice(1)
      .filter((r) => r.some((cell) => cell?.trim()))
      .map((row) => { const obj = {}; headers.forEach((h, i) => { obj[h] = row[i] || '' }); return obj })

    return res.status(200).json({ tab, headers, data, rowCount: data.length })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
