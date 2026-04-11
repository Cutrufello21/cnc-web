// POST /api/rules-apply
// Applies routing rule recommendations from the audit
// Body: { updates: [{ zip, day, to }] }

import { supabase } from './_lib/supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { updates } = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    if (!updates?.length) return res.status(400).json({ error: 'No updates provided' })

    let applied = 0
    let errors = []

    for (const u of updates) {
      const { error } = await supabase.from('routing_rules')
        .update({ [u.day]: u.to })
        .eq('zip_code', u.zip)

      if (error) {
        errors.push({ zip: u.zip, day: u.day, error: error.message })
      } else {
        applied++
      }
    }

    return res.status(200).json({ success: true, applied, errors: errors.length > 0 ? errors : undefined })
  } catch (err) {
    console.error('[rules-apply]', err)
    return res.status(500).json({ error: err.message })
  }
}
