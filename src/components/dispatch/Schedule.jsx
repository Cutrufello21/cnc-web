import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { dbUpsert } from '../../lib/db'
import ScheduleBuilder, { STATES, getCurrentStateIdx } from './ScheduleBuilder'
import ScheduleAudit from './ScheduleAudit'
import ScheduleWeekGrid from './ScheduleWeekGrid'
import { PendingPanel, PendingRequestsList } from './SchedulePending'
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
  const [shiftOffers, setShiftOffers] = useState({}) // "name|dateStr" → offer
  const [loading, setLoading] = useState(true)
  const [windowOffset, setWindowOffset] = useState(0) // weeks to shift
  const [showBuilder, setShowBuilder] = useState(false)
  const [saving, setSaving] = useState(null)
  const [toast, setToast] = useState(null)
  const [showAudit, setShowAudit] = useState(false)
  const [audit, setAudit] = useState(null)
  const [auditLoading, setAuditLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [selectedRecs, setSelectedRecs] = useState(new Set())
  const [showPendingPanel, setShowPendingPanel] = useState(false)

  // ── Compute 14-day window (2 full Mon-Fri weeks) ──
  const { weeks, allDates, dateRange, windowStart, windowEnd } = useMemo(() => {
    const now = new Date()
    const dow = now.getDay()
    // Advance to next week on Saturday (6) and Sunday (0)
    const mondayOffset = dow === 6 ? 2 : dow === 0 ? 1 : 1 - dow
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

    const [drvRes, schedRes, toRes, overRes, offersRes] = await Promise.all([
      supabase.from('drivers').select('driver_name, driver_number, pharmacy, shift, active').eq('active', true).order('driver_name'),
      supabase.from('driver_schedule').select('*'),
      supabase.from('time_off_requests').select('*')
        .gte('date_off', windowStart).lte('date_off', windowEnd)
        .in('status', ['approved', 'pending']),
      supabase.from('schedule_overrides').select('*')
        .gte('date', windowStart).lte('date', windowEnd),
      supabase.from('shift_offers').select('*')
        .gte('date', windowStart).lte('date', windowEnd)
        .in('status', ['pending', 'accepted', 'declined']),
    ])

    const { data: allPending } = await supabase.from('time_off_requests').select('*')
      .eq('status', 'pending').gte('date_off', new Date().toISOString().split('T')[0])
    const pendingIds = new Set((toRes.data || []).map(r => r.id))
    const extraPending = (allPending || []).filter(r => !pendingIds.has(r.id))

    const stopResults = await Promise.all(
      allDates.map(d =>
        supabase.from('daily_stops').select('driver_name')
          .eq('delivery_date', d.dateStr)
          .not('status', 'eq', 'DELETED')
          .limit(1000)
      )
    )

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

    const overMap = {}
    ;(overRes.data || []).forEach(r => { overMap[`${r.driver_name}|${r.date}`] = r })

    const offerMap = {}
    ;(offersRes.data || []).forEach(r => { offerMap[`${r.driver_name}|${r.date}`] = r })

    setDrivers((drvRes.data || []).filter(d => d.driver_name !== 'Demo Driver'))
    setStops(stopMap)
    setSchedule(schedMap)
    setOverrides(overMap)
    setShiftOffers(offerMap)
    setTimeOff([...(toRes.data || []), ...extraPending])
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

    let totalStops = 0
    const driverStops = {}
    Object.entries(stops).forEach(([key, count]) => {
      if (key.endsWith(`|${dateStr}`)) {
        totalStops += count
        const name = key.split('|')[0]
        driverStops[name] = count
      }
    })

    let estimated = false
    if (totalStops === 0 && isFuture) {
      const past = new Date(dateStr + 'T12:00:00')
      past.setDate(past.getDate() - 28)
      const pastStr = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')}`
      if (histStops[pastStr]) { totalStops = histStops[pastStr]; estimated = true }
    }

    const working = []
    const off = []
    drivers.forEach(d => {
      const overKey = `${d.driver_name}|${dateStr}`
      const override = overrides[overKey]
      const to = timeOff.find(r => r.driver_name === d.driver_name && r.date_off === dateStr)
      const sched = schedule[d.driver_name] || {}
      const col = DAY_COLS[dayIdx]

      if (to && (to.status === 'approved' || to.status === 'pending')) {
        const hasStops = !!driverStops[d.driver_name]
        off.push({ name: d.driver_name, type: 'timeoff', status: to.status, hasStops })
      } else if (override) {
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

  // ── Today's stats for metric cards ──
  const todayStats = useMemo(() => {
    const dow = new Date().getDay() // 0=Sun ... 6=Sat
    const dayIdx = dow >= 1 && dow <= 5 ? dow - 1 : 0 // Mon=0 ... Fri=4
    const data = getDayData(todayStr, dayIdx)
    const shspCount = data.working.filter(w => w.pharm !== 'Aultman' && (w.shift === 'AM' || w.shift === 'BOTH')).length
    const aultCount = data.working.filter(w => w.pharm === 'Aultman' && (w.shift === 'AM' || w.shift === 'BOTH')).length
    const pending = timeOff.filter(r => r.status === 'pending').length
    return { activeDrivers: data.activeDrivers, shspCount, aultCount, totalStops: data.totalStops, estimated: data.estimated, pending }
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
    })
    return list.sort((a, b) => a.sort - b.sort).slice(0, 8)
  }, [stops, timeOff, drivers, schedule, allDates, histStops])

  // ── Builder toggle handler ──
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

  // ── Audit logic ──
  async function loadAudit() {
    setAuditLoading(true)
    try {
      const res = await fetch('/api/rules-audit')
      const data = await res.json()
      setAudit(data)
      setSelectedRecs(new Set(data.recommendations?.map((_, i) => i) || []))
    } catch (err) { showToastMsg(`Error: ${err.message}`, true) }
    finally { setAuditLoading(false) }
  }

  async function applySelected() {
    if (!audit?.recommendations) return
    const updates = audit.recommendations
      .filter((_, i) => selectedRecs.has(i))
      .map(r => ({ zip: r.zip, day: r.day, to: r.to }))
    if (updates.length === 0) return
    if (!confirm(`Apply ${updates.length} routing rule changes?`)) return
    setApplying(true)
    try {
      const res = await fetch('/api/rules-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      })
      const data = await res.json()
      showToastMsg(`Applied ${data.applied} rule changes`)
      loadAudit()
    } catch (err) { showToastMsg(`Error: ${err.message}`, true) }
    finally { setApplying(false) }
  }

  if (loading) return <div className="ops__loading"><div className="dispatch__spinner" />Loading operations view...</div>

  const pendingRequests = timeOff.filter(r => r.status === 'pending')

  return (
    <div className="ops">
      {toast && <div className={`ops__toast ${toast.isErr ? 'ops__toast--err' : ''}`}>{toast.msg}</div>}

      {/* Header */}
      <div className="ops__header">
        <div>
          <h2 className="ops__title">Schedule</h2>
          <p className="ops__subtitle">{dateRange}</p>
        </div>
        <div className="ops__header-actions">
          <button className="ops__nav-btn" onClick={() => setWindowOffset(w => w - 1)}>&#8249; Prev</button>
          {windowOffset !== 0 && <button className="ops__nav-btn ops__nav-btn--today" onClick={() => setWindowOffset(0)}>Today</button>}
          <button className="ops__nav-btn" onClick={() => setWindowOffset(w => w + 1)}>Next &#8250;</button>
          <button className="ops__builder-btn" onClick={() => { setShowAudit(!showAudit); if (!audit && !showAudit) loadAudit() }}>
            {showAudit ? 'Close Audit' : 'Rules Audit'}
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="ops__risk-row">
        <div className="ops__risk-card">
          <span className="ops__risk-val">{todayStats.activeDrivers}</span>
          <span className="ops__risk-label">Active Today</span>
        </div>
        <div className="ops__risk-card">
          <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: '#0A2463' }}>{todayStats.shspCount}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af' }}>/</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: '#16a34a' }}>{todayStats.aultCount}</span>
          </div>
          <span className="ops__risk-label">SHSP / Aultman</span>
        </div>
        <div className="ops__risk-card">
          <span className="ops__risk-val">{todayStats.estimated ? `~${todayStats.totalStops}` : todayStats.totalStops}</span>
          <span className="ops__risk-label">Stops Today</span>
        </div>
        <div className="ops__risk-card ops__risk-card--clickable" onClick={() => setShowPendingPanel(!showPendingPanel)}>
          <span className="ops__risk-val" style={todayStats.pending > 0 ? { color: '#d97706' } : {}}>{todayStats.pending}</span>
          <span className="ops__risk-label">Time Off Pending</span>
        </div>
      </div>

      {/* Pending Time Off Panel */}
      {showPendingPanel && (
        <PendingPanel
          pendingRequests={pendingRequests}
          allTimeOff={timeOff}
          onClose={() => setShowPendingPanel(false)}
          showToastMsg={showToastMsg}
          loadData={loadData}
        />
      )}

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


      {/* Rules Audit Panel */}
      {showAudit && (
        <ScheduleAudit
          audit={audit}
          auditLoading={auditLoading}
          selectedRecs={selectedRecs}
          setSelectedRecs={setSelectedRecs}
          applying={applying}
          onApply={applySelected}
        />
      )}

      {/* Week Grids */}
      <ScheduleWeekGrid
        weeks={weeks}
        drivers={drivers}
        schedule={schedule}
        overrides={overrides}
        timeOff={timeOff}
        saving={saving}
        setSaving={setSaving}
        setOverrides={setOverrides}
        showToastMsg={showToastMsg}
        getDayData={getDayData}
        shiftOffers={shiftOffers}
        loadData={loadData}
        onSendOffer={async (driverName, dateStr, pharmacy, shift) => {
          setSaving(`offer-${driverName}|${dateStr}`)
          try {
            await fetch('/api/db', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ table: 'shift_offers', operation: 'upsert', data: { driver_name: driverName, date: dateStr, pharmacy, shift, status: 'pending', offered_by: 'Dom' }, onConflict: 'driver_name,date' }) })
            await fetch('/api/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'push_notify', driverNames: [driverName], title: 'Shift Offered', body: `Dom is offering you a shift on ${new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} — ${pharmacy} ${shift}. Open the app to respond.` }) })
            showToastMsg(`Shift offered to ${driverName}`)
            loadData()
          } catch (err) { showToastMsg(`Error: ${err.message}`, true) }
          finally { setSaving(null) }
        }}
      />
    </div>
  )
}
