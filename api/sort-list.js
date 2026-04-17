import { supabase } from './_lib/supabase.js'
import { parseBody } from './_lib/sheets.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const data = await parseBody(req)

  try {
    if (data.action === 'insert') {
      const { error } = await supabase.from('sort_list').insert(data.rows)
      if (error) throw error
      return res.status(200).json({ success: true })
    }

    if (data.action === 'update') {
      const updates = {}
      if (data.display_text !== undefined) updates.display_text = data.display_text
      if (data.checked !== undefined) updates.checked = data.checked
      if (data.late_start !== undefined) updates.late_start = data.late_start
      if (data.manual_override !== undefined) updates.manual_override = data.manual_override
      const { error } = await supabase.from('sort_list').update(updates).eq('id', data.id)
      if (error) throw error
      return res.status(200).json({ success: true })
    }

    if (data.action === 'delete') {
      const { error } = await supabase.from('sort_list').delete().eq('id', data.id)
      if (error) throw error
      return res.status(200).json({ success: true })
    }

    return res.status(400).json({ error: 'Unknown action' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
