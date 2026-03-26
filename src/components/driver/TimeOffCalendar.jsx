import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import './TimeOffCalendar.css'

export default function TimeOffCalendar({ driverName }) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [requestSent, setRequestSent] = useState(false)
  const [startDate, setStartDate] = useState(null)
  const [endDate, setEndDate] = useState(null)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [myRequests, setMyRequests] = useState([])

  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  const today = new Date()
  const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  useEffect(() => { loadRequests() }, [driverName])

  async function loadRequests() {
    if (!driverName) return
    const { data } = await supabase.from('time_off_requests').select('*')
      .eq('driver_name', driverName).neq('reason', 'Scheduled off').order('date_off', { ascending: true })
    setMyRequests(data || [])
  }

  function prevMonth() { setCurrentMonth(new Date(year, month - 1, 1)) }
  function nextMonth() { setCurrentMonth(new Date(year, month + 1, 1)) }

  function handleDateClick(day) {
    const date = new Date(year, month, day)
    if (date < today) return
    if (date.getDay() === 0 || date.getDay() === 6) return

    if (!startDate || (startDate && endDate)) {
      // First click or reset — set start
      setStartDate(date)
      setEndDate(null)
    } else {
      // Second click — set end (swap if before start)
      if (date < startDate) {
        setEndDate(startDate)
        setStartDate(date)
      } else {
        setEndDate(date)
      }
    }
    setReason('')
  }

  function getWeekdaysInRange(start, end) {
    const dates = []
    const d = new Date(start)
    const endTime = (end || start).getTime()
    while (d.getTime() <= endTime) {
      if (d.getDay() !== 0 && d.getDay() !== 6) {
        dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
      }
      d.setDate(d.getDate() + 1)
    }
    return dates
  }

  function isInRange(date) {
    if (!startDate) return false
    const end = endDate || startDate
    return date >= startDate && date <= end
  }

  const selectedDates = startDate ? getWeekdaysInRange(startDate, endDate || startDate) : []

  async function handleRequest() {
    if (!startDate || !driverName) return
    setSubmitting(true)
    try {
      const dates = getWeekdaysInRange(startDate, endDate || startDate)
      const rows = dates.map(d => ({
        driver_name: driverName,
        date_off: d,
        reason: reason || '',
        status: 'pending',
      }))
      const { error } = await supabase.from('time_off_requests').insert(rows)
      if (error) throw new Error(error.message)
      setRequestSent(true)
      setTimeout(() => setRequestSent(false), 3000)
      setStartDate(null)
      setEndDate(null)
      setReason('')
      loadRequests()
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const dateStatus = {}
  myRequests.forEach(r => { dateStatus[r.date_off] = r.status })

  const fmtDate = (d) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <div className="toff">
      <div className="toff__header">
        <h3 className="toff__title">Schedule</h3>
        <p className="toff__sub">Tap a date for single day, or tap two dates for a range.</p>
      </div>

      <div className="toff__cal">
        <div className="toff__nav">
          <button onClick={prevMonth} className="toff__nav-btn">&larr;</button>
          <span className="toff__month">{monthName}</span>
          <button onClick={nextMonth} className="toff__nav-btn">&rarr;</button>
        </div>

        <div className="toff__grid">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="toff__day-label">{d}</div>
          ))}
          {cells.map((day, i) => {
            if (day === null) return <div key={`empty-${i}`} className="toff__cell toff__cell--empty" />

            const date = new Date(year, month, day)
            const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
            const isToday = date.toDateString() === today.toDateString()
            const isPast = date < today && !isToday
            const isWeekend = date.getDay() === 0 || date.getDay() === 6
            const isStart = startDate && date.toDateString() === startDate.toDateString()
            const isEnd = endDate && date.toDateString() === endDate.toDateString()
            const inRange = isInRange(date) && !isWeekend
            const isDisabled = isPast || isWeekend
            const status = dateStatus[dateStr]

            return (
              <button
                key={day}
                className={[
                  'toff__cell',
                  isToday && 'toff__cell--today',
                  isDisabled && 'toff__cell--disabled',
                  (isStart || isEnd) && 'toff__cell--selected',
                  inRange && !isStart && !isEnd && 'toff__cell--range',
                  status === 'approved' && 'toff__cell--approved',
                  status === 'pending' && 'toff__cell--pending',
                  status === 'denied' && 'toff__cell--denied',
                ].filter(Boolean).join(' ')}
                onClick={() => !isDisabled && !status && handleDateClick(day)}
                disabled={isDisabled || !!status}
              >
                {day}
                {status && <span className="toff__cell-dot" />}
              </button>
            )
          })}
        </div>
      </div>

      {startDate && (
        <div className="toff__request">
          <p>
            {endDate ? (
              <>Request <strong>{fmtDate(startDate)}</strong> to <strong>{fmtDate(endDate)}</strong> off? <span className="toff__range-count">({selectedDates.length} weekdays)</span></>
            ) : (
              <>Request <strong>{fmtDate(startDate)}</strong> off? <span className="toff__range-hint">Or tap another date for a range.</span></>
            )}
          </p>
          <input
            className="toff__reason"
            type="text"
            placeholder="Reason (optional)"
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
          <div className="toff__request-actions">
            <button className="toff__req-btn" onClick={handleRequest} disabled={submitting}>
              {submitting ? 'Sending...' : `Submit${selectedDates.length > 1 ? ` (${selectedDates.length} days)` : ''}`}
            </button>
            <button className="toff__req-btn toff__req-btn--cancel" onClick={() => { setStartDate(null); setEndDate(null) }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {requestSent && (
        <div className="toff__toast">Request sent to dispatch for approval</div>
      )}

      {myRequests.filter(r => r.date_off >= today.toISOString().split('T')[0]).length > 0 && (
        <div className="toff__upcoming">
          <h4 className="toff__upcoming-title">Your Upcoming Schedule</h4>
          {myRequests
            .filter(r => r.date_off >= today.toISOString().split('T')[0])
            .map(r => (
              <div key={r.id} className="toff__upcoming-item">
                <span>{new Date(r.date_off + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                <span className={`toff__upcoming-status toff__upcoming-status--${r.status}`}>{r.status}</span>
                {r.reason && <span className="toff__upcoming-reason">{r.reason}</span>}
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
