import { supabase } from './_lib/supabase.js'
import formidable from 'formidable'
import fs from 'fs'

export const config = { api: { bodyParser: false } }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const form = formidable({ maxFileSize: 10 * 1024 * 1024 })
    const [fields, files] = await form.parse(req)

    const file = files.file?.[0]
    const path = fields.path?.[0]

    if (!file || !path) return res.status(400).json({ error: 'Missing file or path' })

    const fileBuffer = fs.readFileSync(file.filepath)
    const contentType = file.mimetype || 'image/jpeg'

    const { error } = await supabase.storage
      .from('POD')
      .upload(path, fileBuffer, { contentType, upsert: true })

    if (error) return res.status(500).json({ error: error.message })

    const { data } = supabase.storage.from('POD').getPublicUrl(path)
    return res.status(200).json({ url: data?.publicUrl })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
