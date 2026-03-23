import { writeFileSync } from 'fs'
import { join } from 'path'

// POST /api/approve — triggers the equivalent of `touch approve.txt`
// This writes the approval signal file that cnc-dispatch watches for
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Write the approval signal file
    // cnc-dispatch checks for /tmp/cnc_approval.txt or approve.txt in the project dir
    const signalPaths = [
      '/tmp/cnc_approval.txt',
    ]

    const timestamp = new Date().toISOString()
    const content = `approved_at=${timestamp}\nsource=cnc-web\n`

    for (const path of signalPaths) {
      try {
        writeFileSync(path, content)
      } catch {
        // May not have permissions for all paths in production
      }
    }

    // Also try the cnc-dispatch directory
    try {
      writeFileSync(
        join(process.env.HOME || '/tmp', 'Desktop', 'cnc-dispatch', 'approve.txt'),
        content
      )
    } catch {
      // OK if this fails in production
    }

    return res.status(200).json({
      success: true,
      approved_at: timestamp,
      message: 'Routes approved — drivers will be notified',
    })
  } catch (err) {
    console.error('Approve error:', err)
    return res.status(500).json({ error: err.message })
  }
}
