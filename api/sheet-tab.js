import { fetchRange, MASTER_SHEET_ID } from './_lib/sheets.js'

// GET /api/sheet-tab?tab=Routing Rules&rows=500
// Returns any tab from the Master Sheet as JSON
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const tab = req.query.tab
  const maxRows = parseInt(req.query.rows) || 500

  if (!tab) {
    return res.status(400).json({ error: 'Missing ?tab= parameter' })
  }

  try {
    const rows = await fetchRange(MASTER_SHEET_ID, `'${tab}'!A1:Z${maxRows}`)

    if (rows.length === 0) {
      return res.status(200).json({ tab, headers: [], data: [], rowCount: 0 })
    }

    const headers = rows[0].map((h) => h.trim())
    const data = rows.slice(1)
      .filter((r) => r.some((cell) => cell?.trim()))
      .map((row) => {
        const obj = {}
        headers.forEach((h, i) => { obj[h] = row[i] || '' })
        return obj
      })

    return res.status(200).json({
      tab,
      headers,
      data,
      rowCount: data.length,
    })
  } catch (err) {
    console.error('[sheet-tab API]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
