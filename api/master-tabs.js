import { getSheetTabs, MASTER_SHEET_ID } from './_lib/sheets.js'

// GET /api/master-tabs — returns list of all tabs in the Master Sheet
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const tabs = await getSheetTabs(MASTER_SHEET_ID)
    return res.status(200).json({
      tabs: tabs.map((t) => ({
        title: t.title,
        sheetId: t.sheetId,
        index: t.index,
      })),
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
