import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import './TimeOff.css'

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

export default function TimeOff() {
  const [requests, setRequests] = useState([])
  const [drivers, setDrivers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newReq, setNewReq] = useState({ driver_name: '', date_from: '', date_to: '', reason: '', recurring: '' })
  const [adding, setAdding] = useState(false)
  const [toast, setToast] = useState(null)
  const [view, setView] = useState('calendar') // calendar, list
  const [filter, setFilter] = useState('upcoming')
  const [calMonth, setCalMonth] = useState(new Date().getMonth())
  const [calYear, setCalYear] = useState(new Date().getFullYear())

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [reqRes, drvRes] = await Promise.all([
      supabase.from('time_off_requests').select('*').order('date_off', { ascending: true }),
      supabase.from('drivers').select('driver_name').eq('active', true).order('driver_name'),
    ])
    setRequests(reqRes.data || [])
    setDrivers(drvRes.data || [])
    setLoading(false)
  }

  function showToastMsg(msg, isErr) {
    setToast({ msg, isErr })
    setTimeout(() => setToast(null), 3000)
  }

  async function handleAdd() {
    if (!newReq.driver_name || !newReq.date_from) return
    setAdding(true)
    try {
      const dateTo = newReq.date_to || newReq.date_from
      const dates = getDateRange(newReq.date_from, dateTo)

      // If recurring, generate dates for the next 3 months
      let allDates = [...dates]
      if (newReq.recurring) {
        const dayNum = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5 }[newReq.recurring]
        if (dayNum) {
          const start = new Date()
          for (let i = 0; i < 90; i++) {
            const d = new Date(start)
            d.setDate(d.getDate() + i)
            if (d.getDay() === dayNum) {
              allDates.push(d.toISOString().split('T')[0])
            }
          }
          allDates = [...new Set(allDates)].sort()
        }
      }

      const rows = allDates.map(date => ({
        driver_name: newReq.driver_name,
        date_off: date,
        reason: newReq.recurring ? `Recurring: every ${newReq.recurring}` : newReq.reason,
        status: 'approved',
        reviewed_by: 'Dispatch',
      }))

      const { error } = await supabase.from('time_off_requests').insert(rows)
      if (error) throw new Error(error.message)

      showToastMsg(`${newReq.driver_name} off — ${allDates.length} day${allDates.length > 1 ? 's' : ''} added`)
      setNewReq({ driver_name: '', date_from: '', date_to: '', reason: '', recurring: '' })
      setShowAdd(false)
      loadData()
    } catch (err) {
      showToastMsg(`Error: ${err.message}`, true)
    } finally {
      setAdding(false)
    }
  }

  function getDateRange(from, to) {
    const dates = []
    const start = new Date(from + 'T12:00:00')
    const end = new Date(to + 'T12:00:00')
    while (start <= end) {
      const dow = start.getDay()
      if (dow >= 1 && dow <= 5) { // Weekdays only
        dates.push(start.toISOString().split('T')[0])
      }
      start.setDate(start.getDate() + 1)
    }
    return dates
  }

  async function handleStatus(id, status) {
    const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxw2xx2atYfnEfGzCaTmkDShmt96D1JsLFSckScOndB94RV2IGev63fpS7Ndc0GqSHWWQ/exec'
    const req = requests.find(r => r.id === id)
    await supabase.from('time_off_requests').update({ status, reviewed_by: 'Dispatch' }).eq('id', id)

    // Email the driver
    if (req) {
      const driver = drivers.find(d => d.driver_name === req.driver_name)
      if (driver) {
        try {
          const { data: driverData } = await supabase.from('drivers').select('email').eq('driver_name', req.driver_name).single()
          if (driverData?.email) {
            const dateStr = new Date(req.date_off + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
            await fetch(APPS_SCRIPT_URL, {
              method: 'POST',
              body: JSON.stringify({
                action: 'email',
                to: driverData.email,
                subject: `CNC Delivery — Time Off ${status === 'approved' ? 'Approved' : 'Denied'}`,
                html: `<div style="font-family:-apple-system,sans-serif;max-width:500px">
                  <h2 style="color:#0A2463">CNC Delivery</h2>
                  <p>Hi ${req.driver_name},</p>
                  <p>Your time off request for <strong>${dateStr}</strong> has been <strong>${status}</strong>.</p>
                  ${req.reason ? `<p style="color:#6b7280">Reason: ${req.reason}</p>` : ''}
                  <p style="color:#6b7280;font-size:13px">CNC Delivery</p>
                </div>`,
              }),
            })
          }
        } catch {}
      }
    }
    loadData()
  }

  async function handleDelete(id) {
    if (!confirm('Delete this request?')) return
    await supabase.from('time_off_requests').delete().eq('id', id)
    loadData()
  }

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`

  // Stats
  const stats = useMemo(() => {
    const driverDays = {}
    requests.filter(r => r.status === 'approved').forEach(r => {
      driverDays[r.driver_name] = (driverDays[r.driver_name] || 0) + 1
    })
    return Object.entries(driverDays).sort((a, b) => b[1] - a[1])
  }, [requests])

  // Calendar data
  const calendarDays = useMemo(() => {
    const firstDay = new Date(calYear, calMonth, 1)
    const lastDay = new Date(calYear, calMonth + 1, 0)
    const startPad = firstDay.getDay()
    const days = []

    for (let i = 0; i < startPad; i++) days.push(null)
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const dayRequests = requests.filter(r => r.date_off === dateStr && r.status !== 'denied')
      days.push({ day: d, date: dateStr, requests: dayRequests })
    }
    return days
  }, [calMonth, calYear, requests])

  // List view
  const filtered = requests.filter(r => {
    if (filter === 'upcoming') return r.date_off >= todayStr
    if (filter === 'pending') return r.status === 'pending'
    return true
  })
  const grouped = {}
  filtered.forEach(r => {
    if (!grouped[r.date_off]) grouped[r.date_off] = []
    grouped[r.date_off].push(r)
  })

  if (loading) return <div className="to__loading"><div className="dispatch__spinner" />Loading time off...</div>

  return (
    <div className="to">
      {toast && <div className={`to__toast ${toast.isErr ? 'to__toast--err' : ''}`}>{toast.msg}</div>}

      <div className="to__header">
        <h2 className="to__title">Time Off</h2>
        <div className="to__filters">
          {[['calendar', 'Calendar'], ['list', 'List']].map(([key, label]) => (
            <button key={key} className={`to__filter ${view === key ? 'to__filter--active' : ''}`}
              onClick={() => setView(key)}>{label}</button>
          ))}
        </div>
        {view === 'list' && (
          <div className="to__filters">
            {[['upcoming', 'Upcoming'], ['pending', 'Pending'], ['all', 'All']].map(([key, label]) => (
              <button key={key} className={`to__filter ${filter === key ? 'to__filter--active' : ''}`}
                onClick={() => setFilter(key)}>{label}</button>
            ))}
          </div>
        )}
        <button className="to__add-btn" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Cancel' : '+ Add Time Off'}
        </button>
      </div>

      {showAdd && (
        <div className="to__add-form">
          <select className="to__input" value={newReq.driver_name}
            onChange={e => setNewReq({ ...newReq, driver_name: e.target.value })}>
            <option value="">Select driver...</option>
            {drivers.map(d => <option key={d.driver_name} value={d.driver_name}>{d.driver_name}</option>)}
          </select>
          <div className="to__date-range">
            <input className="to__input" type="date" value={newReq.date_from}
              onChange={e => setNewReq({ ...newReq, date_from: e.target.value })} />
            <span className="to__date-to">to</span>
            <input className="to__input" type="date" value={newReq.date_to}
              onChange={e => setNewReq({ ...newReq, date_to: e.target.value })}
              placeholder="Same day" />
          </div>
          <select className="to__input" value={newReq.recurring}
            onChange={e => setNewReq({ ...newReq, recurring: e.target.value })}>
            <option value="">One-time</option>
            <option value="monday">Every Monday</option>
            <option value="tuesday">Every Tuesday</option>
            <option value="wednesday">Every Wednesday</option>
            <option value="thursday">Every Thursday</option>
            <option value="friday">Every Friday</option>
          </select>
          <input className="to__input to__input--wide" type="text" placeholder="Reason (optional)"
            value={newReq.reason} onChange={e => setNewReq({ ...newReq, reason: e.target.value })} />
          <button className="to__submit" onClick={handleAdd} disabled={adding || !newReq.driver_name || !newReq.date_from}>
            {adding ? 'Adding...' : 'Add'}
          </button>
        </div>
      )}

      {/* CALENDAR VIEW */}
      {view === 'calendar' && (
        <div className="to__calendar">
          <div className="to__cal-nav">
            <button className="to__cal-arrow" onClick={() => {
              if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1) }
              else setCalMonth(calMonth - 1)
            }}>&larr;</button>
            <span className="to__cal-title">{MONTH_NAMES[calMonth]} {calYear}</span>
            <button className="to__cal-arrow" onClick={() => {
              if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1) }
              else setCalMonth(calMonth + 1)
            }}>&rarr;</button>
          </div>
          <div className="to__cal-grid">
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
              <div key={d} className="to__cal-header">{d}</div>
            ))}
            {calendarDays.map((cell, i) => {
              if (!cell) return <div key={`pad-${i}`} className="to__cal-cell to__cal-cell--empty" />
              const isToday = cell.date === todayStr
              const isWeekend = new Date(cell.date + 'T12:00:00').getDay() % 6 === 0
              return (
                <div key={cell.date} className={`to__cal-cell ${isToday ? 'to__cal-cell--today' : ''} ${isWeekend ? 'to__cal-cell--weekend' : ''}`}>
                  <span className="to__cal-day">{cell.day}</span>
                  {cell.requests.map(r => (
                    <span key={r.id} className={`to__cal-chip to__cal-chip--${r.status}`} title={r.reason || r.driver_name}>
                      {r.driver_name.slice(0, 3)}
                    </span>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* LIST VIEW */}
      {view === 'list' && (
        <>
          {Object.keys(grouped).length === 0 && (
            <div className="to__empty">No time off requests {filter === 'upcoming' ? 'upcoming' : 'found'}</div>
          )}
          {Object.keys(grouped).sort().map(date => {
            const dayName = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
            const isPast = date < todayStr
            const isToday = date === todayStr
            return (
              <div key={date} className={`to__day ${isPast ? 'to__day--past' : ''} ${isToday ? 'to__day--today' : ''}`}>
                <div className="to__day-header">
                  <span className="to__day-name">{dayName}</span>
                  <span className="to__day-count">{grouped[date].length} driver{grouped[date].length > 1 ? 's' : ''}</span>
                </div>
                <div className="to__day-list">
                  {grouped[date].map(r => (
                    <div key={r.id} className="to__request">
                      <div className="to__request-info">
                        <span className="to__request-name">{r.driver_name}</span>
                        {r.reason && <span className="to__request-reason">{r.reason}</span>}
                      </div>
                      <div className="to__request-actions">
                        <span className={`to__status to__status--${r.status}`}>{r.status}</span>
                        {r.status === 'pending' && (
                          <>
                            <button className="to__action to__action--approve" onClick={() => handleStatus(r.id, 'approved')}>Approve</button>
                            <button className="to__action to__action--deny" onClick={() => handleStatus(r.id, 'denied')}>Deny</button>
                          </>
                        )}
                        <button className="to__action to__action--delete" onClick={() => handleDelete(r.id)}>&times;</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </>
      )}

      {/* DRIVER STATS */}
      {stats.length > 0 && (
        <div className="to__stats">
          <h3 className="to__stats-title">Days Off Summary</h3>
          <div className="to__stats-grid">
            {stats.map(([name, count]) => (
              <div key={name} className="to__stats-item">
                <span className="to__stats-name">{name}</span>
                <span className="to__stats-count">{count} day{count > 1 ? 's' : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
