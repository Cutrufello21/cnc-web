import { supabase } from './_lib/supabase.js'

const CRON_SECRET = process.env.CRON_SECRET

export default async function handler(req, res) {
  // Auth: only cron or manual trigger with secret
  const authHeader = req.headers['authorization']
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
    const dow = now.getDay() // 0=Sun, 5=Fri, 6=Sat
    const hour = now.getHours()

    // Calculate the delivery date we're advancing TO
    let daysAhead = 1
    if (dow === 5) daysAhead = 3       // Friday → Monday
    else if (dow === 6) daysAhead = 2   // Saturday → Monday
    const target = new Date(now)
    target.setDate(target.getDate() + daysAhead)
    const targetDate = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`

    const results = { date: targetDate, actions: [] }

    // Check if stops exist for target date
    const { count } = await supabase
      .from('daily_stops')
      .select('*', { count: 'exact', head: true })
      .eq('delivery_date', targetDate)

    results.stopsReady = count || 0
    results.actions.push(`${count || 0} stops found for ${targetDate}`)

    // Friday midnight: lock weekly reconciliation
    if (dow === 6 && hour < 6) {
      // It's Saturday early AM (ran from Friday midnight cron)
      const weekMon = new Date(now)
      weekMon.setDate(weekMon.getDate() - (dow === 0 ? 6 : dow - 1))
      const weekOf = `${weekMon.getFullYear()}-${String(weekMon.getMonth() + 1).padStart(2, '0')}-${String(weekMon.getDate()).padStart(2, '0')}`

      const { data: unlocked } = await supabase
        .from('stop_reconciliation')
        .select('id')
        .eq('week_of', weekOf)
        .eq('locked', false)

      if (unlocked?.length > 0) {
        await supabase
          .from('stop_reconciliation')
          .update({ locked: true })
          .eq('week_of', weekOf)
          .eq('locked', false)

        results.actions.push(`Locked ${unlocked.length} reconciliation rows for week of ${weekOf}`)
      } else {
        results.actions.push(`Reconciliation already locked for week of ${weekOf}`)
      }
    }

    // Log the advance
    console.log('[advance-day]', JSON.stringify(results))
    return res.status(200).json({ success: true, ...results })
  } catch (err) {
    console.error('[advance-day]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
