import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import './TimeOff.css'

export default function TimeOff() {
  const [requests, setRequests] = useState([])
  const [drivers, setDrivers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newReq, setNewReq] = useState({ driver_name: '', date_off: '', reason: '' })
  const [adding, setAdding] = useState(false)
  const [toast, setToast] = useState(null)
  const [filter, setFilter] = useState('upcoming') // upcoming, all, pending

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

  async function handleAdd() {
    if (!newReq.driver_name || !newReq.date_off) return
    setAdding(true)
    try {
      const { error } = await supabase.from('time_off_requests').insert({
        driver_name: newReq.driver_name,
        date_off: newReq.date_off,
        reason: newReq.reason,
        status: 'approved',
        reviewed_by: 'Dispatch',
      })
      if (error) throw new Error(error.message)
      setToast(`${newReq.driver_name} off on ${newReq.date_off}`)
      setTimeout(() => setToast(null), 3000)
      setNewReq({ driver_name: '', date_off: '', reason: '' })
      setShowAdd(false)
      loadData()
    } catch (err) {
      setToast(`Error: ${err.message}`)
      setTimeout(() => setToast(null), 4000)
    } finally {
      setAdding(false)
    }
  }

  async function handleStatus(id, status) {
    await supabase.from('time_off_requests').update({ status, reviewed_by: 'Dispatch' }).eq('id', id)
    loadData()
  }

  async function handleDelete(id) {
    if (!confirm('Delete this request?')) return
    await supabase.from('time_off_requests').delete().eq('id', id)
    loadData()
  }

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`

  const filtered = requests.filter(r => {
    if (filter === 'upcoming') return r.date_off >= todayStr
    if (filter === 'pending') return r.status === 'pending'
    return true
  })

  // Group by date for calendar-like view
  const grouped = {}
  filtered.forEach(r => {
    if (!grouped[r.date_off]) grouped[r.date_off] = []
    grouped[r.date_off].push(r)
  })
  const sortedDates = Object.keys(grouped).sort()

  if (loading) return <div className="to__loading"><div className="dispatch__spinner" />Loading time off...</div>

  return (
    <div className="to">
      {toast && <div className={`to__toast ${toast.startsWith('Error') ? 'to__toast--err' : ''}`}>{toast}</div>}

      <div className="to__header">
        <h2 className="to__title">Time Off</h2>
        <div className="to__filters">
          {[['upcoming', 'Upcoming'], ['pending', 'Pending'], ['all', 'All']].map(([key, label]) => (
            <button key={key} className={`to__filter ${filter === key ? 'to__filter--active' : ''}`}
              onClick={() => setFilter(key)}>{label}</button>
          ))}
        </div>
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
          <input className="to__input" type="date" value={newReq.date_off}
            onChange={e => setNewReq({ ...newReq, date_off: e.target.value })} />
          <input className="to__input to__input--wide" type="text" placeholder="Reason (optional)"
            value={newReq.reason} onChange={e => setNewReq({ ...newReq, reason: e.target.value })} />
          <button className="to__submit" onClick={handleAdd} disabled={adding || !newReq.driver_name || !newReq.date_off}>
            {adding ? 'Adding...' : 'Add'}
          </button>
        </div>
      )}

      {sortedDates.length === 0 && (
        <div className="to__empty">No time off requests {filter === 'upcoming' ? 'upcoming' : 'found'}</div>
      )}

      {sortedDates.map(date => {
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
    </div>
  )
}
