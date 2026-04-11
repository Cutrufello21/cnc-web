import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { dbInsert, dbUpdate, dbDelete, dbUpsert } from '../../lib/db'
import './Schedule.css'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const DAY_COLS = ['mon', 'tue', 'wed', 'thu', 'fri']

export default function Schedule() {
  const [drivers, setDrivers] = useState([])
  const [stops, setStops] = useState([])
  const [timeOff, setTimeOff] = useState([])
  const [schedule, setSchedule] = useState({}) // driverName → { mon, tue, ... , mon_pharm, tue_pharm, ... }
  const [loading, setLoading] = useState(true)
  const [weekOffset, setWeekOffset] = useState(0)
  const [showAdd, setShowAdd] = useState(false)
  const [showBuilder, setShowBuilder] = useState(false)
  const [newReq, setNewReq] = useState({ driver_name: '', date_from: '', date_to: '', reason: '' })
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(null)
  const [releasing, setReleasing] = useState(false)
  const [released, setReleased] = useState(false)
  const [preview, setPreview] = useState(null) // array of { name, days, title, body }
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

  useEffect(() => { loadData(); setReleased(false) }, [weekOffset])

  async function loadData() {
    setLoading(true)
    const [drvRes, ...stopResults] = await Promise.all([
      supabase.from('drivers').select('driver_name, driver_number, pharmacy, shift, active').eq('active', true).order('driver_name'),
      ...weekDateStrs.map(date =>
        supabase.from('daily_stops').select('driver_name')
          .eq('delivery_date', date)
          .not('status', 'eq', 'DELETED')
          .limit(1000)
      ),
    ])

    // Time off + default schedule
    const [toRes, schedRes] = await Promise.all([
      supabase.from('time_off_requests').select('*')
        .gte('date_off', weekDateStrs[0]).lte('date_off', weekDateStrs[4]),
      supabase.from('driver_schedule').select('*'),
    ])
    const toData = toRes.data
    const schedMap = {}
    ;(schedRes.data || []).forEach(r => { schedMap[r.driver_name] = r })
    setSchedule(schedMap)

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

  // Determine if a driver is set to work a given day from default schedule
  function isDefaultWorking(driverName, dateStr) {
    const d = new Date(dateStr + 'T12:00:00')
    const dayIdx = d.getDay() - 1 // 0=Mon, 4=Fri
    if (dayIdx < 0 || dayIdx > 4) return false
    const sched = schedule[driverName]
    if (!sched) return true // no schedule = working by default
    const val = sched[DAY_COLS[dayIdx]]
    return val !== false && val !== 'false' && val !== 0
  }

  function getDefaultPharmacy(driverName, dateStr) {
    const d = new Date(dateStr + 'T12:00:00')
    const dayIdx = d.getDay() - 1
    if (dayIdx < 0 || dayIdx > 4) return null
    const sched = schedule[driverName]
    const driver = drivers.find(dr => dr.driver_name === driverName)
    const basePharm = driver?.pharmacy || 'SHSP'
    if (basePharm === 'Both') {
      return sched?.[`${DAY_COLS[dayIdx]}_pharm`] || 'SHSP'
    }
    return basePharm
  }

  // Build cell data
  function getCellState(driverName, dateStr) {
    const to = timeOff.find(r => r.driver_name === driverName && r.date_off === dateStr)
    const pkgCount = stops[`${driverName}|${dateStr}`] || 0

    if (to && (to.status === 'approved' || to.status === 'pending')) {
      if (pkgCount > 0) {
        return { type: 'gap', pkgCount, to }
      }
      return { type: 'timeoff', status: to.status, to }
    }

    if (pkgCount > 0) {
      return { type: 'scheduled', pkgCount }
    }

    // For dates without stop data, check the default schedule
    const working = isDefaultWorking(driverName, dateStr)
    if (working) {
      const pharm = getDefaultPharmacy(driverName, dateStr)
      // Read per-day shift from schedule, fallback to driver's default shift
      const d = new Date(dateStr + 'T12:00:00')
      const dayIdx = d.getDay() - 1
      const sched = schedule[driverName] || {}
      const dayShift = (dayIdx >= 0 && dayIdx <= 4) ? (sched[`${DAY_COLS[dayIdx]}_shift`] || null) : null
      const driver = drivers.find(dr => dr.driver_name === driverName)
      const shift = dayShift || driver?.shift || 'AM'
      return { type: 'default_on', pharmacy: pharm, shift }
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
    let gaps = 0
    drivers.forEach(d => {
      weekDateStrs.forEach(dateStr => {
        const cell = getCellState(d.driver_name, dateStr)
        if (cell.type === 'gap') gaps++
        // Count drivers who are working (scheduled or default) at least one day
        if (cell.type === 'default_on' || cell.type === 'scheduled') activeSet.add(d.driver_name)
      })
    })
    return { weekStops, activeDrivers: activeSet.size, pending, gaps }
  }, [stops, timeOff, drivers, weekDateStrs, schedule])

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

  // ── Schedule Builder logic ─────────────────────────────────
  function getPharmLabel(driver) {
    const p = driver.pharmacy || 'SHSP'
    if (p === 'Both') return 'Both'
    if (p === 'Float') return 'Float'
    return p
  }

  // Release schedule — notify all working drivers
  function buildNotifications() {
    const weekLabel = `${weekDates[0].getMonth() + 1}/${weekDates[0].getDate()} – ${weekDates[4].getMonth() + 1}/${weekDates[4].getDate()}`
    const notifications = []
    for (const driver of drivers) {
      const days = []
      for (let i = 0; i < 5; i++) {
        const sched = schedule[driver.driver_name] || {}
        const stateIdx = getCurrentStateIdx(sched, DAY_COLS[i])
        const state = STATES[stateIdx]
        if (state.on) {
          const label = state.shift === 'PM' ? 'PM' : state.shift === 'BOTH' ? 'AM+PM' : state.pharm
          days.push(`${DAY_LABELS[i]} (${label})`)
        }
      }
      if (days.length > 0) {
        notifications.push({
          name: driver.driver_name,
          days,
          title: `Schedule Released — ${weekLabel}`,
          body: `Your shifts: ${days.join(', ')}`,
        })
      }
    }
    return notifications
  }

  function handlePreview() {
    setPreview(buildNotifications())
  }

  async function handleSend() {
    setReleasing(true)
    try {
      for (const n of preview) {
        await fetch('/api/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'push_notify',
            driverNames: [n.name],
            title: n.title,
            body: n.body,
          }),
        }).catch(() => {})
      }
      setReleased(true)
      setPreview(null)
      showToastMsg(`Schedule released — ${preview.length} drivers notified`)
    } catch (err) {
      showToastMsg(`Error: ${err.message}`, true)
    } finally {
      setReleasing(false)
    }
  }

  // Cycle: Off → SHSP (blue) → Aultman (green) → PM (orange) → AM+PM (split) → Off
  // Each state stores both shift and pharmacy in one click
  const STATES = [
    { key: 'off',     on: false, shift: null,   pharm: null },
    { key: 'shsp',    on: true,  shift: 'AM',   pharm: 'SHSP' },
    { key: 'aultman', on: true,  shift: 'AM',   pharm: 'Aultman' },
    { key: 'pm',      on: true,  shift: 'PM',   pharm: 'SHSP' },
    { key: 'ampm',    on: true,  shift: 'BOTH', pharm: 'SHSP' },
  ]

  function getCurrentStateIdx(sched, col) {
    const isOn = sched[col] !== false && sched[col] !== 'false' && sched[col] !== 0
    if (!isOn) return 0 // off
    const shift = sched[`${col}_shift`] || 'AM'
    const pharm = sched[`${col}_pharm`] || 'SHSP'
    if (shift === 'PM') return 3
    if (shift === 'BOTH') return 4
    if (pharm === 'Aultman') return 2
    return 1 // SHSP AM
  }

  async function handleBuilderToggle(driverName, dayIdx) {
    const col = DAY_COLS[dayIdx]
    const sched = schedule[driverName] || {}
    const currentIdx = getCurrentStateIdx(sched, col)
    const next = STATES[(currentIdx + 1) % STATES.length]

    setSaving(`${driverName}|${col}`)
    try {
      const update = {
        driver_name: driverName,
        [col]: next.on,
        [`${col}_shift`]: next.shift,
        [`${col}_pharm`]: next.pharm,
      }
      await dbUpsert('driver_schedule', update, 'driver_name')
      setSchedule(prev => ({
        ...prev,
        [driverName]: { ...(prev[driverName] || {}), ...update },
      }))
    } catch (err) {
      showToastMsg(`Error: ${err.message}`, true)
    } finally {
      setSaving(null)
    }
  }


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
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`sched__builder-toggle ${showBuilder ? 'sched__builder-toggle--active' : ''}`}
            onClick={() => setShowBuilder(!showBuilder)}
          >
            {showBuilder ? 'Close Builder' : 'Edit Schedule'}
          </button>
          <button className="sched__add-btn" onClick={() => setShowAdd(true)}>Schedule driver</button>
        </div>
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
          <span className="sched__stat-val">{stats.weekStops.toLocaleString()}</span>
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

      {/* Schedule Builder */}
      {showBuilder && (
        <div className="sched__builder">
          <div className="sched__builder-header">
            <div>
              <h3 className="sched__builder-title">Weekly Schedule — {weekDates[0].getMonth() + 1}/{weekDates[0].getDate()} – {weekDates[4].getMonth() + 1}/{weekDates[4].getDate()}</h3>
              <span className="sched__builder-hint">Click to cycle: Off → SHSP → Aultman → PM → AM+PM → Off</span>
            </div>
            <button
              className={`sched__release-btn ${released ? 'sched__release-btn--done' : ''}`}
              onClick={handlePreview}
              disabled={releasing || released}
            >
              {released ? 'Released ✓' : 'Release Schedule'}
            </button>
          </div>
          <div className="sched__builder-grid-wrap">
            <table className="sched__builder-grid">
              <thead>
                <tr>
                  <th className="sched__bth-driver">Driver</th>
                  <th className="sched__bth-type">Type</th>
                  {DAY_LABELS.map((d, i) => (
                    <th key={d} className="sched__bth-day">
                      <span>{d}</span>
                      <span className="sched__bth-date">{weekDates[i].getMonth() + 1}/{weekDates[i].getDate()}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {drivers.sort((a, b) => a.driver_name.localeCompare(b.driver_name)).map(driver => {
                  const pharm = driver.pharmacy || 'SHSP'
                  const shift = driver.shift || 'AM'
                  const isBoth = pharm === 'Both'
                  const isFloat = pharm === 'Float'
                  const isPM = shift === 'PM'
                  const isBothShift = shift === 'BOTH'
                  return (
                    <tr key={driver.driver_name}>
                      <td className="sched__bcell-driver">{driver.driver_name}</td>
                      <td className="sched__bcell-type">
                        <div className="sched__type-badges">
                          <span className={`sched__type-badge sched__type-badge--${pharm.toLowerCase()}`}>{isFloat ? 'Float' : pharm}</span>
                          {isPM && <span className="sched__type-badge sched__type-badge--pm">PM</span>}
                          {isBothShift && <span className="sched__type-badge sched__type-badge--bothshift">AM+PM</span>}
                        </div>
                      </td>
                      {DAY_COLS.map((col, i) => {
                        const sched = schedule[driver.driver_name] || {}
                        const stateIdx = getCurrentStateIdx(sched, col)
                        const state = STATES[stateIdx]
                        const isSaving = saving === `${driver.driver_name}|${col}`

                        const btnClass = !state.on ? '' :
                          state.shift === 'PM' ? 'sched__btoggle-btn--pm' :
                          state.shift === 'BOTH' ? 'sched__btoggle-btn--ampm' :
                          state.pharm === 'Aultman' ? 'sched__btoggle-btn--aultman' : ''

                        const btnLabel = !state.on ? '—' :
                          state.pharm === 'Aultman' && state.shift === 'AM' ? 'ALT' :
                          state.shift === 'PM' ? 'PM' :
                          state.shift === 'BOTH' ? 'A+P' : 'SHSP'

                        const titles = ['Off → SHSP', 'SHSP → Aultman', 'Aultman → PM', 'PM → AM+PM', 'AM+PM → Off']

                        return (
                          <td key={col} className="sched__bcell-day">
                            <div className={`sched__btoggle ${state.on ? 'sched__btoggle--on' : 'sched__btoggle--off'} ${isSaving ? 'sched__btoggle--saving' : ''}`}>
                              <button
                                className={`sched__btoggle-btn ${btnClass}`}
                                onClick={() => handleBuilderToggle(driver.driver_name, i)}
                                disabled={isSaving}
                                title={titles[stateIdx]}
                              >
                                {btnLabel}
                              </button>
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
                    {dayTotals[i] > 0 && <span className="sched__day-total">{dayTotals[i]} stops</span>}
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
                          {cell.type === 'default_on' && (
                            <div className={`sched__cell-inner sched__cell--default ${cell.pharmacy === 'Aultman' ? 'sched__cell--default-aultman' : ''} ${cell.shift === 'PM' ? 'sched__cell--default-pm' : ''} ${cell.shift === 'BOTH' ? 'sched__cell--default-both' : ''}`}>
                              <span className="sched__cell-label">{cell.shift === 'PM' || cell.shift === 'BOTH' ? `${cell.pharmacy} + PM` : 'Working'}</span>
                              <span className="sched__cell-pharm">{cell.shift === 'PM' || cell.shift === 'BOTH' ? 'AM + PM' : cell.pharmacy}</span>
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

      {/* Release Preview Modal */}
      {preview && (
        <div className="sched__preview-overlay" onClick={() => setPreview(null)}>
          <div className="sched__preview" onClick={e => e.stopPropagation()}>
            <div className="sched__preview-header">
              <h3>Release Preview — {preview.length} drivers</h3>
              <button className="sched__preview-close" onClick={() => setPreview(null)}>✕</button>
            </div>
            <p className="sched__preview-sub">Each driver will receive this push notification on their phone:</p>
            <div className="sched__preview-list">
              {preview.map(n => (
                <div key={n.name} className="sched__preview-card">
                  <div className="sched__preview-phone">
                    <div className="sched__preview-notif">
                      <div className="sched__preview-app">CNC Driver</div>
                      <div className="sched__preview-title">{n.title}</div>
                      <div className="sched__preview-body">{n.body}</div>
                    </div>
                  </div>
                  <span className="sched__preview-name">{n.name}</span>
                </div>
              ))}
            </div>
            <div className="sched__preview-actions">
              <button className="sched__preview-send" onClick={handleSend} disabled={releasing}>
                {releasing ? 'Sending...' : `Send to ${preview.length} drivers`}
              </button>
              <button className="sched__preview-cancel" onClick={() => setPreview(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="sched__legend">
        <span className="sched__legend-item"><span className="sched__legend-dot sched__legend-dot--scheduled" />Scheduled</span>
        <span className="sched__legend-item"><span className="sched__legend-dot sched__legend-dot--timeoff" />Time off</span>
        <span className="sched__legend-item"><span className="sched__legend-dot sched__legend-dot--gap" />Coverage gap</span>
        <span className="sched__legend-item"><span className="sched__legend-dot sched__legend-dot--default" />Working (default)</span>
        <span className="sched__legend-item"><span className="sched__legend-dot sched__legend-dot--off" />Off</span>
      </div>
    </div>
  )
}
