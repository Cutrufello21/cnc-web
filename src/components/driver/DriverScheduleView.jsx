import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import './DriverScheduleView.css'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const DAY_COLS = ['mon', 'tue', 'wed', 'thu', 'fri']

export default function DriverScheduleView({ driverName }) {
  const [schedule, setSchedule] = useState(null)
  const [timeOff, setTimeOff] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!driverName) return
    loadSchedule()
  }, [driverName])

  async function loadSchedule() {
    setLoading(true)
    // Fetch driver's default schedule + time off for next 3 weeks
    const now = new Date()
    const dow = now.getDay()
    const mondayOffset = dow === 0 ? -6 : 1 - dow
    const thisMonday = new Date(now)
    thisMonday.setDate(now.getDate() + mondayOffset)

    // 3 weeks of dates
    const endDate = new Date(thisMonday)
    endDate.setDate(endDate.getDate() + 20) // 3 weeks of Fridays
    const startStr = `${thisMonday.getFullYear()}-${String(thisMonday.getMonth() + 1).padStart(2, '0')}-${String(thisMonday.getDate()).padStart(2, '0')}`
    const endStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`

    const [schedRes, toRes] = await Promise.all([
      supabase.from('driver_schedule').select('*').eq('driver_name', driverName).single(),
      supabase.from('time_off_requests').select('*')
        .eq('driver_name', driverName)
        .gte('date_off', startStr)
        .lte('date_off', endStr)
        .in('status', ['approved', 'pending']),
    ])

    setSchedule(schedRes.data || null)
    setTimeOff(toRes.data || [])
    setLoading(false)
  }

  // Build 3 weeks of data
  const weeks = useMemo(() => {
    const now = new Date()
    const dow = now.getDay()
    const mondayOffset = dow === 0 ? -6 : 1 - dow
    const result = []

    for (let w = 0; w < 3; w++) {
      const monday = new Date(now)
      monday.setDate(now.getDate() + mondayOffset + w * 7)
      const days = []

      for (let i = 0; i < 5; i++) {
        const d = new Date(monday)
        d.setDate(monday.getDate() + i)
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        const col = DAY_COLS[i]

        // Check time off
        const to = timeOff.find(r => r.date_off === dateStr)
        if (to) {
          days.push({ date: d, dateStr, type: 'timeoff', status: to.status })
          continue
        }

        // Check default schedule
        if (!schedule || (schedule[col] !== false && schedule[col] !== 'false' && schedule[col] !== 0)) {
          const shift = schedule?.[`${col}_shift`] || 'AM'
          const pharm = schedule?.[`${col}_pharm`] || 'SHSP'
          days.push({ date: d, dateStr, type: 'working', shift, pharm })
        } else {
          days.push({ date: d, dateStr, type: 'off' })
        }
      }

      const weekLabel = `${monday.getMonth() + 1}/${monday.getDate()}`
      const fri = new Date(monday)
      fri.setDate(monday.getDate() + 4)
      const friLabel = `${fri.getMonth() + 1}/${fri.getDate()}`
      result.push({ monday, label: `${weekLabel} – ${friLabel}`, days, isThisWeek: w === 0 })
    }

    return result
  }, [schedule, timeOff])

  const todayStr = useMemo(() => {
    const t = new Date()
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
  }, [])

  if (loading) return <div className="dsv__loading">Loading schedule...</div>

  return (
    <div className="dsv">
      <h3 className="dsv__title">Your Schedule</h3>

      {weeks.map((week, wi) => (
        <div key={wi} className={`dsv__week ${week.isThisWeek ? 'dsv__week--current' : ''}`}>
          <div className="dsv__week-label">
            {week.isThisWeek ? 'This Week' : `Week of ${week.label}`}
          </div>
          <div className="dsv__days">
            {week.days.map((day, di) => {
              const isToday = day.dateStr === todayStr
              return (
                <div key={di} className={`dsv__day ${isToday ? 'dsv__day--today' : ''}`}>
                  <div className="dsv__day-header">
                    <span className="dsv__day-name">{DAY_LABELS[di]}</span>
                    <span className="dsv__day-date">{day.date.getMonth() + 1}/{day.date.getDate()}</span>
                  </div>
                  <div className={`dsv__day-body dsv__day-body--${day.type} ${day.type === 'working' && day.shift === 'PM' ? 'dsv__day-body--pm' : ''} ${day.type === 'working' && day.shift === 'BOTH' ? 'dsv__day-body--ampm' : ''} ${day.type === 'working' && day.pharm === 'Aultman' ? 'dsv__day-body--aultman' : ''}`}>
                    {day.type === 'working' && (
                      <>
                        <span className="dsv__day-shift">
                          {day.shift === 'PM' ? 'PM' : day.shift === 'BOTH' ? 'AM + PM' : day.pharm}
                        </span>
                        {day.shift !== 'AM' && <span className="dsv__day-pharm">{day.pharm}</span>}
                      </>
                    )}
                    {day.type === 'timeoff' && (
                      <>
                        <span className="dsv__day-off-label">Time Off</span>
                        <span className="dsv__day-off-status">{day.status === 'approved' ? 'Approved' : 'Pending'}</span>
                      </>
                    )}
                    {day.type === 'off' && (
                      <span className="dsv__day-off-label">Off</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
