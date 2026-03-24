import { appendRows, MASTER_SHEET_ID } from './sheets.js'

// POST /api/add-route
// Body: { zip, mon, tue, wed, thu, fri, route, pharmacy }
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  let body = ''
  await new Promise((resolve) => {
    req.on('data', (chunk) => { body += chunk })
    req.on('end', resolve)
  })

  const { zip, mon, tue, wed, thu, fri, route, pharmacy } = JSON.parse(body)

  if (!zip) return res.status(400).json({ error: 'ZIP code is required' })

  try {
    await appendRows(MASTER_SHEET_ID, 'Routing Rules!A1', [
      [zip, mon || '', tue || '', wed || '', thu || '', fri || '', route || '', pharmacy || '']
    ])

    return res.status(200).json({
      success: true,
      zip,
      message: `ZIP ${zip} added to routing rules`,
    })
  } catch (err) {
    console.error('[add-route API]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
