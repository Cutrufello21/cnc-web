import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { dbInsert, dbUpdate, dbDelete, dbUpsert } from '../../lib/db'
import './Schedule.css'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const DAY_COLS = ['mon', 'tue', 'wed', 'thu', 'fri']
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function Schedule() {
  const [drivers, setDrivers] = useState([])
  const [stops, setStops] = useState({})       // "name|dateStr" → count
  const [histStops, setHistStops] = useState({}) // "dayOfWeek" → avg count (for estimates)
  const [timeOff, setTimeOff] = useState([])
  const [schedule, setSchedule] = useState({})
  const [overrides, setOverrides] = useState({}) // "name|dateStr" → { status, pharmacy, shift }
  const [loading, setLoading] = useState(true)
  const [windowOffset, setWindowOffset] = useState(0) // weeks to shift
  const [showBuilder, setShowBuilder] = useState(false)
  const [editDay, setEditDay] = useState(null) // dateStr of day card being edited
  const [saving, setSaving] = useState(null)
  const [toast, setToast] = useState(null)

  // ── Compute 14-day window (2 full Mon-Fri weeks) ──
  const { weeks, allDates, dateRange, windowStart, windowEnd } = useMemo(() => {
    const now = new Date()
    const dow = now.getDay()
    const mondayOffset = dow === 0 ? -6 : 1 - dow
    const startMon = new Date(now)
    startMon.setDate(now.getDate() + mondayOffset + windowOffset * 7)

    const wks = []
    const allD = []
    for (let w = 0; w < 2; w++) {
      const weekDates = []
      for (let i = 0; i < 5; i++) {
        const d = new Date(startMon)
        d.setDate(startMon.getDate() + w * 7 + i)
        const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        weekDates.push({ date: d, dateStr: ds, dayIdx: i })
        allD.push({ date: d, dateStr: ds, dayIdx: i })
      }
      const mon = weekDates[0].date
      const fri = weekDates[4].date
      wks.push({
        label: `${MONTH_NAMES[mon.getMonth()]} ${mon.getDate()}–${fri.getDate()}`,
        days: weekDates,
      })
    }
    const ws = allD[0].date
    const we = allD[allD.length - 1].date
    const range = `${MONTH_NAMES[ws.getMonth()]} ${ws.getDate()} – ${MONTH_NAMES[we.getMonth()]} ${we.getDate()}, ${we.getFullYear()}`
    return { weeks: wks, allDates: allD, dateRange: range, windowStart: allD[0].dateStr, windowEnd: allD[allD.length - 1].dateStr }
  }, [windowOffset])

  const todayStr = useMemo(() => {
    const t = new Date()
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
  }, [])

  useEffect(() => { loadData() }, [windowOffset])

  async function loadData() {
    setLoading(true)

    // Fetch drivers, schedule, time off, overrides
    const [drvRes, schedRes, toRes, overRes] = await Promise.all([
      supabase.from('drivers').select('driver_name, driver_number, pharmacy, shift, active').eq('active', true).order('driver_name'),
      supabase.from('driver_schedule').select('*'),
      supabase.from('time_off_requests').select('*')
        .gte('date_off', windowStart).lte('date_off', windowEnd)
        .in('status', ['approved', 'pending']),
      supabase.from('schedule_overrides').select('*')
        .gte('date', windowStart).lte('date', windowEnd),
    ])

    // Fetch daily_stops per day (each under 1000)
    const stopResults = await Promise.all(
      allDates.map(d =>
        supabase.from('daily_stops').select('driver_name')
          .eq('delivery_date', d.dateStr)
          .not('status', 'eq', 'DELETED')
          .limit(1000)
      )
    )

    // Historical averages for estimates (same weekday 4 weeks ago)
    const fourWeeksAgo = allDates.map(d => {
      const past = new Date(d.date)
      past.setDate(past.getDate() - 28)
      return `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')}`
    })
    const uniqueHistDates = [...new Set(fourWeeksAgo)]
    const histResults = await Promise.all(
      uniqueHistDates.map(ds =>
        supabase.from('daily_stops').select('id', { count: 'exact', head: true })
          .eq('delivery_date', ds).not('status', 'eq', 'DELETED')
      )
    )
    const hist = {}
    uniqueHistDates.forEach((ds, i) => { hist[ds] = histResults[i].count || 0 })
    setHistStops(hist)

    // Build stop map
    const stopMap = {}
    stopResults.forEach((res, idx) => {
      const dateStr = allDates[idx].dateStr
      ;(res.data || []).forEach(s => {
        if (!s.driver_name) return
        const key = `${s.driver_name}|${dateStr}`
        stopMap[key] = (stopMap[key] || 0) + 1
      })
    })

    const schedMap = {}
    ;(schedRes.data || []).forEach(r => { schedMap[r.driver_name] = r })

    // Build override map: "name|date" → { status, pharmacy, shift }
    const overMap = {}
    ;(overRes.data || []).forEach(r => { overMap[`${r.driver_name}|${r.date}`] = r })

    setDrivers((drvRes.data || []).filter(d => d.driver_name !== 'Demo Driver'))
    setStops(stopMap)
    setSchedule(schedMap)
    setOverrides(overMap)
    setTimeOff(toRes.data || [])
    setLoading(false)
  }

  function showToastMsg(msg, isErr) {
    setToast({ msg, isErr })
    setTimeout(() => setToast(null), 3000)
  }

  // ── Day card data builder ──
  function getDayData(dateStr, dayIdx) {
    const isToday = dateStr === todayStr
    const isFuture = dateStr > todayStr

    // Stop counts
    let totalStops = 0
    const driverStops = {}
    Object.entries(stops).forEach(([key, count]) => {
      if (key.endsWith(`|${dateStr}`)) {
        totalStops += count
        const name = key.split('|')[0]
        driverStops[name] = count
      }
    })

    // Estimate for future dates
    let estimated = false
    if (totalStops === 0 && isFuture) {
      const past = new Date(dateStr + 'T12:00:00')
      past.setDate(past.getDate() - 28)
      const pastStr = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')}`
      if (histStops[pastStr]) {
        totalStops = histStops[pastStr]
        estimated = true
      }
    }

    // Working/off drivers — check: override → time off → actual stops → default schedule
    const working = []
    const off = []
    drivers.forEach(d => {
      const overKey = `${d.driver_name}|${dateStr}`
      const override = overrides[overKey]
      const to = timeOff.find(r => r.driver_name === d.driver_name && r.date_off === dateStr)
      const sched = schedule[d.driver_name] || {}
      const col = DAY_COLS[dayIdx]

      // Override takes priority (except time off which is separate)
      if (to && (to.status === 'approved' || to.status === 'pending')) {
        const hasStops = !!driverStops[d.driver_name]
        off.push({ name: d.driver_name, type: 'timeoff', status: to.status, hasStops })
      } else if (override) {
        // Explicit override for this specific date
        if (override.status === 'off') {
          off.push({ name: d.driver_name, type: 'off' })
        } else {
          const pharm = override.pharmacy || d.pharmacy || 'SHSP'
          const shift = override.shift || 'AM'
          working.push({ name: d.driver_name, pharm, shift, stops: driverStops[d.driver_name] || 0 })
        }
      } else if (driverStops[d.driver_name]) {
        const pharm = sched[`${col}_pharm`] || d.pharmacy || 'SHSP'
        const shift = sched[`${col}_shift`] || d.shift || 'AM'
        working.push({ name: d.driver_name, pharm, shift, stops: driverStops[d.driver_name] })
      } else {
        const isScheduled = sched[col] !== false && sched[col] !== 'false' && sched[col] !== 0
        if (isScheduled) {
          const pharm = sched[`${col}_pharm`] || d.pharmacy || 'SHSP'
          const shift = sched[`${col}_shift`] || d.shift || 'AM'
          working.push({ name: d.driver_name, pharm, shift, stops: 0 })
        } else {
          off.push({ name: d.driver_name, type: 'off' })
        }
      }
    })

    const activeDrivers = working.length
    const stopsPerDriver = activeDrivers > 0 ? Math.round(totalStops / activeDrivers) : 0
    const severity = stopsPerDriver > 45 ? 'critical' : stopsPerDriver > 35 ? 'watch' : 'healthy'
    const hasGap = off.some(d => d.type === 'timeoff' && d.hasStops)

    return { dateStr, dayIdx, isToday, isFuture, totalStops, estimated, working, off, activeDrivers, stopsPerDriver, severity, hasGap }
  }

  // ── Risk stats ──
  const riskStats = useMemo(() => {
    let flagged = 0, pending = 0, gaps = 0, totalStops = 0, totalDrivers = 0
    allDates.forEach(d => {
      const data = getDayData(d.dateStr, d.dayIdx)
      if (data.severity === 'critical' || data.hasGap) flagged++
      if (data.hasGap) gaps++
      totalStops += data.totalStops
      totalDrivers += data.activeDrivers
    })
    pending = timeOff.filter(r => r.status === 'pending').length
    const avgStops = totalDrivers > 0 ? Math.round(totalStops / totalDrivers) : 0
    return { flagged, pending, gaps, avgStops }
  }, [stops, timeOff, drivers, schedule, allDates, histStops])

  // ── Alerts ──
  const alerts = useMemo(() => {
    const list = []
    allDates.forEach(d => {
      const data = getDayData(d.dateStr, d.dayIdx)
      const dayLabel = `${DAY_LABELS[d.dayIdx]} ${MONTH_NAMES[d.date.getMonth()]} ${d.date.getDate()}`
      if (data.hasGap) {
        const gapDrivers = data.off.filter(o => o.type === 'timeoff' && o.hasStops).map(o => o.name)
        list.push({ type: 'red', msg: `${dayLabel}: ${gapDrivers.join(', ')} off with stops assigned — need coverage`, sort: 0 })
      }
      data.off.filter(o => o.type === 'timeoff' && o.status === 'pending').forEach(o => {
        list.push({ type: 'amber', msg: `${dayLabel}: ${o.name} requested time off — pending approval`, sort: 1 })
      })
      if (data.severity === 'critical' && !data.hasGap) {
        list.push({ type: 'red', msg: `${dayLabel}: ${data.stopsPerDriver} stops/driver — consider adding coverage`, sort: 0 })
      }
      if (data.estimated && data.totalStops > 350) {
        list.push({ type: 'blue', msg: `${dayLabel}: ~${data.totalStops} stops expected (historically high)`, sort: 2 })
      }
    })
    return list.sort((a, b) => a.sort - b.sort).slice(0, 8)
  }, [stops, timeOff, drivers, schedule, allDates, histStops])

  // ── Builder logic ──
  const STATES = [
    { key: 'off', on: false, shift: null, pharm: null },
    { key: 'shsp', on: true, shift: 'AM', pharm: 'SHSP' },
    { key: 'aultman', on: true, shift: 'AM', pharm: 'Aultman' },
    { key: 'pm', on: true, shift: 'PM', pharm: 'SHSP' },
    { key: 'ampm', on: true, shift: 'BOTH', pharm: 'SHSP' },
  ]

  function getCurrentStateIdx(sched, col) {
    const isOn = sched[col] !== false && sched[col] !== 'false' && sched[col] !== 0
    if (!isOn) return 0
    const shift = sched[`${col}_shift`] || 'AM'
    const pharm = sched[`${col}_pharm`] || 'SHSP'
    if (shift === 'PM') return 3
    if (shift === 'BOTH') return 4
    if (pharm === 'Aultman') return 2
    return 1
  }

  async function handleBuilderToggle(driverName, dayIdx) {
    const col = DAY_COLS[dayIdx]
    const sched = schedule[driverName] || {}
    const currentIdx = getCurrentStateIdx(sched, col)
    const next = STATES[(currentIdx + 1) % STATES.length]
    setSaving(`${driverName}|${col}`)
    try {
      const update = { driver_name: driverName, [col]: next.on, [`${col}_shift`]: next.shift, [`${col}_pharm`]: next.pharm }
      await dbUpsert('driver_schedule', update, 'driver_name')
      setSchedule(prev => ({ ...prev, [driverName]: { ...(prev[driverName] || {}), ...update } }))
    } catch (err) { showToastMsg(`Error: ${err.message}`, true) }
    finally { setSaving(null) }
  }

  if (loading) return <div className="ops__loading"><div className="dispatch__spinner" />Loading operations view...</div>

  return (
    <div className="ops">
      {toast && <div className={`ops__toast ${toast.isErr ? 'ops__toast--err' : ''}`}>{toast.msg}</div>}

      {/* Header */}
      <div className="ops__header">
        <div>
          <h2 className="ops__title">14-Day Operations View</h2>
          <p className="ops__subtitle">{dateRange}</p>
        </div>
        <div className="ops__header-actions">
          <button className="ops__nav-btn" onClick={() => setWindowOffset(w => w - 1)}>‹ Prev Week</button>
          {windowOffset !== 0 && <button className="ops__nav-btn ops__nav-btn--today" onClick={() => setWindowOffset(0)}>Today</button>}
          <button className="ops__nav-btn" onClick={() => setWindowOffset(w => w + 1)}>Next Week ›</button>
          <button className={`ops__builder-btn ${showBuilder ? 'ops__builder-btn--active' : ''}`} onClick={() => setShowBuilder(!showBuilder)}>
            {showBuilder ? 'Close Builder' : 'Edit Schedule'}
          </button>
        </div>
      </div>

      {/* Risk Summary */}
      <div className="ops__risk-row">
        <div className="ops__risk-card"><span className="ops__risk-val" style={riskStats.flagged > 0 ? { color: '#dc2626' } : {}}>{riskStats.flagged}</span><span className="ops__risk-label">Nights Flagged</span></div>
        <div className="ops__risk-card"><span className="ops__risk-val" style={riskStats.pending > 0 ? { color: '#d97706' } : {}}>{riskStats.pending}</span><span className="ops__risk-label">Time Off Pending</span></div>
        <div className="ops__risk-card"><span className="ops__risk-val" style={riskStats.gaps > 0 ? { color: '#dc2626' } : {}}>{riskStats.gaps}</span><span className="ops__risk-label">Coverage Gaps</span></div>
        <div className="ops__risk-card"><span className="ops__risk-val">{riskStats.avgStops}</span><span className="ops__risk-label">Avg Stops/Driver</span></div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="ops__alerts">
          {alerts.map((a, i) => (
            <div key={i} className={`ops__alert ops__alert--${a.type}`}>
              <span className="ops__alert-dot" />
              <span>{a.msg}</span>
            </div>
          ))}
        </div>
      )}

      {/* Builder Panel */}
      {showBuilder && (
        <div className="ops__builder">
          <div className="ops__builder-header">
            <h3>Default Weekly Schedule</h3>
            <span className="ops__builder-hint">Click to cycle: Off → SHSP → Aultman → PM → AM+PM → Off</span>
          </div>
          <div className="ops__builder-grid-wrap">
            <table className="ops__builder-grid">
              <thead><tr>
                <th className="ops__bth">Driver</th>
                {DAY_LABELS.map(d => <th key={d} className="ops__bth-day">{d}</th>)}
              </tr></thead>
              <tbody>
                {drivers.sort((a, b) => a.driver_name.localeCompare(b.driver_name)).map(driver => (
                  <tr key={driver.driver_name}>
                    <td className="ops__bcell-name">{driver.driver_name}</td>
                    {DAY_COLS.map((col, i) => {
                      const sched = schedule[driver.driver_name] || {}
                      const stateIdx = getCurrentStateIdx(sched, col)
                      const state = STATES[stateIdx]
                      const isSav = saving === `${driver.driver_name}|${col}`
                      let cls = !state.on ? '' : state.shift === 'PM' ? 'ops__btn--pm' : state.shift === 'BOTH' ? 'ops__btn--ampm' : state.pharm === 'Aultman' ? 'ops__btn--alt' : 'ops__btn--shsp'
                      const lbl = !state.on ? '—' : state.pharm === 'Aultman' ? 'ALT' : state.shift === 'PM' ? 'PM' : state.shift === 'BOTH' ? 'A+P' : 'SHSP'
                      return <td key={col} className="ops__bcell"><button className={`ops__btn ${cls} ${isSav ? 'ops__btn--saving' : ''}`} onClick={() => handleBuilderToggle(driver.driver_name, i)} disabled={isSav}>{lbl}</button></td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Week Grids */}
      {weeks.map((week, wi) => (
        <div key={wi} className="ops__week">
          <h3 className="ops__week-label">Week {wi + 1} — {week.label}</h3>
          <div className="ops__week-grid">
            {week.days.map((d) => {
              const data = getDayData(d.dateStr, d.dayIdx)
              const headerBg = data.hasGap || data.severity === 'critical' ? 'ops__day-head--critical' :
                data.severity === 'watch' ? 'ops__day-head--watch' :
                data.isToday ? 'ops__day-head--today' : ''
              const borderClass = data.hasGap || data.severity === 'critical' ? 'ops__day--critical' :
                data.severity === 'watch' ? 'ops__day--watch' :
                data.isToday ? 'ops__day--today' : ''

              return (
                <div key={d.dateStr} className={`ops__day ${borderClass}`}>
                  <div className={`ops__day-head ${headerBg}`} onClick={() => setEditDay(editDay === d.dateStr ? null : d.dateStr)} style={{ cursor: 'pointer' }}>
                    <div className="ops__day-top">
                      <span className="ops__day-name">{DAY_LABELS[d.dayIdx]}</span>
                      <span className="ops__day-date">{d.date.getDate()}</span>
                    </div>
                    <div className="ops__day-stops">
                      {data.estimated ? `~${data.totalStops} est.` : `${data.totalStops} stops`}
                    </div>
                    {data.activeDrivers > 0 && (
                      <div className={`ops__day-ratio ops__day-ratio--${data.severity}`}>
                        {data.stopsPerDriver} stops/driver
                      </div>
                    )}
                  </div>
                  <div className="ops__day-body">
                    {(() => {
                      // BOTH shift drivers appear in their pharmacy group AND PM group
                      const shsp = data.working.filter(w => (w.shift === 'AM' || w.shift === 'BOTH') && w.pharm !== 'Aultman')
                      const alt = data.working.filter(w => (w.shift === 'AM' || w.shift === 'BOTH') && w.pharm === 'Aultman')
                      const pm = data.working.filter(w => w.shift === 'PM' || w.shift === 'BOTH')
                      return <>
                        {shsp.length > 0 && <>
                          <div className="ops__group-label ops__group-label--shsp">SHSP ({shsp.length})</div>
                          {shsp.map(w => <div key={w.name} className="ops__driver-row"><span className="ops__driver-name">{w.name}</span></div>)}
                        </>}
                        {alt.length > 0 && <>
                          <div className="ops__group-label ops__group-label--alt">Aultman ({alt.length})</div>
                          {alt.map(w => <div key={w.name} className="ops__driver-row"><span className="ops__driver-name">{w.name}</span></div>)}
                        </>}
                        {pm.length > 0 && <>
                          <div className="ops__group-label ops__group-label--pm">PM ({pm.length})</div>
                          {pm.map(w => <div key={w.name} className="ops__driver-row"><span className="ops__driver-name">{w.name}</span><span className="ops__pharm-badge ops__pharm-badge--shsp">{w.shift === 'BOTH' ? 'A+P' : 'PM'}</span></div>)}
                        </>}
                      </>
                    })()}
                    {(data.working.length > 0 && data.off.length > 0) && <div className="ops__divider" />}
                    {data.off.filter(o => o.type !== 'off').map(o => (
                      <div key={o.name} className="ops__driver-row">
                        <span className="ops__driver-name ops__driver-name--off">{o.name}</span>
                        {o.type === 'timeoff' && o.hasStops && <span className="ops__badge ops__badge--gap">No coverage</span>}
                        {o.type === 'timeoff' && !o.hasStops && o.status === 'approved' && <span className="ops__badge ops__badge--timeoff">Time off</span>}
                        {o.type === 'timeoff' && !o.hasStops && o.status === 'pending' && <span className="ops__badge ops__badge--pending">Requested</span>}
                      </div>
                    ))}
                    {data.off.filter(o => o.type === 'off').length > 0 && data.working.length > 0 && (
                      <div className="ops__off-count">{data.off.filter(o => o.type === 'off').length} off</div>
                    )}
                  </div>

                  {/* Day Edit Panel */}
                  {editDay === d.dateStr && (
                    <div className="ops__day-edit">
                      <div className="ops__day-edit-header">
                        <span>Edit {DAY_LABELS[d.dayIdx]} {d.date.getMonth() + 1}/{d.date.getDate()}</span>
                        <button className="ops__day-edit-close" onClick={e => { e.stopPropagation(); setEditDay(null) }}>✕</button>
                      </div>
                      <div className="ops__day-edit-list">
                        {drivers.map(driver => {
                          const overKey = `${driver.driver_name}|${d.dateStr}`
                          const override = overrides[overKey]
                          const sched = schedule[driver.driver_name] || {}
                          const col = DAY_COLS[d.dayIdx]
                          const to = timeOff.find(r => r.driver_name === driver.driver_name && r.date_off === d.dateStr)

                          // Current effective state
                          let currentStatus = 'off'
                          let currentPharm = sched[`${col}_pharm`] || driver.pharmacy || 'SHSP'
                          let currentShift = sched[`${col}_shift`] || driver.shift || 'AM'
                          if (override) {
                            currentStatus = override.status
                            if (override.pharmacy) currentPharm = override.pharmacy
                            if (override.shift) currentShift = override.shift
                          } else {
                            const isScheduled = sched[col] !== false && sched[col] !== 'false' && sched[col] !== 0
                            currentStatus = isScheduled ? 'working' : 'off'
                          }
                          if (to) currentStatus = 'timeoff'

                          const isWorking = currentStatus === 'working'
                          const isTimeOff = currentStatus === 'timeoff'

                          // Cycle states for this override
                          const OVER_STATES = [
                            { status: 'off', pharm: null, shift: null, label: '—', cls: '' },
                            { status: 'working', pharm: 'SHSP', shift: 'AM', label: 'SHSP', cls: 'ops__obtn--shsp' },
                            { status: 'working', pharm: 'Aultman', shift: 'AM', label: 'ALT', cls: 'ops__obtn--alt' },
                            { status: 'working', pharm: currentPharm, shift: 'PM', label: 'PM', cls: 'ops__obtn--pm' },
                          ]
                          const curIdx = isTimeOff ? -1 : OVER_STATES.findIndex(s =>
                            s.status === currentStatus &&
                            (s.status === 'off' || (s.pharm === currentPharm && s.shift === currentShift))
                          )

                          async function cycleOverride() {
                            if (isTimeOff) return // can't override time off from here
                            const nextIdx = (curIdx + 1) % OVER_STATES.length
                            const next = OVER_STATES[nextIdx]
                            setSaving(overKey)
                            try {
                              if (next.status === 'off' && !override) {
                                // Setting to off when default is off — remove override if exists
                                await dbUpsert('schedule_overrides', {
                                  driver_name: driver.driver_name, date: d.dateStr,
                                  status: 'off', pharmacy: null, shift: null,
                                }, 'driver_name,date')
                              } else {
                                await dbUpsert('schedule_overrides', {
                                  driver_name: driver.driver_name, date: d.dateStr,
                                  status: next.status, pharmacy: next.pharm, shift: next.shift,
                                }, 'driver_name,date')
                              }
                              setOverrides(prev => ({
                                ...prev,
                                [overKey]: { status: next.status, pharmacy: next.pharm, shift: next.shift },
                              }))
                            } catch (err) { showToastMsg(`Error: ${err.message}`, true) }
                            finally { setSaving(null) }
                          }

                          const btnCls = isTimeOff ? 'ops__obtn--to' : isWorking ?
                            (currentShift === 'PM' ? 'ops__obtn--pm' : currentPharm === 'Aultman' ? 'ops__obtn--alt' : 'ops__obtn--shsp') : ''
                          const btnLabel = isTimeOff ? 'TO' : isWorking ?
                            (currentShift === 'PM' ? 'PM' : currentPharm === 'Aultman' ? 'ALT' : 'SHSP') : '—'

                          return (
                            <div key={driver.driver_name} className="ops__day-edit-row">
                              <span className="ops__day-edit-name">{driver.driver_name}</span>
                              <button
                                className={`ops__obtn ${btnCls} ${saving === overKey ? 'ops__obtn--saving' : ''}`}
                                onClick={cycleOverride}
                                disabled={saving === overKey || isTimeOff}
                                title={isTimeOff ? 'Has time off — manage in Time Off' : 'Click to cycle'}
                              >
                                {btnLabel}
                              </button>
                              {override && <span className="ops__override-dot" title="Override active">●</span>}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
