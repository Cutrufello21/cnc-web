import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import './TimeOffCalendar.css'

export default function TimeOffCalendar({ driverName }) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [requestSent, setRequestSent] = useState(false)
  const [selectedDate, setSelectedDate] = useState(null)
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
      .eq('driver_name', driverName).order('date_off', { ascending: true })
    setMyRequests(data || [])
  }

  function prevMonth() { setCurrentMonth(new Date(year, month - 1, 1)) }
  function nextMonth() { setCurrentMonth(new Date(year, month + 1, 1)) }

  function handleDateClick(day) {
    const date = new Date(year, month, day)
    if (date < today) return
    if (date.getDay() === 0 || date.getDay() === 6) return
    setSelectedDate(date)
    setReason('')
  }

  async function handleRequest() {
    if (!selectedDate || !driverName) return
    setSubmitting(true)
    try {
      const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth()+1).padStart(2,'0')}-${String(selectedDate.getDate()).padStart(2,'0')}`
      const { error } = await supabase.from('time_off_requests').insert({
        driver_name: driverName,
        date_off: dateStr,
        reason: reason || '',
        status: 'pending',
      })
      if (error) throw new Error(error.message)
      setRequestSent(true)
      setTimeout(() => setRequestSent(false), 3000)
      setSelectedDate(null)
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

  // Map dates to request status
  const dateStatus = {}
  myRequests.forEach(r => { dateStatus[r.date_off] = r.status })

  return (
    <div className="toff">
      <div className="toff__header">
        <h3 className="toff__title">Schedule</h3>
        <p className="toff__sub">Tap a date to request time off. Dispatch will approve or deny.</p>
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
            const isSelected = selectedDate && date.toDateString() === selectedDate.toDateString()
            const isDisabled = isPast || isWeekend
            const status = dateStatus[dateStr]

            return (
              <button
                key={day}
                className={[
                  'toff__cell',
                  isToday && 'toff__cell--today',
                  isDisabled && 'toff__cell--disabled',
                  isSelected && 'toff__cell--selected',
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

      {selectedDate && (
        <div className="toff__request">
          <p>
            Request <strong>{selectedDate.toLocaleDateString('en-US', {
              weekday: 'long', month: 'long', day: 'numeric',
            })}</strong> off?
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
              {submitting ? 'Sending...' : 'Submit Request'}
            </button>
            <button className="toff__req-btn toff__req-btn--cancel" onClick={() => setSelectedDate(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {requestSent && (
        <div className="toff__toast">Request sent to dispatch for approval</div>
      )}

      {/* Upcoming approved days */}
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
