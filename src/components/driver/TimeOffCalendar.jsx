import { useState } from 'react'
import './TimeOffCalendar.css'

export default function TimeOffCalendar({ driverName }) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [requestSent, setRequestSent] = useState(false)
  const [selectedDate, setSelectedDate] = useState(null)

  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = new Date()

  const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  function prevMonth() {
    setCurrentMonth(new Date(year, month - 1, 1))
  }

  function nextMonth() {
    setCurrentMonth(new Date(year, month + 1, 1))
  }

  function handleDateClick(day) {
    const date = new Date(year, month, day)
    if (date < today) return // Can't request past dates
    if (date.getDay() === 0 || date.getDay() === 6) return // Weekends
    setSelectedDate(date)
  }

  function handleRequest() {
    if (!selectedDate) return
    // In Phase 6, this would create a Google Calendar event
    setRequestSent(true)
    setTimeout(() => setRequestSent(false), 3000)
    setSelectedDate(null)
  }

  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div className="toff">
      <div className="toff__header">
        <h3 className="toff__title">Time Off Calendar</h3>
        <p className="toff__sub">Select a date to request time off. Requests are sent to dispatch for approval.</p>
      </div>

      <div className="toff__cal">
        <div className="toff__nav">
          <button onClick={prevMonth} className="toff__nav-btn">&larr;</button>
          <span className="toff__month">{monthName}</span>
          <button onClick={nextMonth} className="toff__nav-btn">&rarr;</button>
        </div>

        <div className="toff__grid">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="toff__day-label">{d}</div>
          ))}
          {cells.map((day, i) => {
            if (day === null) return <div key={`empty-${i}`} className="toff__cell toff__cell--empty" />

            const date = new Date(year, month, day)
            const isToday = date.toDateString() === today.toDateString()
            const isPast = date < today && !isToday
            const isWeekend = date.getDay() === 0 || date.getDay() === 6
            const isSelected = selectedDate && date.toDateString() === selectedDate.toDateString()
            const isDisabled = isPast || isWeekend

            return (
              <button
                key={day}
                className={[
                  'toff__cell',
                  isToday && 'toff__cell--today',
                  isDisabled && 'toff__cell--disabled',
                  isSelected && 'toff__cell--selected',
                ].filter(Boolean).join(' ')}
                onClick={() => !isDisabled && handleDateClick(day)}
                disabled={isDisabled}
              >
                {day}
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
          <div className="toff__request-actions">
            <button className="toff__req-btn" onClick={handleRequest}>
              Submit Request
            </button>
            <button className="toff__req-btn toff__req-btn--cancel" onClick={() => setSelectedDate(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {requestSent && (
        <div className="toff__toast">
          Time off request sent to dispatch
        </div>
      )}
    </div>
  )
}
