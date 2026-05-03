import { useState, useRef, useEffect, lazy, Suspense } from 'react'
import DriverCard from './DriverCard'
import WarningBanner from './WarningBanner'
import DispatchSummary from './DispatchSummary'
import RecentLog from './RecentLog'
const DispatchMap = lazy(() => import('./DispatchMap'))
import SortList from './SortList'
import RoutingEditor from './RoutingEditor'
import WeatherWidget from './WeatherWidget'
import StopDistribution from './StopDistribution'
import UnassignedSection from './UnassignedSection'
import UnassignedZips from './UnassignedZips'

export default function RoutesView(p) {
const {
  data, loading, error, selectedDay, weekOffset, setWeekOffset,
  showRouting, setShowRouting, showSortList, setShowSortList,
  showUnassigned, setShowUnassigned, zipSearch, setZipSearch,
  handleDayChange, fetchDispatchData, handleMoveComplete, handleUndo,
  moveToast, setMoveToast, lastMove, undoing,
  dismissedWarnings, setDismissedWarnings,
  totalStops, totalColdChain, allActiveDrivers, activeDrivers, inactiveDrivers,
  // Send actions
  sendingRoutes, routesSent, handleSendRoutes,
  sentSnapshot, resending, handleResendChanges,
  sendingCorrections, correctionsSent, handleSendCorrections,
  sendingResendCorrections, handleResendCorrections,
  sendingForceAll, forceAllSent, handleForceSendAll,
  sendingCallIns, callInsSent, callInPreview, handlePreviewCallIns, handleConfirmCallIns,
  correctionPreview, setCorrectionPreview, handlePreviewCorrections, handleConfirmCorrections,
  handlePreviewAndReview, combinedPreview, setCombinedPreview,
  resendAllPreview, setResendAllPreview, handleConfirmResendAll,
  forceDriverSelection, setForceDriverSelection, handleForceSendSelected,
  // AI
  sessionCorrections, sessionStartTime, sessionFinalMinutes, routesSent: routesSentProp,
  aiLoading, aiResult, setAiResult, aiApplying, handleAiSuggest, handleAiApply,
} = p

const [moreOpen, setMoreOpen] = useState(false)
const moreRef = useRef(null)
const [tick, setTick] = useState(0)
const [swapSelected, setSwapSelected] = useState(new Set())
const [swapping, setSwapping] = useState(false)
const [showMap, setShowMap] = useState(false)
const [batchSelected, setBatchSelected] = useState(new Set())
const [batchMoving, setBatchMoving] = useState(false)
const [batchTarget, setBatchTarget] = useState('')

// Build a flat list of all stops across all active drivers for batch selection
const allStopsFlat = activeDrivers.flatMap(d => (d.stopDetails || []).map(s => ({ ...s, _driverName: d['Driver Name'], _driverNum: d['Driver #'] })))

function selectByZip(zip) {
  const ids = allStopsFlat.filter(s => (s.zip || s.ZIP || s['Zip Code'] || s['ZIP']) === zip).map(s => s.order_id || s['Order ID']).filter(Boolean)
  setBatchSelected(prev => {
    const allAlready = ids.every(id => prev.has(id))
    const next = new Set(prev)
    if (allAlready) { ids.forEach(id => next.delete(id)) } else { ids.forEach(id => next.add(id)) }
    return next
  })
}

function selectByCity(city) {
  const norm = (city || '').toUpperCase()
  const ids = allStopsFlat.filter(s => ((s.city || s.City || s['City']) || '').toUpperCase() === norm).map(s => s.order_id || s['Order ID']).filter(Boolean)
  setBatchSelected(prev => {
    const allAlready = ids.every(id => prev.has(id))
    const next = new Set(prev)
    if (allAlready) { ids.forEach(id => next.delete(id)) } else { ids.forEach(id => next.add(id)) }
    return next
  })
}

async function handleBatchMove() {
  if (!batchTarget || batchSelected.size === 0) return
  const targetDriver = activeDrivers.find(d => d['Driver Name'] === batchTarget)
  if (!targetDriver) return
  if (!confirm(`Move ${batchSelected.size} stops to ${batchTarget}?`)) return
  setBatchMoving(true)
  try {
    const dateStr = data.deliveryDateObj ? `${data.deliveryDateObj.getFullYear()}-${String(data.deliveryDateObj.getMonth()+1).padStart(2,'0')}-${String(data.deliveryDateObj.getDate()).padStart(2,'0')}` : null
    if (!dateStr) throw new Error('No delivery date')
    const targetNum = String(targetDriver['Driver #'])
    for (const oid of batchSelected) {
      await fetch('/api/db', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ table: 'daily_stops', operation: 'update', data: { driver_name: batchTarget, driver_number: targetNum, assigned_driver_number: targetNum }, match: { order_id: oid, delivery_date: dateStr } }) })
    }
    setMoveToast(`Moved ${batchSelected.size} stops to ${batchTarget}`)
    setBatchSelected(new Set())
    setBatchTarget('')
    fetchDispatchData(selectedDay)
  } catch (err) { setMoveToast(`Error: ${err.message}`) }
  finally { setBatchMoving(false) }
}

