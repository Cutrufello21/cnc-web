import { fetchRange, updateCell, MASTER_SHEET_ID } from './sheets.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  let body = ''
  await new Promise((resolve) => {
    req.on('data', (chunk) => { body += chunk })
    req.on('end', resolve)
  })

  const { zip, day, newDriver } = JSON.parse(body)

  if (!zip || !day || !newDriver) {
    return res.status(400).json({ error: 'Missing required fields: zip, day, newDriver' })
  }

  const validDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  if (!validDays.includes(day)) {
    return res.status(400).json({ error: `Invalid day: ${day}. Must be Mon-Fri` })
  }

  try {
    const rows = await fetchRange(MASTER_SHEET_ID, 'Routing Rules!A1:H500')
    if (rows.length < 2) {
      return res.status(400).json({ error: 'Routing Rules tab is empty' })
    }

    const headers = rows[0].map((h) => h.trim())
    const zipIdx = headers.indexOf('ZIP Code')
    const dayIdx = headers.indexOf(day)

    if (zipIdx < 0) return res.status(400).json({ error: 'Cannot find ZIP Code column' })
    if (dayIdx < 0) return res.status(400).json({ error: `Cannot find ${day} column` })

    let targetRow = -1
    for (let i = 1; i < rows.length; i++) {
      if ((rows[i][zipIdx] || '').trim() === zip.trim()) {
        targetRow = i
        break
      }
    }

    if (targetRow < 0) {
      return res.status(404).json({ error: `ZIP ${zip} not found in Routing Rules` })
    }

    const colLetter = String.fromCharCode(65 + dayIdx)
    const cellRange = `Routing Rules!${colLetter}${targetRow + 1}`
    const oldDriver = rows[targetRow][dayIdx] || '(empty)'

    await updateCell(MASTER_SHEET_ID, cellRange, newDriver)

    return res.status(200).json({ success: true, zip, day, oldDriver, newDriver, cell: cellRange })
  } catch (err) {
    console.error('[update-route API]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
