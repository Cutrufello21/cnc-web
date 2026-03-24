import { supabase } from './_lib/supabase.js'
import { parseBody } from './_lib/sheets.js'

// POST /api/routing
// Body: { action: 'update', zip, day, newDriver } — update existing
// Body: { action: 'add', zip, mon, tue, wed, thu, fri, route, pharmacy } — add new

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const data = await parseBody(req)
  const action = data.action || 'update'

  try {
    if (action === 'add') {
      if (!data.zip) return res.status(400).json({ error: 'ZIP code is required' })

      const { error } = await supabase.from('routing_rules').upsert({
        zip_code: data.zip,
        mon: data.mon || '', tue: data.tue || '', wed: data.wed || '',
        thu: data.thu || '', fri: data.fri || '',
        route: data.route || '', pharmacy: data.pharmacy || '',
      }, { onConflict: 'zip_code' })

      if (error) throw error
      return res.status(200).json({ success: true, zip: data.zip, message: `ZIP ${data.zip} added` })
    }

    // Default: update a single day assignment
    const { zip, day, newDriver } = data
    if (!zip || !day || !newDriver) return res.status(400).json({ error: 'Missing zip, day, or newDriver' })

    const validDays = { Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri' }
    const col = validDays[day]
    if (!col) return res.status(400).json({ error: `Invalid day: ${day}` })

    // Get current value for response
    const { data: current } = await supabase.from('routing_rules')
      .select(col).eq('zip_code', zip.trim()).single()

    if (!current) return res.status(404).json({ error: `ZIP ${zip} not found` })

    const oldDriver = current[col] || '(empty)'
    const { error } = await supabase.from('routing_rules')
      .update({ [col]: newDriver }).eq('zip_code', zip.trim())

    if (error) throw error
    return res.status(200).json({ success: true, zip, day, oldDriver, newDriver })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
