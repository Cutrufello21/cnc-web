import { useMemo, useState } from 'react'
import { dbUpsert, dbUpdate } from '../../lib/db'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const DAY_COLS = ['mon', 'tue', 'wed', 'thu', 'fri']
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const CYCLE = [
  { status: 'off', pharm: null, shift: null },
  { status: 'working', pharm: 'SHSP', shift: 'AM' },
  { status: 'working', pharm: 'Aultman', shift: 'AM' },
  { status: 'working', pharm: 'SHSP', shift: 'PM' },
  { status: 'working', pharm: 'SHSP', shift: 'BOTH' },
]

function getCycleIdx(status, pharm, shift) {
  if (status === 'off' || status === 'timeoff') return 0
  if (shift === 'BOTH') return 4
  if (shift === 'PM') return 3
  if (pharm === 'Aultman') return 2
  return 1
}

function badgeLabel(status, pharm, shift) {
  if (status === 'timeoff-pending') return 'REQ'
  if (status === 'timeoff') return 'T/O'
  if (status === 'off') return 'Off'
  if (shift === 'BOTH') return 'A+P'
  if (shift === 'PM') return 'PM'
  if (pharm === 'Aultman') return 'Ault'
  return 'SHSP'
}

function badgeClass(status, pharm, shift) {
  if (status === 'timeoff-pending') return 'roster__badge--req'
  if (status === 'timeoff') return 'roster__badge--to'
  if (status === 'off') return 'roster__badge--off'
  if (shift === 'BOTH') return 'roster__badge--ampm'
  if (shift === 'PM') return 'roster__badge--pm'
  if (pharm === 'Aultman') return 'roster__badge--ault'
  return 'roster__badge--shsp'
}

