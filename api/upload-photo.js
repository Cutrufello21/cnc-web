import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export const config = {
  api: { bodyParser: false },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  try {
    // Parse multipart form data manually
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const buffer = Buffer.concat(chunks)

    // Extract boundary from content-type
    const contentType = req.headers['content-type'] || ''
    const boundaryMatch = contentType.match(/boundary=(.+)/)
    if (!boundaryMatch) return res.status(400).json({ error: 'Missing multipart boundary' })

    const boundary = boundaryMatch[1]
    const parts = parseMultipart(buffer, boundary)

    const filePart = parts.find(p => p.filename)
    const deliveryDate = parts.find(p => p.name === 'deliveryDate')?.data?.toString() || ''
    const orderId = parts.find(p => p.name === 'orderId')?.data?.toString() || ''

    if (!filePart) return res.status(400).json({ error: 'No file uploaded' })

    const ext = (filePart.filename.split('.').pop() || 'jpg').toLowerCase()
    const path = `${deliveryDate}/${orderId}_${Date.now()}.${ext}`

    const { error: uploadErr } = await supabase.storage
      .from('delivery-photos')
      .upload(path, filePart.data, {
        contentType: filePart.contentType || 'image/jpeg',
        upsert: false,
      })

    if (uploadErr) throw new Error(uploadErr.message)

    const { data: urlData } = supabase.storage
      .from('delivery-photos')
      .getPublicUrl(path)

    return res.status(200).json({ success: true, url: urlData?.publicUrl || null, path })
  } catch (err) {
    console.error('Upload error:', err)
    return res.status(500).json({ error: err.message })
  }
}

function parseMultipart(buffer, boundary) {
  const parts = []
  const boundaryBuffer = Buffer.from(`--${boundary}`)
  const str = buffer.toString('binary')
  const sections = str.split(`--${boundary}`).filter(s => s && s !== '--\r\n' && s !== '--')

  for (const section of sections) {
    if (section.trim() === '--' || !section.includes('\r\n\r\n')) continue

    const [headerPart, ...rest] = section.split('\r\n\r\n')
    const body = rest.join('\r\n\r\n')
    // Remove trailing \r\n
    const cleanBody = body.endsWith('\r\n') ? body.slice(0, -2) : body

    const headers = headerPart.trim()
    const nameMatch = headers.match(/name="([^"]+)"/)
    const filenameMatch = headers.match(/filename="([^"]+)"/)
    const ctMatch = headers.match(/Content-Type:\s*(.+)/i)

    parts.push({
      name: nameMatch?.[1] || '',
      filename: filenameMatch?.[1] || null,
      contentType: ctMatch?.[1]?.trim() || null,
      data: filenameMatch ? Buffer.from(cleanBody, 'binary') : Buffer.from(cleanBody),
    })
  }

  return parts
}
