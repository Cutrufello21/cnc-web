import { supabase } from './_lib/supabase.js'
import { requireAuth } from './_lib/auth.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' })

  const user = await requireAuth(req, res, { allowApiSecret: true })
  if (!user) return

  try {
    const pharmacy = req.query.pharmacy || 'all'
    const now = new Date().toISOString()

    // Fetch active announcements for this pharmacy (or 'all')
    let query = supabase
      .from('announcements')
      .select('*')
      .eq('active', true)
      .or(`pharmacy.eq.all,pharmacy.eq.${pharmacy}`)
      .order('created_at', { ascending: false })

    const { data: announcements, error } = await query
    if (error) throw new Error(error.message)

    // Filter expired on server side (or.is.null handles no expiry)
    const active = (announcements || []).filter(
      a => !a.expires_at || new Date(a.expires_at) > new Date(now)
    )

    // For polls, fetch response counts
    const polls = active.filter(a => a.type === 'poll')
    if (polls.length > 0) {
      const pollIds = polls.map(p => p.id)
      const { data: responses } = await supabase
        .from('poll_responses')
        .select('announcement_id,response')
        .in('announcement_id', pollIds)

      // Attach response counts to each poll
      for (const poll of polls) {
        const pollResponses = (responses || []).filter(r => r.announcement_id === poll.id)
        const counts = {}
        for (const r of pollResponses) {
          counts[r.response] = (counts[r.response] || 0) + 1
        }
        poll.response_counts = counts
        poll.total_responses = pollResponses.length
      }
    }

    return res.status(200).json({ announcements: active })
  } catch (err) {
    console.error('Announcements error:', err)
    return res.status(500).json({ error: err.message })
  }
}
