import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { dbInsert, dbUpdate, dbDelete } from '../../lib/db'
import './Schedule.css'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

export default function Schedule() {
  const [drivers, setDrivers] = useState([])
  const [stops, setStops] = useState([])
  const [timeOff, setTimeOff] = useState([])
  const [loading, setLoading] = useState(true)
  const [weekOffset, setWeekOffset] = useState(0)
  const [showAdd, setShowAdd] = useState(false)
  const [newReq, setNewReq] = useState({ driver_name: '', date_from: '', date_to: '', reason: '' })
  const [adding, setAdding] = useState(false)
  const [toast, setToast] = useState(null)

  // Compute week dates
  const { monday, weekDates, weekDateStrs, monthLabel } = useMemo(() => {
    const now = new Date()
    const dow = now.getDay()
    const mondayOffset = dow === 0 ? -6 : 1 - dow
    const mon = new Date(now)
    mon.setDate(now.getDate() + mondayOffset + weekOffset * 7)

    const dates = []
    const strs = []
    for (let i = 0; i < 5; i++) {
      const d = new Date(mon)
      d.setDate(mon.getDate() + i)
      dates.push(d)
      strs.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
    }

    const months = new Set(dates.map(d => d.toLocaleDateString('en-US', { month: 'long' })))
    const year = dates[0].getFullYear()
    const label = [...months].join(' / ') + ' ' + year

    return { monday: mon, weekDates: dates, weekDateStrs: strs, monthLabel: label }
  }, [weekOffset])

  const todayStr = useMemo(() => {
    const t = new Date()
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
  }, [])

  useEffect(() => { loadData() }, [weekOffset])

  async function loadData() {
    setLoading(true)
    const [drvRes, ...stopResults] = await Promise.all([
      supabase.from('drivers').select('driver_name, driver_number, pharmacy, active').eq('active', true).order('driver_name'),
      ...weekDateStrs.map(date =>
        supabase.from('daily_stops').select('driver_name')
          .eq('delivery_date', date)
          .not('status', 'eq', 'DELETED')
          .limit(1000)
      ),
    ])

    // Time off for the week range
    const { data: toData } = await supabase.from('time_off_requests')
      .select('*')
      .gte('date_off', weekDateStrs[0])
      .lte('date_off', weekDateStrs[4])

    // Count packages per driver per day
    const stopMap = {}
    stopResults.forEach((res, dayIdx) => {
      const dateStr = weekDateStrs[dayIdx]
      ;(res.data || []).forEach(s => {
        if (!s.driver_name) return
        const key = `${s.driver_name}|${dateStr}`
        stopMap[key] = (stopMap[key] || 0) + 1
      })
    })

    setDrivers((drvRes.data || []).filter(d => d.driver_name !== 'Demo Driver'))
    setStops(stopMap)
    setTimeOff(toData || [])
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
      const dates = []
      const start = new Date(newReq.date_from + 'T12:00:00')
      const end = new Date(dateTo + 'T12:00:00')
      while (start <= end) {
        if (start.getDay() >= 1 && start.getDay() <= 5) {
          dates.push(start.toISOString().split('T')[0])
        }
        start.setDate(start.getDate() + 1)
      }
      const rows = dates.map(date => ({
        driver_name: newReq.driver_name,
        date_off: date,
        reason: newReq.reason || '',
        status: 'approved',
        reviewed_by: 'Dispatch',
      }))
      await dbInsert('time_off_requests', rows)
      showToastMsg(`${newReq.driver_name} off — ${dates.length} day${dates.length > 1 ? 's' : ''} added`)
      setNewReq({ driver_name: '', date_from: '', date_to: '', reason: '' })
      setShowAdd(false)
      loadData()
    } catch (err) {
      showToastMsg(`Error: ${err.message}`, true)
    } finally {
      setAdding(false)
    }
  }

  async function handleApprove(id) {
    await dbUpdate('time_off_requests', { status: 'approved', reviewed_by: 'Dispatch' }, { id })
    loadData()
  }

  async function handleDeny(id) {
    await dbUpdate('time_off_requests', { status: 'denied', reviewed_by: 'Dispatch' }, { id })
    loadData()
  }

  async function handleDeleteTO(id) {
    if (!confirm('Remove this time off entry?')) return
    await dbDelete('time_off_requests', { id })
    loadData()
  }

  // Build cell data
  function getCellState(driverName, dateStr) {
    const to = timeOff.find(r => r.driver_name === driverName && r.date_off === dateStr)
    const pkgCount = stops[`${driverName}|${dateStr}`] || 0

    if (to && (to.status === 'approved' || to.status === 'pending')) {
      // Check for coverage gap — driver is off but has stops assigned
      if (pkgCount > 0) {
        return { type: 'gap', pkgCount, to }
      }
      return { type: 'timeoff', status: to.status, to }
    }

    if (pkgCount > 0) {
      return { type: 'scheduled', pkgCount }
    }

    return { type: 'off' }
  }

  // Stats
  const stats = useMemo(() => {
    let weekStops = 0
    const activeSet = new Set()
    Object.entries(stops).forEach(([key, count]) => {
      weekStops += count
      activeSet.add(key.split('|')[0])
    })
    const pending = timeOff.filter(r => r.status === 'pending').length
    // Unscheduled: days with stops but driver is off
    let gaps = 0
    drivers.forEach(d => {
      weekDateStrs.forEach(dateStr => {
        const cell = getCellState(d.driver_name, dateStr)
        if (cell.type === 'gap') gaps++
      })
    })
    return { weekStops, activeDrivers: activeSet.size, pending, gaps }
  }, [stops, timeOff, drivers, weekDateStrs])

  // Day totals
  const dayTotals = useMemo(() => {
    return weekDateStrs.map(dateStr => {
      let total = 0
      Object.entries(stops).forEach(([key, count]) => {
        if (key.endsWith(`|${dateStr}`)) total += count
      })
      return total
    })
  }, [stops, weekDateStrs])

  if (loading) return <div className="sched__loading"><div className="dispatch__spinner" />Loading schedule...</div>

  return (
    <div className="sched">
      {toast && <div className={`sched__toast ${toast.isErr ? 'sched__toast--err' : ''}`}>{toast.msg}</div>}

      {/* Header */}
      <div className="sched__header">
        <div className="sched__nav">
          <button className="sched__nav-btn" onClick={() => setWeekOffset(w => w - 1)}>‹</button>
          <h2 className="sched__title">{monthLabel}</h2>
          <button className="sched__nav-btn" onClick={() => setWeekOffset(w => w + 1)}>›</button>
          {weekOffset !== 0 && (
            <button className="sched__today-btn" onClick={() => setWeekOffset(0)}>Today</button>
          )}
        </div>
        <button className="sched__add-btn" onClick={() => setShowAdd(true)}>Schedule driver</button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="sched__add-form">
          <select value={newReq.driver_name} onChange={e => setNewReq(p => ({ ...p, driver_name: e.target.value }))}>
            <option value="">Select driver...</option>
            {drivers.map(d => <option key={d.driver_name} value={d.driver_name}>{d.driver_name}</option>)}
          </select>
          <input type="date" value={newReq.date_from} onChange={e => setNewReq(p => ({ ...p, date_from: e.target.value }))} />
          <input type="date" value={newReq.date_to} onChange={e => setNewReq(p => ({ ...p, date_to: e.target.value }))} placeholder="End (optional)" />
          <input type="text" value={newReq.reason} onChange={e => setNewReq(p => ({ ...p, reason: e.target.value }))} placeholder="Reason (optional)" />
          <button className="sched__add-submit" onClick={handleAdd} disabled={adding || !newReq.driver_name || !newReq.date_from}>
            {adding ? 'Adding...' : 'Add'}
          </button>
          <button className="sched__add-cancel" onClick={() => setShowAdd(false)}>Cancel</button>
        </div>
      )}

      {/* Stats */}
      <div className="sched__stats">
        <div className="sched__stat">
          <span className="sched__stat-val">{stats.weekStops}</span>
          <span className="sched__stat-label">This week stops</span>
        </div>
        <div className="sched__stat">
          <span className="sched__stat-val">{stats.activeDrivers}</span>
          <span className="sched__stat-label">Active drivers</span>
        </div>
        <div className="sched__stat">
          <span className="sched__stat-val" style={stats.pending > 0 ? { color: '#854F0B' } : {}}>{stats.pending}</span>
          <span className="sched__stat-label">Time off pending</span>
        </div>
        <div className="sched__stat">
          <span className="sched__stat-val" style={stats.gaps > 0 ? { color: '#A32D2D' } : {}}>{stats.gaps}</span>
          <span className="sched__stat-label">Coverage gaps</span>
        </div>
      </div>

      {/* Grid */}
      <div className="sched__grid-wrap">
        <table className="sched__grid">
          <thead>
            <tr>
              <th className="sched__th-driver">Driver</th>
              {weekDates.map((d, i) => {
                const isToday = weekDateStrs[i] === todayStr
                return (
                  <th key={i} className={`sched__th-day ${isToday ? 'sched__th-day--today' : ''}`}>
                    <span className="sched__day-name">{DAY_LABELS[i]}</span>
                    <span className="sched__day-date">{d.getDate()}</span>
                    {dayTotals[i] > 0 && <span className="sched__day-total">{dayTotals[i]} pkg</span>}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {drivers
              .sort((a, b) => {
                // Sort: drivers with stops first, then alphabetical
                const aHas = weekDateStrs.some(d => stops[`${a.driver_name}|${d}`] > 0)
                const bHas = weekDateStrs.some(d => stops[`${b.driver_name}|${d}`] > 0)
                if (aHas !== bHas) return bHas - aHas
                return a.driver_name.localeCompare(b.driver_name)
              })
              .map(driver => {
                const hasPendingTO = timeOff.some(r => r.driver_name === driver.driver_name && r.status === 'pending')
                return (
                  <tr key={driver.driver_name}>
                    <td className="sched__cell-driver">
                      <div className="sched__driver-info">
                        <span className="sched__driver-name">{driver.driver_name}</span>
                        <span className="sched__driver-id">#{driver.driver_number}</span>
                      </div>
                      {hasPendingTO && <span className="sched__to-badge">TO</span>}
                    </td>
                    {weekDateStrs.map((dateStr, i) => {
                      const cell = getCellState(driver.driver_name, dateStr)
                      const isToday = dateStr === todayStr
                      return (
                        <td key={dateStr} className={`sched__cell ${isToday ? 'sched__cell--today' : ''}`}>
                          {cell.type === 'scheduled' && (
                            <div className="sched__cell-inner sched__cell--scheduled">
                              <span className="sched__cell-count">{cell.pkgCount}</span>
                              <span className="sched__cell-pharm">{driver.pharmacy || 'SHSP'}</span>
                            </div>
                          )}
                          {cell.type === 'timeoff' && (
                            <div className={`sched__cell-inner sched__cell--timeoff`} onClick={() => cell.to?.id && handleDeleteTO(cell.to.id)}>
                              <span className="sched__cell-label">{cell.status === 'approved' ? 'Time off' : 'Requested'}</span>
                              <span className="sched__cell-sub">
                                {cell.status === 'approved' ? 'Approved' : (
                                  <span className="sched__cell-actions">
                                    <button className="sched__approve-btn" onClick={e => { e.stopPropagation(); handleApprove(cell.to.id) }}>✓</button>
                                    <button className="sched__deny-btn" onClick={e => { e.stopPropagation(); handleDeny(cell.to.id) }}>✕</button>
                                  </span>
                                )}
                              </span>
                            </div>
                          )}
                          {cell.type === 'gap' && (
                            <div className="sched__cell-inner sched__cell--gap">
                              <span className="sched__cell-label">Coverage needed</span>
                              <span className="sched__cell-sub">{cell.pkgCount} pkg assigned</span>
                            </div>
                          )}
                          {cell.type === 'off' && (
                            <div className="sched__cell-inner sched__cell--off">
                              <span className="sched__cell-label">Off</span>
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="sched__legend">
        <span className="sched__legend-item"><span className="sched__legend-dot sched__legend-dot--scheduled" />Scheduled</span>
        <span className="sched__legend-item"><span className="sched__legend-dot sched__legend-dot--timeoff" />Time off</span>
        <span className="sched__legend-item"><span className="sched__legend-dot sched__legend-dot--gap" />Coverage gap</span>
        <span className="sched__legend-item"><span className="sched__legend-dot sched__legend-dot--off" />Off</span>
      </div>
    </div>
  )
}
