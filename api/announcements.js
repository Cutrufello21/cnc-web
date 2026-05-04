import { supabase } from './_lib/supabase.js'
import { requireAuth } from './_lib/auth.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' })

  const user = await requireAuth(req, res, { allowApiSecret: true })
  if (!user) return

  try {
    const pharmacy = req.query.pharmacy || 'all'
    const driverId = req.query.driver_id || null
    const includeReads = req.query.reads === 'true'
    const now = new Date().toISOString()

    let query = supabase
      .from('announcements')
      .select('*')
      .eq('active', true)
      .or(`pharmacy.eq.all,pharmacy.eq.${pharmacy}`)
      .order('created_at', { ascending: false })

    const { data: announcements, error } = await query
    if (error) throw new Error(error.message)

    // Filter: expired, not yet scheduled, not targeted at this driver
    const active = (announcements || []).filter(a => {
      if (a.expires_at && new Date(a.expires_at) < new Date(now)) return false
      if (a.scheduled_for && new Date(a.scheduled_for) > new Date(now)) return false
      if (a.target_drivers && Array.isArray(a.target_drivers) && a.target_drivers.length > 0) {
        if (driverId && !a.target_drivers.includes(Number(driverId)) && !a.target_drivers.includes(String(driverId))) return false
        if (!driverId) return true // web portal sees all
      }
      return true
    })

    // Poll + signup response counts (signup needs them for "taken" slot UI on the driver app)
    const polls = active.filter(a => a.type === 'poll' || a.type === 'signup')
    if (polls.length > 0) {
      const pollIds = polls.map(p => p.id)
      const { data: responses } = await supabase
        .from('poll_responses')
        .select('announcement_id,response')
        .in('announcement_id', pollIds)
      for (const poll of polls) {
        const pollResponses = (responses || []).filter(r => r.announcement_id === poll.id)
        const counts = {}
        for (const r of pollResponses) { counts[r.response] = (counts[r.response] || 0) + 1 }
        poll.response_counts = counts
        poll.total_responses = pollResponses.length
      }
    }

    // Read receipts — attach counts (always) and full list (if requested from web)
    const allIds = active.map(a => a.id)
    if (allIds.length > 0) {
      const { data: reads } = await supabase
        .from('announcement_reads')
        .select('announcement_id,driver_id')
        .in('announcement_id', allIds)
      for (const a of active) {
        const r = (reads || []).filter(x => x.announcement_id === a.id)
        a.read_count = r.length
        if (includeReads) a.read_by = r.map(x => x.driver_id)
      }
    }

    return res.status(200).json({ announcements: active })
  } catch (err) {
    console.error('Announcements error:', err)
    return res.status(500).json({ error: err.message })
  }
}
