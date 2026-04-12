// GET /api/release-schedule
// Triggered by Vercel cron every Sunday at 12 PM ET (16:00 UTC)
// Sends push notifications to all drivers with their upcoming 2-week schedule

import { supabase } from './_lib/supabase.js'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const DAY_COLS = ['mon', 'tue', 'wed', 'thu', 'fri']

export default async function handler(req, res) {
  try {
    // Calculate upcoming 2 weeks (next Monday through Friday of week after)
    const now = new Date()
    const dow = now.getDay()
    // Next Monday: if today is Sunday (0), next Monday is tomorrow (1 day ahead)
    const daysToMonday = dow === 0 ? 1 : 8 - dow
    const nextMonday = new Date(now)
    nextMonday.setDate(now.getDate() + daysToMonday)

    // Build date strings for 2 weeks
    const weekDates = []
    for (let w = 0; w < 2; w++) {
      for (let i = 0; i < 5; i++) {
        const d = new Date(nextMonday)
        d.setDate(nextMonday.getDate() + w * 7 + i)
        weekDates.push({
          date: d,
          dateStr: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
          dayIdx: i,
          week: w,
        })
      }
    }

    const startStr = weekDates[0].dateStr
    const endStr = weekDates[weekDates.length - 1].dateStr

    // Fetch data
    const [driversRes, schedRes, timeOffRes] = await Promise.all([
      supabase.from('drivers').select('driver_name, driver_number, pharmacy, shift, active').eq('active', true),
      supabase.from('driver_schedule').select('*'),
      supabase.from('time_off_requests').select('driver_name, date_off, status')
        .gte('date_off', startStr).lte('date_off', endStr)
        .in('status', ['approved', 'pending']),
    ])

    const drivers = (driversRes.data || []).filter(d => d.driver_name !== 'Demo Driver')
    const schedMap = {}
    ;(schedRes.data || []).forEach(s => { schedMap[s.driver_name] = s })
    const timeOffMap = {}
    ;(timeOffRes.data || []).forEach(r => {
      if (!timeOffMap[r.driver_name]) timeOffMap[r.driver_name] = new Set()
      timeOffMap[r.driver_name].add(r.date_off)
    })

    // Week labels
    const week1Mon = weekDates[0].date
    const week1Fri = weekDates[4].date
    const week2Mon = weekDates[5].date
    const week2Fri = weekDates[9].date
    const week1Label = `${week1Mon.getMonth() + 1}/${week1Mon.getDate()} – ${week1Fri.getMonth() + 1}/${week1Fri.getDate()}`
    const week2Label = `${week2Mon.getMonth() + 1}/${week2Mon.getDate()} – ${week2Fri.getMonth() + 1}/${week2Fri.getDate()}`

    // Build notifications per driver
    let sentCount = 0
    const errors = []

    for (const driver of drivers) {
      const sched = schedMap[driver.driver_name] || {}
      const offDates = timeOffMap[driver.driver_name] || new Set()

      const week1Days = []
      const week2Days = []

      for (const wd of weekDates) {
        const col = DAY_COLS[wd.dayIdx]
        const isOff = offDates.has(wd.dateStr)
        const isScheduledOff = sched[col] === false || sched[col] === 'false' || sched[col] === 0

        if (isOff) {
          const target = wd.week === 0 ? week1Days : week2Days
          target.push(`${DAY_LABELS[wd.dayIdx]} OFF`)
        } else if (isScheduledOff) {
          // Default off, skip — don't list in notification
        } else {
          const shift = sched[`${col}_shift`] || 'AM'
          const pharm = sched[`${col}_pharm`] || driver.pharmacy || 'SHSP'
          const label = shift === 'PM' ? 'PM' : shift === 'BOTH' ? 'AM+PM' : (pharm === 'Aultman' ? 'Aultman' : 'SHSP')
          const target = wd.week === 0 ? week1Days : week2Days
          target.push(`${DAY_LABELS[wd.dayIdx]} (${label})`)
        }
      }

      // Skip drivers with no working days
      if (week1Days.length === 0 && week2Days.length === 0) continue

      const firstName = driver.driver_name.split(' ')[0]
      const title = `${firstName}, your work schedule has been posted`
      const body = `${week1Mon.getMonth() + 1}/${week1Mon.getDate()} – ${week2Fri.getMonth() + 1}/${week2Fri.getDate()}`

      try {
        await fetch(`https://cncdelivery.com/api/actions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'push_notify',
            driverNames: [driver.driver_name],
            title,
            body,
          }),
        })
        sentCount++
      } catch (err) {
        errors.push({ driver: driver.driver_name, error: err.message })
      }
    }

    // Log the release
    await supabase.from('dispatch_decisions').insert({
      delivery_date: startStr,
      delivery_day: 'Sunday',
      decision_type: 'schedule_released',
      context: `2-week schedule released to ${sentCount} drivers (${week1Label} + ${week2Label})`,
    }).catch(() => {})

    return res.status(200).json({
      success: true,
      sent: sentCount,
      week1: week1Label,
      week2: week2Label,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    console.error('[release-schedule]', err)
    return res.status(500).json({ error: err.message })
  }
}
