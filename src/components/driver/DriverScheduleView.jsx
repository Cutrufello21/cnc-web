import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import './DriverScheduleView.css'

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F']
const DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const DAY_COLS = ['mon', 'tue', 'wed', 'thu', 'fri']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

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
    const now = new Date()
    const dow = now.getDay()
    const mondayOffset = dow === 0 ? -6 : 1 - dow
    const thisMonday = new Date(now)
    thisMonday.setDate(now.getDate() + mondayOffset)

    const endDate = new Date(thisMonday)
    endDate.setDate(endDate.getDate() + 20)
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

  // Build flat list of all days across 3 weeks
  const allDays = useMemo(() => {
    const now = new Date()
    const dow = now.getDay()
    const mondayOffset = dow === 0 ? -6 : 1 - dow
    const days = []

    for (let w = 0; w < 3; w++) {
      for (let i = 0; i < 5; i++) {
        const d = new Date(now)
        d.setDate(now.getDate() + mondayOffset + w * 7 + i)
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        const col = DAY_COLS[i]

        const to = timeOff.find(r => r.date_off === dateStr)
        if (to) {
          days.push({ date: d, dateStr, dayIdx: i, type: 'timeoff', status: to.status })
          continue
        }

        if (!schedule || (schedule[col] !== false && schedule[col] !== 'false' && schedule[col] !== 0)) {
          const shift = schedule?.[`${col}_shift`] || 'AM'
          const pharm = schedule?.[`${col}_pharm`] || 'SHSP'
          days.push({ date: d, dateStr, dayIdx: i, type: 'working', shift, pharm })
        } else {
          days.push({ date: d, dateStr, dayIdx: i, type: 'off' })
        }
      }
    }
    return days
  }, [schedule, timeOff])

  const todayStr = useMemo(() => {
    const t = new Date()
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
  }, [])

  if (loading) return <div className="dsv__loading"><div className="dispatch__spinner" />Loading schedule...</div>

  // Find today's index for initial scroll
  const todayIdx = allDays.findIndex(d => d.dateStr === todayStr)

  return (
    <div className="dsv">
      <div className="dsv__cards">
        {allDays.map((day, idx) => {
          const isToday = day.dateStr === todayStr
          const isPast = day.dateStr < todayStr
          const month = MONTH_NAMES[day.date.getMonth()].toUpperCase()
          const dateNum = day.date.getDate()
          const dayLetter = DAY_LETTERS[day.dayIdx]
          const isMonday = day.dayIdx === 0

          // Color class
          let colorClass = 'dsv__card--shsp'
          if (day.type === 'off') colorClass = 'dsv__card--off'
          else if (day.type === 'timeoff') colorClass = 'dsv__card--timeoff'
          else if (day.shift === 'PM') colorClass = 'dsv__card--pm'
          else if (day.shift === 'BOTH') colorClass = 'dsv__card--ampm'
          else if (day.pharm === 'Aultman') colorClass = 'dsv__card--aultman'

          return (
            <div key={idx}>
              {/* Week separator */}
              {isMonday && idx > 0 && <div className="dsv__week-divider" />}

              <div className={`dsv__card ${colorClass} ${isToday ? 'dsv__card--today' : ''} ${isPast ? 'dsv__card--past' : ''}`}>
                {/* Month label on first day or month change */}
                {(idx === 0 || day.date.getMonth() !== allDays[idx - 1]?.date.getMonth()) && (
                  <div className="dsv__card-month">{month}</div>
                )}

                <div className="dsv__card-main">
                  <div className="dsv__card-left">
                    <span className="dsv__card-letter">{dayLetter}</span>
                    <span className="dsv__card-date">{dateNum}</span>
                  </div>

                  <div className="dsv__card-right">
                    {day.type === 'working' && (
                      <>
                        <span className="dsv__card-shift">
                          {day.shift === 'PM' ? 'PM Shift' : day.shift === 'BOTH' ? 'AM + PM' : day.pharm}
                        </span>
                        <span className="dsv__card-detail">
                          {day.shift === 'PM' ? day.pharm : day.shift === 'BOTH' ? day.pharm : DAY_FULL[day.dayIdx]}
                        </span>
                      </>
                    )}
                    {day.type === 'timeoff' && (
                      <>
                        <span className="dsv__card-shift">Time Off</span>
                        <span className="dsv__card-detail">{day.status === 'approved' ? 'Approved' : 'Pending Approval'}</span>
                      </>
                    )}
                    {day.type === 'off' && (
                      <>
                        <span className="dsv__card-shift">Off</span>
                        <span className="dsv__card-detail">{DAY_FULL[day.dayIdx]}</span>
                      </>
                    )}
                  </div>
                </div>

                {isToday && <div className="dsv__card-now">TODAY</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
