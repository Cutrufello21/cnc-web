import { fetchRange, updateCell, appendRows, MASTER_SHEET_ID } from './sheets.js'

// POST /api/routing
// Body: { action: 'update', zip, day, newDriver } — update existing
// Body: { action: 'add', zip, mon, tue, wed, thu, fri, route, pharmacy } — add new
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  let body = ''
  await new Promise((resolve) => {
    req.on('data', (chunk) => { body += chunk })
    req.on('end', resolve)
  })

  const data = JSON.parse(body)
  const action = data.action || 'update'

  try {
    if (action === 'add') {
      if (!data.zip) return res.status(400).json({ error: 'ZIP code is required' })
      await appendRows(MASTER_SHEET_ID, 'Routing Rules!A1', [
        [data.zip, data.mon || '', data.tue || '', data.wed || '', data.thu || '', data.fri || '', data.route || '', data.pharmacy || '']
      ])
      return res.status(200).json({ success: true, zip: data.zip, message: `ZIP ${data.zip} added` })
    }

    // Default: update
    const { zip, day, newDriver } = data
    if (!zip || !day || !newDriver) return res.status(400).json({ error: 'Missing zip, day, or newDriver' })

    const validDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
    if (!validDays.includes(day)) return res.status(400).json({ error: `Invalid day: ${day}` })

    const rows = await fetchRange(MASTER_SHEET_ID, 'Routing Rules!A1:H500')
    if (rows.length < 2) return res.status(400).json({ error: 'Routing Rules tab is empty' })

    const headers = rows[0].map((h) => h.trim())
    const zipIdx = headers.indexOf('ZIP Code')
    const dayIdx = headers.indexOf(day)
    if (zipIdx < 0 || dayIdx < 0) return res.status(400).json({ error: 'Column not found' })

    let targetRow = -1
    for (let i = 1; i < rows.length; i++) {
      if ((rows[i][zipIdx] || '').trim() === zip.trim()) { targetRow = i; break }
    }
    if (targetRow < 0) return res.status(404).json({ error: `ZIP ${zip} not found` })

    const colLetter = String.fromCharCode(65 + dayIdx)
    const cellRange = `Routing Rules!${colLetter}${targetRow + 1}`
    const oldDriver = rows[targetRow][dayIdx] || '(empty)'

    await updateCell(MASTER_SHEET_ID, cellRange, newDriver)
    return res.status(200).json({ success: true, zip, day, oldDriver, newDriver, cell: cellRange })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
