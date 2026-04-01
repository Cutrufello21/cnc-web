import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { dbUpdate } from '../lib/db'
import './MobileDispatch.css'

const TABS = ['Overview', 'Drivers', 'Move', 'Sort', 'Send']
const TAB_ICONS = {
  Overview: '⊞',
  Drivers: '👤',
  Move: '↗',
  Sort: '☰',
  Send: '✉',
}

function today() {
  return new Date().toLocaleDateString('en-CA') // YYYY-MM-DD
}

export default function MobileDispatch() {
  const [tab, setTab] = useState('Overview')
  const [stops, setStops] = useState([])
  const [timeOff, setTimeOff] = useState([])
  const [loading, setLoading] = useState(true)
  const intervalRef = useRef(null)

  // ─── Driver detail state (Drivers tab) ───
  const [selectedDriver, setSelectedDriver] = useState(null)

  // ─── Move state ───
  const [moveStep, setMoveStep] = useState(1)
  const [moveFrom, setMoveFrom] = useState(null)
  const [moveStop, setMoveStop] = useState(null)
  const [moveTo, setMoveTo] = useState(null)
  const [moveLoading, setMoveLoading] = useState(false)
  const [moveDone, setMoveDone] = useState(false)

  // ─── Send state ───
  const [sendDriver, setSendDriver] = useState('')
  const [sendLoading, setSendLoading] = useState(false)
  const [sendMsg, setSendMsg] = useState(null)

  // ─── Sort state ───
  const [sortPharmacy, setSortPharmacy] = useState(null)

  const fetchData = useCallback(async () => {
    const dateStr = today()
    const [stopsRes, offRes] = await Promise.all([
      supabase.from('daily_stops').select('*').eq('delivery_date', dateStr),
      supabase.from('time_off_requests').select('*').eq('date_off', dateStr).eq('status', 'approved'),
    ])
    setStops(stopsRes.data || [])
    setTimeOff(offRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Auto-refresh on Overview & Drivers
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (tab === 'Overview' || tab === 'Drivers') {
      intervalRef.current = setInterval(fetchData, 30000)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [tab, fetchData])

  // ─── Derived data ───
  const byDriver = {}
  stops.forEach(s => {
    const name = s.driver_name || 'Unassigned'
    if (!byDriver[name]) byDriver[name] = []
    byDriver[name].push(s)
  })

  const driverNames = Object.keys(byDriver).filter(n => n !== 'Unassigned').sort()

  const totalStops = stops.length
  const deliveredStops = stops.filter(s => s.status === 'delivered').length
  const progressPct = totalStops ? Math.round((deliveredStops / totalStops) * 100) : 0

  const byPharmacy = {}
  stops.forEach(s => {
    const ph = s.pharmacy || 'Other'
    if (!byPharmacy[ph]) byPharmacy[ph] = { total: 0, delivered: 0 }
    byPharmacy[ph].total++
    if (s.status === 'delivered') byPharmacy[ph].delivered++
  })

  const pharmacyNames = Object.keys(byPharmacy).sort()
  if (sortPharmacy === null && pharmacyNames.length) setSortPharmacy(pharmacyNames[0])

  function driverStatus(name) {
    const ds = byDriver[name] || []
    if (!ds.length) return 'none'
    const del = ds.filter(s => s.status === 'delivered').length
    if (del === 0) return 'not-started'
    if (del === ds.length) return 'complete'
    return 'in-progress'
  }

  function dotColor(status) {
    if (status === 'complete') return '#22c55e'
    if (status === 'in-progress') return '#BFFF00'
    return '#9ca3af'
  }

  // ─── Move handlers ───
  function resetMove() {
    setMoveStep(1); setMoveFrom(null); setMoveStop(null); setMoveTo(null); setMoveDone(false)
  }

  async function confirmMove() {
    if (!moveStop || !moveTo) return
    setMoveLoading(true)
    try {
      await dbUpdate('daily_stops', { driver_name: moveTo }, { id: moveStop.id })
      setMoveDone(true)
      await fetchData()
    } catch (err) {
      alert('Move failed: ' + err.message)
    }
    setMoveLoading(false)
  }

  // ─── Send handlers ───
  async function handleSendRoute() {
    if (!sendDriver) return
    setSendLoading(true); setSendMsg(null)
    try {
      const res = await fetch('/api/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'email_route', driver_name: sendDriver, date: today() }),
      })
      const json = await res.json()
      setSendMsg(json.success ? `Route sent to ${sendDriver}` : `Error: ${json.error}`)
    } catch (err) { setSendMsg('Failed: ' + err.message) }
    setSendLoading(false)
  }

  async function handleSendAll() {
    setSendLoading(true); setSendMsg(null)
    try {
      const res = await fetch('/api/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'email_all_routes', date: today() }),
      })
      const json = await res.json()
      setSendMsg(json.success ? `All routes sent (${json.sent} drivers)` : `Error: ${json.error}`)
    } catch (err) { setSendMsg('Failed: ' + err.message) }
    setSendLoading(false)
  }

  if (loading) {
    return (
      <div className="mob">
        <div className="mob__loading">Loading…</div>
      </div>
    )
  }

  return (
    <div className="mob">
      <header className="mob__header">
        <span className="mob__logo">CNC</span>
        <span className="mob__title">Mobile Dispatch</span>
        <span className="mob__date">{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
      </header>

      <main className="mob__body">
        {/* ═══ OVERVIEW ═══ */}
        {tab === 'Overview' && (
          <div className="mob__section">
            {/* KPIs */}
            <div className="mob__kpi-row">
              <div className="mob__kpi">
                <div className="mob__kpi-val">{deliveredStops}</div>
                <div className="mob__kpi-label">Delivered</div>
              </div>
              <div className="mob__kpi">
                <div className="mob__kpi-val">{progressPct}%</div>
                <div className="mob__kpi-label">Progress</div>
              </div>
            </div>

            {/* Global progress */}
            <div className="mob__progress-wrap">
              <div className="mob__progress-bar">
                <div className="mob__progress-fill" style={{ width: `${progressPct}%` }} />
              </div>
              <span className="mob__progress-text">{deliveredStops}/{totalStops}</span>
            </div>

            {/* Pharmacy breakdown */}
            <h3 className="mob__heading">Pharmacies</h3>
            <div className="mob__pharm-row">
              {pharmacyNames.map(ph => (
                <div className="mob__pharm-card" key={ph}>
                  <div className="mob__pharm-name">{ph}</div>
                  <div className="mob__pharm-nums">{byPharmacy[ph].delivered}/{byPharmacy[ph].total}</div>
                </div>
              ))}
            </div>

            {/* Driver list */}
            <h3 className="mob__heading">Drivers</h3>
            {driverNames.map(name => {
              const st = driverStatus(name)
              const ds = byDriver[name]
              const del = ds.filter(s => s.status === 'delivered').length
              return (
                <div className="mob__driver-row" key={name} onClick={() => { setSelectedDriver(name); setTab('Drivers') }}>
                  <span className="mob__dot" style={{ background: dotColor(st) }} />
                  <span className="mob__driver-name">{name}</span>
                  <span className="mob__driver-count">{del}/{ds.length}</span>
                </div>
              )
            })}
          </div>
        )}

        {/* ═══ DRIVERS ═══ */}
        {tab === 'Drivers' && !selectedDriver && (
          <div className="mob__section">
            {/* Time-off banner */}
            {timeOff.length > 0 && (
              <div className="mob__banner mob__banner--amber">
                Off today: {[...new Set(timeOff.map(t => t.driver_name))].join(', ')}
              </div>
            )}

            {/* Group: In Progress → Not Started → Complete */}
            {['in-progress', 'not-started', 'complete'].map(status => {
              const label = status === 'in-progress' ? 'In Progress' : status === 'not-started' ? 'Not Started' : 'Complete'
              const drivers = driverNames.filter(n => driverStatus(n) === status)
              if (!drivers.length) return null
              return (
                <div key={status}>
                  <h3 className="mob__heading">{label}</h3>
                  {drivers.map(name => {
                    const ds = byDriver[name]
                    const del = ds.filter(s => s.status === 'delivered').length
                    return (
                      <div className="mob__driver-row" key={name} onClick={() => setSelectedDriver(name)}>
                        <span className="mob__dot" style={{ background: dotColor(status) }} />
                        <span className="mob__driver-name">{name}</span>
                        <span className="mob__driver-count">{del}/{ds.length}</span>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}

        {/* ═══ DRIVER DETAIL ═══ */}
        {tab === 'Drivers' && selectedDriver && (
          <div className="mob__section">
            <button className="mob__back" onClick={() => setSelectedDriver(null)}>← Back</button>
            <h3 className="mob__heading">{selectedDriver}</h3>
            {(byDriver[selectedDriver] || [])
              .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
              .map(s => (
                <div className="mob__stop-card" key={s.id}>
                  <div className="mob__stop-top">
                    <span className="mob__stop-order">#{s.sort_order ?? '—'}</span>
                    <span className={`mob__pill mob__pill--${s.status === 'delivered' ? 'done' : 'pending'}`}>
                      {s.status || 'dispatched'}
                    </span>
                  </div>
                  <div className="mob__stop-name">{s.patient_name}</div>
                  <div className="mob__stop-addr">{s.address}</div>
                </div>
              ))}
          </div>
        )}

        {/* ═══ MOVE ═══ */}
        {tab === 'Move' && (
          <div className="mob__section">
            {moveDone ? (
              <div className="mob__success">
                <div className="mob__success-icon">✓</div>
                <p>Moved <strong>{moveStop?.patient_name}</strong> to <strong>{moveTo}</strong></p>
                <button className="mob__btn" onClick={resetMove}>Move Another</button>
              </div>
            ) : (
              <>
                {/* Step 1: Pick source driver */}
                {moveStep === 1 && (
                  <>
                    <h3 className="mob__heading">Pull from which driver?</h3>
                    {driverNames.filter(n => (byDriver[n] || []).some(s => s.status !== 'delivered')).map(name => (
                      <div className="mob__driver-row" key={name} onClick={() => { setMoveFrom(name); setMoveStep(2) }}>
                        <span className="mob__driver-name">{name}</span>
                        <span className="mob__driver-count">{(byDriver[name] || []).filter(s => s.status !== 'delivered').length} pending</span>
                      </div>
                    ))}
                  </>
                )}

                {/* Step 2: Pick stop */}
                {moveStep === 2 && (
                  <>
                    <button className="mob__back" onClick={() => setMoveStep(1)}>← Back</button>
                    <h3 className="mob__heading">Which stop from {moveFrom}?</h3>
                    {(byDriver[moveFrom] || []).filter(s => s.status !== 'delivered')
                      .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
                      .map(s => (
                        <div className="mob__stop-card mob__stop-card--pick" key={s.id} onClick={() => { setMoveStop(s); setMoveStep(3) }}>
                          <div className="mob__stop-name">{s.patient_name}</div>
                          <div className="mob__stop-addr">{s.address}</div>
                        </div>
                      ))}
                  </>
                )}

                {/* Step 3: Pick destination driver */}
                {moveStep === 3 && (
                  <>
                    <button className="mob__back" onClick={() => setMoveStep(2)}>← Back</button>
                    <h3 className="mob__heading">Move to which driver?</h3>
                    {driverNames.filter(n => n !== moveFrom).map(name => (
                      <div className="mob__driver-row" key={name} onClick={() => { setMoveTo(name); }}>
                        <span className="mob__driver-name">{name}</span>
                        <span className="mob__driver-count">{(byDriver[name] || []).length} stops</span>
                      </div>
                    ))}
                    {moveTo && (
                      <div className="mob__confirm-bar">
                        <p>Move <strong>{moveStop?.patient_name}</strong> → <strong>{moveTo}</strong>?</p>
                        <button className="mob__btn" onClick={confirmMove} disabled={moveLoading}>
                          {moveLoading ? 'Moving…' : 'Confirm'}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* ═══ SORT ═══ */}
        {tab === 'Sort' && (
          <div className="mob__section">
            {pharmacyNames.length > 1 && (
              <div className="mob__pill-tabs">
                {pharmacyNames.map(ph => (
                  <button
                    key={ph}
                    className={`mob__pill-tab ${sortPharmacy === ph ? 'mob__pill-tab--active' : ''}`}
                    onClick={() => setSortPharmacy(ph)}
                  >{ph}</button>
                ))}
              </div>
            )}

            {driverNames.map(name => {
              const driverStops = (byDriver[name] || []).filter(s => (s.pharmacy || 'Other') === sortPharmacy)
              if (!driverStops.length) return null
              return (
                <div key={name} className="mob__sort-group">
                  <h4 className="mob__sort-driver">{name}</h4>
                  {driverStops
                    .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
                    .map(s => (
                      <div className={`mob__sort-row ${s.status === 'delivered' ? 'mob__sort-row--done' : ''}`} key={s.id}>
                        <span className="mob__sort-order">#{s.sort_order ?? '—'}</span>
                        <span className="mob__sort-name">{s.patient_name}</span>
                        <span className="mob__sort-addr">{s.address}</span>
                      </div>
                    ))}
                </div>
              )
            })}
          </div>
        )}

        {/* ═══ SEND ═══ */}
        {tab === 'Send' && (
          <div className="mob__section">
            <h3 className="mob__heading">Send Routes</h3>

            <label className="mob__label">Driver</label>
            <select className="mob__select" value={sendDriver} onChange={e => setSendDriver(e.target.value)}>
              <option value="">Select a driver…</option>
              {driverNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>

            <button className="mob__btn mob__btn--full" onClick={handleSendRoute} disabled={!sendDriver || sendLoading}>
              {sendLoading ? 'Sending…' : 'Send Route'}
            </button>

            <div className="mob__divider" />

            <button className="mob__btn mob__btn--outline mob__btn--full" onClick={handleSendAll} disabled={sendLoading}>
              {sendLoading ? 'Sending…' : 'Send All Routes'}
            </button>

            {sendMsg && <div className="mob__send-msg">{sendMsg}</div>}
          </div>
        )}
      </main>

      {/* ─── Bottom tab bar ─── */}
      <nav className="mob__tabs">
        {TABS.map(t => (
          <button
            key={t}
            className={`mob__tab ${tab === t ? 'mob__tab--active' : ''}`}
            onClick={() => {
              setTab(t)
              if (t !== 'Drivers') setSelectedDriver(null)
              if (t !== 'Move') resetMove()
              if (t !== 'Send') { setSendMsg(null); setSendDriver('') }
            }}
          >
            <span className="mob__tab-icon">{TAB_ICONS[t]}</span>
            <span className="mob__tab-label">{t}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