function toggleSwapSelect(driverName) {
  setSwapSelected(prev => {
    const next = new Set(prev)
    if (next.has(driverName)) next.delete(driverName)
    else if (next.size < 2) next.add(driverName)
    return next
  })
}

async function handleSwapRoutes() {
  const [nameA, nameB] = [...swapSelected]
  const driverA = activeDrivers.find(d => d['Driver Name'] === nameA)
  const driverB = activeDrivers.find(d => d['Driver Name'] === nameB)
  if (!driverA || !driverB) return
  const stopsA = driverA.stops || 0
  const stopsB = driverB.stops || 0
  if (!confirm(`Swap ${nameA} (${stopsA} stops) ↔ ${nameB} (${stopsB} stops)?`)) return
  setSwapping(true)
  try {
    const dateStr = data.deliveryDateObj ? `${data.deliveryDateObj.getFullYear()}-${String(data.deliveryDateObj.getMonth()+1).padStart(2,'0')}-${String(data.deliveryDateObj.getDate()).padStart(2,'0')}` : null
    if (!dateStr) throw new Error('No delivery date')
    const numA = String(driverA['Driver #'])
    const numB = String(driverB['Driver #'])
    // Use a temp placeholder to avoid collision
    const res = await fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: 'daily_stops', operation: 'update', data: { driver_name: '__SWAP_TEMP__', driver_number: '__TEMP__', assigned_driver_number: '__TEMP__' }, match: { driver_name: nameA, delivery_date: dateStr } })
    })
    await fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: 'daily_stops', operation: 'update', data: { driver_name: nameA, driver_number: numA, assigned_driver_number: numA }, match: { driver_name: nameB, delivery_date: dateStr } })
    })
    await fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: 'daily_stops', operation: 'update', data: { driver_name: nameB, driver_number: numB, assigned_driver_number: numB }, match: { driver_name: '__SWAP_TEMP__', delivery_date: dateStr } })
    })
    setSwapSelected(new Set())
    setMoveToast(`Swapped ${nameA} (${stopsA}) ↔ ${nameB} (${stopsB})`)
    fetchDispatchData(selectedDay)
  } catch (err) {
    setMoveToast(`Swap error: ${err.message}`)
  } finally {
    setSwapping(false)
  }
}

// Close overflow menu on outside click
useEffect(() => {
  if (!moreOpen) return
  const handler = (e) => { if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false) }
  document.addEventListener('mousedown', handler)
  return () => document.removeEventListener('mousedown', handler)
}, [moreOpen])

// Timer tick — update every minute
useEffect(() => {
  if (!sessionStartTime || sessionFinalMinutes != null) return
  const i = setInterval(() => setTick(t => t + 1), 60000)
  return () => clearInterval(i)
}, [sessionStartTime, sessionFinalMinutes])

const sessionMinutes = sessionFinalMinutes != null ? sessionFinalMinutes : (sessionStartTime ? Math.round((Date.now() - sessionStartTime) / 60000) : null)

