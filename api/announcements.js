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

    // Admins see every announcement regardless of pharmacy or target_drivers —
    // they need full visibility to manage the comms feed (e.g., push reminders
    // for a sign-up they themselves aren't a target of).
    let isAdmin = false
    if (driverId) {
      const { data: drv } = await supabase.from('drivers').select('is_admin').eq('id', driverId).maybeSingle()
      isAdmin = !!drv?.is_admin
    }

    let query = supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false })
    if (!isAdmin) {
      // Non-admins only see active + pharmacy-matched rows
      query = query.eq('active', true).or(`pharmacy.eq.all,pharmacy.eq.${pharmacy}`)
    }

    const { data: announcements, error } = await query
    if (error) throw new Error(error.message)

    // Filter: expired, not yet scheduled, not targeted at this driver
    const active = (announcements || []).filter(a => {
      if (a.expires_at && new Date(a.expires_at) < new Date(now)) return false
      if (a.scheduled_for && new Date(a.scheduled_for) > new Date(now)) return false
      if (a.target_drivers && Array.isArray(a.target_drivers) && a.target_drivers.length > 0) {
        if (isAdmin) return true
        if (driverId && !a.target_drivers.includes(Number(driverId)) && !a.target_drivers.includes(String(driverId))) return false
        if (!driverId) return true // web portal sees all
      }
      return true
    })

    // Poll/sign-up response counts — both types use poll_responses for the data.
    // Also attach my_vote for the requesting driver here (server-side) because
    // RLS blocks the driver app from reading poll_responses directly.
    const polls = active.filter(a => a.type === 'poll' || a.type === 'signup')
    if (polls.length > 0) {
      const pollIds = polls.map(p => p.id)
      const { data: responses } = await supabase
        .from('poll_responses')
        .select('announcement_id,response,driver_id')
        .in('announcement_id', pollIds)
      const driverIdNum = driverId ? Number(driverId) : null

      // For sign-ups, also look up target + respondent driver names so we can
      // show "still needs to pick" lists and slot-reminder sent status.
      const allDriverIds = new Set()
      for (const poll of polls) {
        if (poll.type === 'signup' && Array.isArray(poll.target_drivers)) {
          poll.target_drivers.forEach(id => { const n = Number(id); if (n) allDriverIds.add(n) })
        }
      }
      ;(responses || []).forEach(r => { const n = Number(r.driver_id); if (n) allDriverIds.add(n) })
      let driverNameById = new Map()
      if (allDriverIds.size > 0) {
        const { data: drivers } = await supabase.from('drivers').select('id,driver_name').in('id', [...allDriverIds])
        driverNameById = new Map((drivers || []).map(d => [d.id, d.driver_name]))
      }

      // Existing slot reminders (from driver_notifications) — body matches
      // "Your slot: <response>" with title = announcement title. Used to
      // surface who's already been reminded vs not.
      const signupTitles = [...new Set(polls.filter(p => p.type === 'signup').map(p => p.title))]
      const allSlotBodies = [...new Set((responses || []).map(r => `Your slot: ${r.response}`))]
      let remindedByKey = new Set()
      if (signupTitles.length > 0 && allSlotBodies.length > 0) {
        const { data: notifs } = await supabase
          .from('driver_notifications')
          .select('driver_name,title,body')
          .in('title', signupTitles)
          .in('body', allSlotBodies)
        remindedByKey = new Set((notifs || []).map(n => `${n.title}|${n.driver_name}|${n.body}`))
      }

      for (const poll of polls) {
        const pollResponses = (responses || []).filter(r => r.announcement_id === poll.id)
        const counts = {}
        for (const r of pollResponses) { counts[r.response] = (counts[r.response] || 0) + 1 }
        poll.response_counts = counts
        poll.total_responses = pollResponses.length
        if (driverIdNum != null) {
          const mine = pollResponses.find(r => Number(r.driver_id) === driverIdNum)
          if (mine) poll.my_vote = mine.response
        }
        // Unsigned target drivers (sign-ups only)
        if (poll.type === 'signup' && Array.isArray(poll.target_drivers) && poll.target_drivers.length > 0) {
          const respondedIds = new Set(pollResponses.map(r => Number(r.driver_id)))
          const unsigned = []
          for (const id of poll.target_drivers) {
            const n = Number(id)
            if (!n || respondedIds.has(n)) continue
            const name = driverNameById.get(n) || `Driver #${n}`
            unsigned.push({ id: n, driver_name: name })
          }
          poll.unsigned_drivers = unsigned
        }

        // Slot-reminder status: who among the respondents has been pushed
        // their slot vs who hasn't.
        if (poll.type === 'signup') {
          const reminded = []
          const notReminded = []
          for (const r of pollResponses) {
            const n = Number(r.driver_id)
            const name = driverNameById.get(n) || `Driver #${n}`
            const item = { id: n, driver_name: name, slot: r.response }
            const key = `${poll.title}|${name}|Your slot: ${r.response}`
            if (remindedByKey.has(key)) reminded.push(item)
            else notReminded.push(item)
          }
          poll.slot_reminded = reminded
          poll.slot_not_reminded = notReminded
        }
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