export default function ScheduleWeekGrid({ weeks, drivers, schedule, overrides, timeOff, saving, setSaving, setOverrides, showToastMsg, getDayData, shiftOffers, onSendOffer, loadData }) {
  const todayStr = useMemo(() => {
    const t = new Date()
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
  }, [])

  // Offer modal state. When set, renders the "Offer Shift" dialog.
  const [offerModal, setOfferModal] = useState(null)
  const [offerPharm, setOfferPharm] = useState('SHSP')
  const [offerShiftVal, setOfferShiftVal] = useState('AM')

  // Reviewed state per week (persisted in localStorage)
  const reviewed = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('schedule_reviewed') || '{}') } catch { return {} }
  }, [])
  function toggleReviewed(weekKey) {
    const next = { ...reviewed, [weekKey]: !reviewed[weekKey] }
    localStorage.setItem('schedule_reviewed', JSON.stringify(next))
    window.location.reload() // simple refresh to update
  }

  // Flatten all dates for the grid
  const allDates = weeks.flatMap(w => w.days)

  // Sort drivers alphabetically
  const sortedDrivers = [...drivers].sort((a, b) => a.driver_name.localeCompare(b.driver_name))

  // Build cell data for each driver × date
  function getCellData(driver, d) {
    const overKey = `${driver.driver_name}|${d.dateStr}`
    const override = overrides[overKey]
    const sched = schedule[driver.driver_name] || {}
    const col = DAY_COLS[d.dayIdx]
    const to = timeOff.find(r => r.driver_name === driver.driver_name && r.date_off === d.dateStr)

    let status = 'off'
    let pharm = sched[`${col}_pharm`] || driver.pharmacy || 'SHSP'
    let shift = sched[`${col}_shift`] || driver.shift || 'AM'
    let isModified = false // Dom changed from default
    let isDriverRequest = false // Driver-requested change

    if (to && to.status === 'pending') {
      return { status: 'timeoff-pending', pharm: null, shift: null, isModified: false, isDriverRequest: true, canCycle: true, timeOffId: to.id, timeOffStatus: 'pending' }
    }
    if (to && to.status === 'approved') {
      return { status: 'timeoff', pharm: null, shift: null, isModified: false, isDriverRequest: true, canCycle: true, timeOffId: to.id, timeOffStatus: 'approved' }
    }

    if (override) {
      isModified = true
      status = override.status || 'off'
      if (override.pharmacy) pharm = override.pharmacy
      if (override.shift) shift = override.shift
    } else {
      const isScheduled = sched[col] !== false && sched[col] !== 'false' && sched[col] !== 0
      status = isScheduled ? 'working' : 'off'
    }

    // Shift offer state (Dom-initiated, driver responds in app)
    const offerKey = `${driver.driver_name}|${d.dateStr}`
    const offer = shiftOffers?.[offerKey]
    if (offer && offer.status === 'accepted') {
      isDriverRequest = true
    }
    const pendingOffer = offer && offer.status === 'pending' ? offer : null
    const declinedOffer = offer && offer.status === 'declined' ? offer : null

    return { status, pharm, shift, isModified, isDriverRequest, canCycle: true, pendingOffer, declinedOffer }
  }

  async function cycleCell(driver, d) {
    const cell = getCellData(driver, d)
    if (!cell.canCycle) return

    const dayLabel = `${DAY_LABELS[d.dayIdx]} ${d.date.getMonth()+1}/${d.date.getDate()}`

    // If overriding time off, confirm first
    if (cell.timeOffId) {
      const action = cell.timeOffStatus === 'pending' ? 'has a pending time off request' : 'has approved time off'
      if (!confirm(`${driver.driver_name} ${action} on ${dayLabel}.\n\nOverride and assign a shift? This will deny/cancel the time off.`)) return

      const overKey = `${driver.driver_name}|${d.dateStr}`
      setSaving(overKey)
      try {
        // Deny/cancel the time off request
        await dbUpdate('time_off_requests', { status: 'denied', reviewed_by: 'Dispatch' }, { id: cell.timeOffId })
        // Set them to SHSP by default
        const payload = { driver_name: driver.driver_name, date: d.dateStr, status: 'working', pharmacy: 'SHSP', shift: 'AM' }
        await dbUpsert('schedule_overrides', payload, 'driver_name,date')
        setOverrides(prev => ({ ...prev, [overKey]: payload }))
        fetch('/api/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'push_notify', driverNames: [driver.driver_name],
            title: 'Schedule Updated', body: `Your time off on ${dayLabel} has been overridden. You are now scheduled to work.` })
        }).catch(() => {})
        showToastMsg(`${driver.driver_name} — time off overridden, assigned SHSP on ${dayLabel}`)
        if (loadData) loadData()
      } catch (err) { showToastMsg(`Error: ${err.message}`, true) }
      finally { setSaving(null) }
      return
    }

    const curIdx = getCycleIdx(cell.status, cell.pharm, cell.shift)
    const nextIdx = (curIdx + 1) % CYCLE.length
    const next = CYCLE[nextIdx]

    const overKey = `${driver.driver_name}|${d.dateStr}`
    setSaving(overKey)
    try {
      const payload = {
        driver_name: driver.driver_name, date: d.dateStr,
        status: next.status, pharmacy: next.pharm, shift: next.shift,
      }
      await dbUpsert('schedule_overrides', payload, 'driver_name,date')
      setOverrides(prev => ({
        ...prev,
        [overKey]: { driver_name: driver.driver_name, date: d.dateStr, status: next.status, pharmacy: next.pharm, shift: next.shift },
      }))
      const statusLabel = next.status === 'off' ? 'Off' : next.pharm === 'Aultman' ? 'Aultman' : next.shift === 'PM' ? 'PM' : next.shift === 'BOTH' ? 'A+P' : 'SHSP'
      showToastMsg(`${driver.driver_name} → ${statusLabel} on ${dayLabel}`)
    } catch (err) { showToastMsg(`Error: ${err.message}`, true) }
    finally { setSaving(null) }
  }

  return (
    <div className="roster">
      <div className="roster__scroll">
        <table className="roster__table">
          <thead>
            {/* Week headers spanning 5 columns each */}
            <tr className="roster__week-row">
              <th className="roster__corner"></th>
              {weeks.map((week, wi) => {
                const weekKey = week.days[0]?.dateStr || `w${wi}`
                const isReviewed = !!reviewed[weekKey]
                return (
                  <th key={wi} colSpan={5} className="roster__week-header-cell">
                    <div className="roster__week-header-inner">
                      <span className="roster__week-title">Week {wi + 1} — {week.label}</span>
                      <label className={`roster__reviewed ${isReviewed ? 'roster__reviewed--done' : ''}`} onClick={e => { e.preventDefault(); toggleReviewed(weekKey) }}>
                        <span className={`roster__reviewed-check ${isReviewed ? 'roster__reviewed-check--on' : ''}`}>
                          {isReviewed ? '✓' : ''}
                        </span>
                        {isReviewed ? 'Reviewed' : 'Review'}
                      </label>
                    </div>
                  </th>
                )
              })}
            </tr>
            {/* Date headers */}
            <tr className="roster__date-row">
              <th className="roster__driver-header">Driver</th>
              {allDates.map(d => {
                const isToday = d.dateStr === todayStr
                const data = getDayData(d.dateStr, d.dayIdx)
                return (
                  <th key={d.dateStr} className={`roster__date-header ${isToday ? 'roster__date-header--today' : ''}`}>
                    <span className="roster__date-day">{DAY_LABELS[d.dayIdx]}</span>
                    <span className="roster__date-num">{d.date.getMonth() + 1}/{d.date.getDate()}</span>
                    <span className={`roster__date-stops ${data.severity === 'critical' ? 'roster__date-stops--critical' : data.severity === 'watch' ? 'roster__date-stops--watch' : ''}`}>
                      {data.estimated ? `~${data.totalStops}` : data.totalStops}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sortedDrivers.map(driver => (
              <tr key={driver.driver_name} className="roster__driver-row">
                <td className="roster__driver-name">{driver.driver_name}</td>
                {allDates.map(d => {
                  const cell = getCellData(driver, d)
                  const overKey = `${driver.driver_name}|${d.dateStr}`
                  const isSaving = saving === overKey
                  const isToday = d.dateStr === todayStr
                  const label = badgeLabel(cell.status, cell.pharm, cell.shift)
                  const cls = badgeClass(cell.status, cell.pharm, cell.shift)

                  let outlineCls = ''
                  if (cell.isDriverRequest) outlineCls = 'roster__badge--driver-req'
                  else if (cell.isModified) outlineCls = 'roster__badge--modified'

                  // Only show the offer button on plain "Off" cells. Time-off (T/O) and pending requests
                  // have their own meaning — offering through them would be confusing.
                  const canOffer = cell.status === 'off' && !cell.pendingOffer
                  const dayLabel = `${DAY_LABELS[d.dayIdx]} ${d.date.getMonth()+1}/${d.date.getDate()}`
                  return (
                    <td
                      key={d.dateStr}
                      className={`roster__cell ${isToday ? 'roster__cell--today' : ''}`}
                      onClick={() => !isSaving && cycleCell(driver, d)}
                      style={{ position: 'relative' }}
                    >
                      <span className={`roster__badge ${cls} ${outlineCls} ${isSaving ? 'roster__badge--saving' : ''} ${!cell.canCycle ? 'roster__badge--locked' : ''}`}>
                        {label}
                      </span>
                      {cell.pendingOffer && (
                        <span title={`Offered ${cell.pendingOffer.pharmacy} ${cell.pendingOffer.shift} — awaiting response`} style={{ position: 'absolute', top: 2, right: 2, fontSize: 9, fontWeight: 700, color: '#d97706', background: '#fef3c7', borderRadius: 4, padding: '1px 4px', lineHeight: 1, pointerEvents: 'none' }}>OFFERED</span>
                      )}
                      {canOffer && (
                        <button
                          type="button"
                          title={`Offer shift to ${driver.driver_name} on ${dayLabel}`}
                          onClick={(e) => { e.stopPropagation(); setOfferPharm(driver.pharmacy === 'Aultman' ? 'Aultman' : 'SHSP'); setOfferShiftVal('AM'); setOfferModal({ driverName: driver.driver_name, dateStr: d.dateStr, dayLabel }) }}
                          style={{ position: 'absolute', top: 1, right: 1, width: 16, height: 16, borderRadius: 8, border: 'none', background: 'rgba(10,36,99,0.85)', color: '#fff', fontSize: 11, fontWeight: 700, lineHeight: '14px', padding: 0, cursor: 'pointer', opacity: 0.5 }}
                          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                          onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}
                        >+</button>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend + pharmacy counts */}
      <div className="roster__footer">
        <div className="roster__legend">
          <div className="roster__legend-item"><span className="roster__badge roster__badge--shsp" style={{ minWidth: 32, height: 20, fontSize: 9 }}>SHSP</span></div>
          <div className="roster__legend-item"><span className="roster__badge roster__badge--ault" style={{ minWidth: 32, height: 20, fontSize: 9 }}>Ault</span></div>
          <div className="roster__legend-item"><span className="roster__badge roster__badge--pm" style={{ minWidth: 32, height: 20, fontSize: 9 }}>PM</span></div>
          <div className="roster__legend-item"><span className="roster__badge roster__badge--ampm" style={{ minWidth: 32, height: 20, fontSize: 9 }}>A+P</span></div>
          <div className="roster__legend-item"><span className="roster__badge roster__badge--off" style={{ minWidth: 32, height: 20, fontSize: 9, background: '#f1f5f9' }}>Off</span></div>
          <div className="roster__legend-item"><span className="roster__badge roster__badge--modified" style={{ minWidth: 14, height: 14, background: '#f1f5f9' }}></span><span>Dom modified</span></div>
          <div className="roster__legend-item"><span className="roster__badge roster__badge--driver-req" style={{ minWidth: 14, height: 14, background: '#f1f5f9' }}></span><span>Driver request</span></div>
        </div>
        <div className="roster__pharma-counts">
          {(() => {
            // Count today's active drivers by pharmacy
            const todayData = getDayData(todayStr, new Date().getDay() - 1)
            const shspCount = todayData.working.filter(w => w.pharm !== 'Aultman' && (w.shift === 'AM' || w.shift === 'BOTH')).length
            const aultCount = todayData.working.filter(w => w.pharm === 'Aultman' && (w.shift === 'AM' || w.shift === 'BOTH')).length
            const pmCount = todayData.working.filter(w => w.shift === 'PM' || w.shift === 'BOTH').length
            return <>
              <span className="roster__pharma-tag roster__pharma-tag--shsp">SHSP ({shspCount})</span>
              <span className="roster__pharma-tag roster__pharma-tag--ault">Aultman ({aultCount})</span>
              {pmCount > 0 && <span className="roster__pharma-tag roster__pharma-tag--pm">PM ({pmCount})</span>}
              <span className="roster__pharma-tag roster__pharma-tag--total">{todayData.activeDrivers} active today</span>
            </>
          })()}
        </div>
      </div>

      {offerModal && (
        <div onClick={() => setOfferModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 24, width: 360, maxWidth: '90vw', boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0A2463', marginBottom: 4 }}>Offer Shift</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>{offerModal.driverName} · {offerModal.dayLabel} · {new Date(offerModal.dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Pharmacy</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {['SHSP', 'Aultman'].map(p => (
                <button key={p} type="button" onClick={() => setOfferPharm(p)} style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: offerPharm === p ? '2px solid #0A2463' : '1px solid #e2e8f0', background: offerPharm === p ? '#eff6ff' : '#fff', color: offerPharm === p ? '#0A2463' : '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{p}</button>
              ))}
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Shift</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {['AM', 'PM', 'BOTH'].map(s => (
                <button key={s} type="button" onClick={() => setOfferShiftVal(s)} style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: offerShiftVal === s ? '2px solid #0A2463' : '1px solid #e2e8f0', background: offerShiftVal === s ? '#eff6ff' : '#fff', color: offerShiftVal === s ? '#0A2463' : '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{s === 'BOTH' ? 'AM + PM' : s}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setOfferModal(null)} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button type="button" onClick={async () => { const m = offerModal; setOfferModal(null); if (onSendOffer) await onSendOffer(m.driverName, m.dateStr, offerPharm, offerShiftVal) }} style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: '#0A2463', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Send Offer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