if (loading) return (
  <div className="dispatch__loading">
    <div className="dispatch__spinner" />
    <p>Loading dispatch data from sheets...</p>
  </div>
)

if (error) return (
  <div className="dispatch__error">
    <p>{error}</p>
    <button onClick={fetchDispatchData}>Retry</button>
  </div>
)

if (!data) return null

return (
  <>
            {/* Day selector + Routing Rules */}
            <div className="dispatch__days-row">
              <div className="dispatch__days">
                <button className="dispatch__week-btn" onClick={() => setWeekOffset(w => w - 1)} title="Previous week">‹</button>
                {(data.allDays || ['Monday','Tuesday','Wednesday','Thursday','Friday']).map((day) => (
                  <button
                    key={day}
                    className={`dispatch__day ${selectedDay === day && !showRouting ? 'dispatch__day--active' : ''}`}
                    onClick={() => { setShowRouting(false); setShowSortList(false); setShowUnassigned(false); handleDayChange(day) }}
                  >
                    {day.slice(0, 3)}
                  </button>
                ))}
                <button className="dispatch__week-btn" onClick={() => setWeekOffset(w => w + 1)} title="Next week">›</button>
                {weekOffset !== 0 && (
                  <button className="dispatch__week-today" onClick={() => setWeekOffset(0)}>Today</button>
                )}
                {data.weekMonday && (
                  <span className="dispatch__week-label">
                    {data.weekMonday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {(() => {
                      const fri = new Date(data.weekMonday); fri.setDate(fri.getDate() + 4);
                      return fri.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    })()}
                  </span>
                )}
              </div>
              <div className="dispatch__zip-search">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  type="text"
                  className="dispatch__zip-input"
                  placeholder="Search by ZIP..."
                  value={zipSearch}
                  onChange={e => setZipSearch(e.target.value.replace(/[^0-9]/g, ''))}
                />
                {zipSearch && (
                  <button className="dispatch__zip-clear" onClick={() => setZipSearch('')}>&times;</button>
                )}
              </div>
              <div className="dispatch__tools-right">
                <button
                  className={`dispatch__day dispatch__day--routing ${showMap ? 'dispatch__day--routing-active' : ''}`}
                  onClick={() => { setShowMap(!showMap); setShowSortList(false); setShowRouting(false); setShowUnassigned(false) }}
                >
                  Map
                </button>
                <button
                  className={`dispatch__day dispatch__day--routing ${showSortList ? 'dispatch__day--routing-active' : ''}`}
                  onClick={() => { setShowSortList(!showSortList); setShowRouting(false); setShowUnassigned(false); setShowMap(false) }}
                >
                  Sort List
                </button>
                <button
                  className={`dispatch__day dispatch__day--routing ${showRouting ? 'dispatch__day--routing-active' : ''}`}
                  onClick={() => { setShowRouting(!showRouting); setShowSortList(false); setShowUnassigned(false); setShowMap(false) }}
                >
                  Routing Rules
                </button>
                <button
                  className={`dispatch__day dispatch__day--routing ${showUnassigned ? 'dispatch__day--routing-active' : ''}`}
                  onClick={() => { setShowUnassigned(!showUnassigned); setShowRouting(false); setShowSortList(false); setShowMap(false) }}
                >
                  Unassigned
                </button>
              </div>
            </div>


            {showMap && <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#9BA5B4' }}>Loading map...</div>}><DispatchMap drivers={data.drivers} selectedDay={selectedDay} deliveryDate={data.deliveryDateObj} fetchDispatchData={fetchDispatchData} /></Suspense>}
            {showSortList && <SortList deliveryDate={data.deliveryDateObj ? `${data.deliveryDateObj.getFullYear()}-${String(data.deliveryDateObj.getMonth()+1).padStart(2,'0')}-${String(data.deliveryDateObj.getDate()).padStart(2,'0')}` : null} />}
            {showRouting && <RoutingEditor />}
            {showUnassigned && <UnassignedZips />}

            {!showRouting && !showSortList && !showUnassigned && !showMap && <>
            {/* Header row */}
            <div className="dispatch__top">
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div>
                  <h1 className="dispatch__heading">
                    {data.deliveryDay} Delivery
                  </h1>
                  <p className="dispatch__date">
                    {(data.deliveryDateObj || new Date()).toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>
                {(sessionMinutes != null || sessionCorrections > 0) && (
                  <div className="dispatch__session-stats">
                    {sessionMinutes != null && <span className="dispatch__session-pill"><span className="dispatch__session-label">SESSION TIME:</span> {sessionMinutes} min{sessionFinalMinutes != null ? ' ✓' : ''}</span>}
                    {sessionCorrections > 0 && <span className="dispatch__session-pill"><span className="dispatch__session-label">SESSION CORRECTIONS:</span> {sessionCorrections}</span>}
                  </div>
                )}
              </div>
              <div className="dispatch__actions">
                {swapSelected.size === 2 && (
                  <button
                    className="dispatch__send-btn"
                    style={{ background: '#7c3aed' }}
                    onClick={handleSwapRoutes}
                    disabled={swapping}
                  >
                    {swapping ? 'Swapping...' : `Swap ↔`}
                  </button>
                )}
                {swapSelected.size > 0 && swapSelected.size < 2 && (
                  <span style={{ fontSize: 12, color: '#7c3aed', fontWeight: 600 }}>Select 1 more to swap</span>
                )}
                {moveToast && (
                  <div className={`dispatch__move-toast ${moveToast.startsWith('Undo error') ? 'dispatch__move-toast--err' : ''}`}>
                    <span>{moveToast}</span>
                    {lastMove && !undoing && (
                      <button className="dispatch__undo-btn" onClick={handleUndo}>Undo</button>
                    )}
                    {!lastMove && (
                      <button className="dispatch__toast-close" onClick={() => setMoveToast(null)}>✕</button>
                    )}
                  </div>
                )}
                {(data.unassigned?.length > 0) && (
                  <button
                    className="dispatch__alert-btn"
                    onClick={() => { setShowUnassigned(true); setShowRouting(false); setShowSortList(false) }}
                    title={`${data.unassigned.length} unassigned orders`}
                  >
                    <span className="dispatch__alert-flag">&#9873;</span>
                    <span className="dispatch__alert-count">{data.unassigned.length}</span>
                  </button>
                )}
                <button
                  className="dispatch__send-btn dispatch__send-btn--corrections"
                  onClick={handlePreviewAndReview}
                  disabled={totalStops === 0}
                >
                  Preview & Review
                </button>
                <button
                  className={`dispatch__send-btn ${routesSent ? 'dispatch__send-btn--done' : ''}`}
                  onClick={handleSendRoutes}
                  disabled={sendingRoutes || totalStops === 0}
                >
                  {sendingRoutes ? 'Sending...' : routesSent ? 'Sent' : 'Send Routes'}
                </button>
                {sentSnapshot && (
                  <button
                    className="dispatch__send-btn dispatch__send-btn--resend"
                    onClick={handleResendChanges}
                    disabled={resending}
                  >
                    {resending ? 'Sending...' : 'Resend Changes'}
                  </button>
                )}
                <div className="dispatch__more-wrap" ref={moreRef}>
                  <button
                    className="dispatch__send-btn dispatch__send-btn--more"
                    onClick={() => setMoreOpen(!moreOpen)}
                    title="More send options"
                  >
                    &bull;&bull;&bull;
                  </button>
                  {moreOpen && (
                    <div className="dispatch__more-menu">
                      <button
                        className="dispatch__more-item"
                        onClick={() => { setMoreOpen(false); handlePreviewCorrections(true) }}
                        disabled={sendingResendCorrections || totalStops === 0}
                      >
                        {sendingResendCorrections ? 'Sending...' : 'Preview Resend All'}
                        <span className="dispatch__more-desc">All reassigned stops, ignores sent tracking</span>
                      </button>
                      <button
                        className="dispatch__more-item"
                        onClick={async () => { setMoreOpen(false); await handleForceSendAll() }}
                        disabled={sendingForceAll || totalStops === 0}
                      >
                        {sendingForceAll ? 'Sending...' : forceAllSent ? 'Force Sent' : 'Force Send All'}
                        <span className="dispatch__more-desc">Full order list for selected drivers to WFL</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Warnings */}
            {data.warnings?.filter((w) => !dismissedWarnings.has(w.type)).map((w, i) => (
              <WarningBanner key={i} warning={w} onDismiss={() => {
                setDismissedWarnings(prev => new Set([...prev, w.type]))
              }} />
            ))}


            {/* Summary cards */}
            <DispatchSummary
              totalStops={totalStops}
              totalColdChain={totalColdChain}
              activeDriverCount={allActiveDrivers.length}
              totalDriverCount={(data.drivers?.filter(d => d['Driver Name'] !== 'Demo Driver' && String(d['Driver #']) !== '99999') ?? []).length}
              unassignedCount={data.unassigned?.length ?? 0}
            />

            {/* Combined Preview & Review */}
            {combinedPreview && (
              <div className="dispatch__callin-preview">
                <div className="dispatch__callin-header">
                  <h3>Preview & Review</h3>
                  <div className="dispatch__callin-actions">
                    <button className="dispatch__callin-cancel" onClick={() => setCombinedPreview(null)}>Close</button>
                  </div>
                </div>

                {/* Section 1: Corrections */}
                {Object.keys(combinedPreview.corrections).length > 0 ? (
                  <div style={{ marginBottom: 24 }}>
                    <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 8, color: '#0B1E3D' }}>
                      Corrections — {Object.keys(combinedPreview.corrections).length} driver{Object.keys(combinedPreview.corrections).length !== 1 ? 's' : ''}, {Object.values(combinedPreview.corrections).reduce((n, c) => n + c.orderIds.length, 0)} orders
                    </h4>
                    {combinedPreview.alreadySent > 0 && (
                      <div style={{ fontSize: '0.78rem', color: '#6B7280', marginBottom: 6 }}>{combinedPreview.alreadySent} already sent (skipped)</div>
                    )}
                    <div className="dispatch__callin-table-wrap">
                      <table className="dispatch__callin-table">
                        <thead><tr><th>Driver</th><th>Driver #</th><th>Orders</th><th>Order IDs</th></tr></thead>
                        <tbody>
                          {Object.entries(combinedPreview.corrections).map(([driverId, { name, orderIds }]) => (
                            <tr key={driverId}>
                              <td style={{ fontWeight: 600 }}>{name}</td>
                              <td>{driverId}</td>
                              <td>{orderIds.length}</td>
                              <td style={{ fontSize: '0.75rem', maxWidth: 300, wordBreak: 'break-all' }}>{orderIds.join(', ')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginBottom: 24, fontSize: '0.82rem', color: '#6B7280' }}>No corrections needed — all assignments match.</div>
                )}

                {/* Section 2: Call-In Orders (SICI) */}
                {combinedPreview.callIns.length > 0 ? (
                  <div style={{ marginBottom: 24 }}>
                    <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 8, color: '#0B1E3D' }}>
                      Call-In Orders (SICI) — {combinedPreview.callIns.length} order{combinedPreview.callIns.length !== 1 ? 's' : ''}
                    </h4>
                    <div className="dispatch__callin-table-wrap">
                      <table className="dispatch__callin-table">
                        <thead><tr><th>Order #</th><th>Patient Name</th><th>Address</th><th>City</th><th>ZIP</th></tr></thead>
                        <tbody>
                          {combinedPreview.callIns.map((r, i) => (
                            <tr key={i}><td>{r.orderId}</td><td>{r.name}</td><td>{r.address}</td><td>{r.city}</td><td>{r.zip}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginBottom: 24, fontSize: '0.82rem', color: '#6B7280' }}>No call-in orders for today.</div>
                )}

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {Object.keys(combinedPreview.corrections).length > 0 && (
                    <button className="dispatch__callin-confirm" disabled={sendingCorrections} onClick={async () => {
                      const corr = combinedPreview.corrections
                      setCombinedPreview(null)
                      await handleSendCorrections(true, corr)
                    }}>
                      {sendingCorrections ? 'Sending...' : 'Send Corrections Only'}
                    </button>
                  )}
                  {combinedPreview.callIns.length > 0 && (
                    <button className="dispatch__callin-confirm" disabled={sendingCallIns} onClick={async () => {
                      const ci = combinedPreview.callIns
                      setCombinedPreview(null)
                      await handleConfirmCallIns(ci)
                    }}>
                      {sendingCallIns ? 'Sending...' : 'Send SICI Only'}
                    </button>
                  )}
                  {(Object.keys(combinedPreview.corrections).length > 0 || combinedPreview.callIns.length > 0) && (
                    <button className="dispatch__callin-confirm" style={{ background: '#0A2463' }} disabled={sendingCorrections || sendingCallIns} onClick={async () => {
                      const corr = Object.keys(combinedPreview.corrections).length > 0 ? combinedPreview.corrections : null
                      const ci = combinedPreview.callIns.length > 0 ? combinedPreview.callIns : null
                      setCombinedPreview(null)
                      const tasks = []
                      if (corr) tasks.push(handleSendCorrections(true, corr))
                      if (ci) tasks.push(handleConfirmCallIns(ci))
                      await Promise.all(tasks)
                    }}>
                      {sendingCorrections || sendingCallIns ? 'Sending...' : Object.keys(combinedPreview.corrections).length > 0 && combinedPreview.callIns.length > 0 ? 'Send Both' : 'Send All'}
                    </button>
                  )}
                </div>
              </div>
            )}


            {/* Resend All Preview */}
            {resendAllPreview && (
              <div className="dispatch__callin-preview">
                <div className="dispatch__callin-header">
                  <h3>Preview Resend All</h3>
                  <div className="dispatch__callin-actions">
                    <button className="dispatch__callin-cancel" onClick={() => setResendAllPreview(null)}>Close</button>
                  </div>
                </div>
                <p style={{ fontSize: '0.82rem', color: '#6B7280', marginBottom: 12 }}>
                  All reassigned stops (ignores already-sent tracking). {Object.keys(resendAllPreview.corrections).length} driver{Object.keys(resendAllPreview.corrections).length !== 1 ? 's' : ''}, {Object.values(resendAllPreview.corrections).reduce((n, c) => n + c.orderIds.length, 0)} orders.
                </p>
                <div className="dispatch__callin-table-wrap">
                  <table className="dispatch__callin-table">
                    <thead><tr><th>Driver</th><th>Driver #</th><th>Orders</th><th>Order IDs</th></tr></thead>
                    <tbody>
                      {Object.entries(resendAllPreview.corrections).map(([driverId, { name, orderIds }]) => (
                        <tr key={driverId}>
                          <td style={{ fontWeight: 600 }}>{name}</td>
                          <td>{driverId}</td>
                          <td>{orderIds.length}</td>
                          <td style={{ fontSize: '0.75rem', maxWidth: 300, wordBreak: 'break-all' }}>{orderIds.join(', ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="dispatch__callin-confirm" disabled={sendingResendCorrections} onClick={() => handleConfirmResendAll()}>
                    {sendingResendCorrections ? 'Sending...' : 'Confirm & Send to BioTouch'}
                  </button>
                </div>
              </div>
            )}

            {/* Force Send Driver Selection */}
            {forceDriverSelection && (
              <div className="dispatch__callin-preview">
                <div className="dispatch__callin-header">
                  <h3>Force Send All — Select Drivers</h3>
                  <div className="dispatch__callin-actions">
                    <button className="dispatch__callin-cancel" onClick={() => setForceDriverSelection(null)}>Close</button>
                  </div>
                </div>
                <p style={{ fontSize: '0.82rem', color: '#6B7280', marginBottom: 12 }}>
                  Select which drivers to force-send full order lists to BioTouch. {Object.values(forceDriverSelection.byDriver).reduce((n, d) => n + d.orderIds.length, 0)} total orders.
                </p>
                <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
                  <button className="dispatch__send-btn dispatch__send-btn--corrections" style={{ padding: '4px 12px', fontSize: '12px' }}
                    onClick={() => setForceDriverSelection(prev => {
                      const sel = { ...prev.selected }
                      Object.keys(prev.byDriver).forEach(id => { sel[id] = true })
                      return { ...prev, selected: sel }
                    })}
                  >Select All</button>
                  <button className="dispatch__send-btn dispatch__send-btn--corrections" style={{ padding: '4px 12px', fontSize: '12px' }}
                    onClick={() => setForceDriverSelection(prev => {
                      const sel = { ...prev.selected }
                      Object.keys(prev.byDriver).forEach(id => { sel[id] = false })
                      return { ...prev, selected: sel }
                    })}
                  >Deselect All</button>
                </div>
                <div className="dispatch__callin-table-wrap">
                  <table className="dispatch__callin-table">
                    <thead><tr><th style={{ width: 40 }}></th><th>Driver</th><th>Driver #</th><th>Orders</th></tr></thead>
                    <tbody>
                      {Object.entries(forceDriverSelection.byDriver).map(([driverId, { name, orderIds }]) => (
                        <tr key={driverId} style={{ opacity: forceDriverSelection.selected[driverId] ? 1 : 0.5 }}>
                          <td>
                            <input type="checkbox" checked={!!forceDriverSelection.selected[driverId]}
                              onChange={() => setForceDriverSelection(prev => ({
                                ...prev, selected: { ...prev.selected, [driverId]: !prev.selected[driverId] }
                              }))}
                            />
                          </td>
                          <td style={{ fontWeight: 600 }}>{name}</td>
                          <td>{driverId}</td>
                          <td>{orderIds.length}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="dispatch__callin-confirm" disabled={sendingForceAll || Object.values(forceDriverSelection.selected).every(v => !v)} onClick={() => handleForceSendSelected()}>
                    {sendingForceAll ? 'Sending...' : `Force Send ${Object.values(forceDriverSelection.selected).filter(Boolean).length} Drivers`}
                  </button>
                </div>
              </div>
            )}

            {/* Active drivers grouped by pharmacy + PM section */}
            {(() => {
              const pharmacySections = {}
              const pmDrivers = []
              const pmNames = new Set()
              for (const driver of activeDrivers) {
                const shift = driver.shift || 'AM'
                const isPM = shift === 'PM'
                const isAP = shift === 'A+P'
                // PM-only drivers go to PM section (even with 0 stops)
                if (isPM) { pmDrivers.push(driver); pmNames.add(driver['Driver Name']); continue }
                // A+P drivers go to pharmacy sections AND PM section
                if (isAP) { pmDrivers.push(driver); pmNames.add(driver['Driver Name']) }
                // Skip 0-stop drivers from pharmacy sections
                if ((driver.stops || 0) === 0) continue
                const pharmas = new Set()
                for (const s of (driver.stopDetails || [])) {
                  const p = s.Pharmacy || s.pharmacy || ''
                  if (p) pharmas.add(p)
                }
                if (pharmas.size === 0) pharmas.add(driver['Pharmacy'] || driver.pharmacy || 'Other')
                for (const p of pharmas) {
                  if (!pharmacySections[p]) pharmacySections[p] = []
                  pharmacySections[p].push(driver)
                }
              }
              const PHARMA_ORDER = { 'Aultman': 0, 'SHSP': 1 }
              const sectionOrder = Object.keys(pharmacySections).sort((a, b) => {
                const oa = PHARMA_ORDER[a] ?? 99
                const ob = PHARMA_ORDER[b] ?? 99
                return oa - ob
              })
              return (<>
                {sectionOrder.map(pharmaName => (
                  <section className="dispatch__section" key={pharmaName}>
                    <h2 className="dispatch__section-title">
                      {pharmaName}
                      <span className="dispatch__section-count">{pharmacySections[pharmaName].length}</span>
                    </h2>
                    <div className="dispatch__drivers">
                      {pharmacySections[pharmaName]
                        .sort((a, b) => (b.stops || 0) - (a.stops || 0))
                        .map((driver) => (
                          <DriverCard
                            key={`${pharmaName}-${driver['Driver Name']}`}
                            driver={driver}
                            allDrivers={data.drivers}
                            selectedDay={selectedDay}
                            deliveryDate={data.deliveryDateObj}
                            onRefresh={() => fetchDispatchData(selectedDay)}
                            onMoveComplete={handleMoveComplete}
                            swapSelected={swapSelected}
                            onSwapToggle={toggleSwapSelect}
                            batchSelected={batchSelected}
                            onSelectByZip={selectByZip}
                            onSelectByCity={selectByCity}
                          />
                        ))}
                    </div>
                  </section>
                ))}
                {pmDrivers.length > 0 && (
                  <section className="dispatch__section" key="PM">
                    <h2 className="dispatch__section-title">
                      PM
                      <span className="dispatch__section-count" style={{ background: '#EF4444' }}>{pmDrivers.length}</span>
                    </h2>
                    <div className="dispatch__drivers">
                      {pmDrivers
                        .sort((a, b) => (b.stops || 0) - (a.stops || 0))
                        .map((driver) => (
                          <DriverCard
                            key={`PM-${driver['Driver Name']}`}
                            driver={driver}
                            allDrivers={data.drivers}
                            selectedDay={selectedDay}
                            deliveryDate={data.deliveryDateObj}
                            onRefresh={() => fetchDispatchData(selectedDay)}
                            onMoveComplete={handleMoveComplete}
                            swapSelected={swapSelected}
                            onSwapToggle={toggleSwapSelect}
                            batchSelected={batchSelected}
                            onSelectByZip={selectByZip}
                            onSelectByCity={selectByCity}
                          />
                        ))}
                    </div>
                  </section>
                )}
              </>)
            })()}

            {/* No stops today — compact line (excludes PM drivers) */}
            {(() => {
              const pmShifts = new Set(['PM', 'A+P'])
              const zeroStopActive = activeDrivers.filter(d => (d.stops || 0) === 0 && !pmShifts.has(d.shift || 'AM'))
              const allNoStops = [...inactiveDrivers, ...zeroStopActive]
              if (allNoStops.length === 0) return null
              return (
                <section className="dispatch__section">
                  <div className="dispatch__inactive-line">
                    <span className="dispatch__inactive-label">NO STOPS TODAY ({allNoStops.length})</span>
                    <span className="dispatch__inactive-list">
                      {allNoStops.map(d => `${(d['Driver Name'] || '').split(' ')[0]} #${d['Driver #'] || '?'}`).join(' · ')}
                    </span>
                  </div>
                </section>
              )
            })()}


            {/* Recent dispatch log — removed, accessible via analytics */}
            {false && data.recentLogs?.length > 0 && (
              <RecentLog logs={data.recentLogs} />
            )}
            </>}

      {/* Batch selection action bar */}
      {batchSelected.size > 0 && (
        <div className="dispatch__batch-bar">
          <span className="dispatch__batch-count">{batchSelected.size} stop{batchSelected.size !== 1 ? 's' : ''} selected</span>
          <select className="dispatch__batch-select" value={batchTarget} onChange={e => setBatchTarget(e.target.value)}>
            <option value="">Move to...</option>
            {activeDrivers.filter(d => (d.stops || 0) > 0 || d.shift).map(d => (
              <option key={d['Driver Name']} value={d['Driver Name']}>{d['Driver Name']}</option>
            ))}
          </select>
          <button className="dispatch__batch-btn" onClick={handleBatchMove} disabled={!batchTarget || batchMoving}>
            {batchMoving ? 'Moving...' : 'Move'}
          </button>
          <button className="dispatch__batch-clear" onClick={() => setBatchSelected(new Set())}>Clear</button>
        </div>
      )}

  </>
  )
}
