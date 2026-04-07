import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import DispatchV2Shell from '../../components/dispatch-v2/DispatchV2Shell'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

function getDefaultDate() {
  const offset = parseInt(localStorage.getItem('dv2-date-offset') || '1', 10)
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toLocaleDateString('en-CA')
}

function parseDateSafe(dateStr) {
  return new Date(dateStr + 'T12:00:00')
}

function formatDateDisplay(dateStr) {
  const d = parseDateSafe(dateStr)
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

function getWeekDates(dateStr) {
  const d = parseDateSafe(dateStr)
  const dayOfWeek = d.getDay()
  // Monday = 1, so offset from Monday
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = new Date(d)
  monday.setDate(d.getDate() + mondayOffset)

  const dates = []
  for (let i = 0; i < 5; i++) {
    const day = new Date(monday)
    day.setDate(monday.getDate() + i)
    dates.push(day.toLocaleDateString('en-CA'))
  }
  return dates
}

function groupByDriver(stops) {
  const map = {}
  for (const s of stops) {
    const name = s.driver_name || 'Unassigned'
    if (!map[name]) map[name] = []
    map[name].push(s)
  }
  return map
}

export default function DispatchV2Routes() {
  const [selectedDate, setSelectedDate] = useState(getDefaultDate)
  const [allStops, setAllStops] = useState([])
  const [loading, setLoading] = useState(true)
  const [driverFilter, setDriverFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedStops, setSelectedStops] = useState(new Set())
  const [expandedDrivers, setExpandedDrivers] = useState(new Set())
  const [optimizing, setOptimizing] = useState(new Set())
  const [showSendModal, setShowSendModal] = useState(false)
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState('')
  const [moveTarget, setMoveTarget] = useState('')
  const [showMoveDropdown, setShowMoveDropdown] = useState(false)

  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate])
  const grouped = useMemo(() => groupByDriver(allStops), [allStops])
  const driverNames = useMemo(() => Object.keys(grouped).sort(), [grouped])

  const loadStops = useCallback(async (date) => {
    setLoading(true)
    const { data } = await supabase
      .from('daily_stops')
      .select('*')
      .eq('delivery_date', date)
      .order('sort_order', { ascending: true })
    setAllStops(data || [])
    setSelectedStops(new Set())
    setLoading(false)
  }, [])

  useEffect(() => {
    loadStops(selectedDate)
  }, [selectedDate, loadStops])

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  function shiftDate(delta) {
    const d = parseDateSafe(selectedDate)
    d.setDate(d.getDate() + delta)
    setSelectedDate(d.toLocaleDateString('en-CA'))
  }

  function goToday() {
    setSelectedDate(new Date().toLocaleDateString('en-CA'))
  }

  // Driver card stats
  function getDriverStats(driverStops) {
    const uniqueAddresses = new Set(driverStops.map(s => s.address))
    const coldCount = driverStops.filter(s => s.cold_chain).length
    const hasOrder = driverStops.some(s => s.sort_order !== null && s.sort_order !== undefined)
    return {
      stopCount: uniqueAddresses.size,
      packageCount: driverStops.length,
      coldCount,
      status: hasOrder ? 'Optimized' : 'Not Sent',
    }
  }

  async function handleOptimize(driverName) {
    const driverStops = grouped[driverName]
    if (!driverStops || driverStops.length === 0) return

    setOptimizing(prev => new Set(prev).add(driverName))
    try {
      const res = await fetch('/api/optimize-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stops: driverStops.map(s => ({
            address: s.address,
            city: s.city,
            zip: s.zip,
            coldChain: s.cold_chain,
          })),
          pharmacy: driverStops[0]?.pharmacy || 'SHSP',
          driverName: driverName,
        }),
      })
      const result = await res.json()
      if (result.optimizedOrder) {
        for (let i = 0; i < result.optimizedOrder.length; i++) {
          const stop = driverStops[result.optimizedOrder[i]]
          if (stop) {
            await fetch('/api/db', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                table: 'daily_stops',
                operation: 'update',
                data: { sort_order: i },
                match: { id: stop.id },
              }),
            })
          }
        }
        await loadStops(selectedDate)
        showToast(`Route optimized for ${driverName}`)
      }
    } catch (err) {
      console.error('Optimize failed:', err)
      showToast('Optimization failed')
    } finally {
      setOptimizing(prev => {
        const next = new Set(prev)
        next.delete(driverName)
        return next
      })
    }
  }

  async function handleOptimizeAll() {
    for (const driverName of driverNames) {
      if (driverName === 'Unassigned') continue
      await handleOptimize(driverName)
    }
  }

  async function handleSendAll() {
    setSending(true)
    try {
      await fetch('/api/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'email_all_routes', date: selectedDate }),
      })
      await fetch('/api/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'push_routes', date: selectedDate }),
      })
      showToast('Routes sent successfully!')
      setShowSendModal(false)
      await loadStops(selectedDate)
    } catch (err) {
      console.error('Send failed:', err)
      showToast('Failed to send routes')
    } finally {
      setSending(false)
    }
  }

  async function handleMoveSelected() {
    if (!moveTarget || selectedStops.size === 0) return
    for (const orderId of selectedStops) {
      await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: 'daily_stops',
          operation: 'update',
          data: { driver_name: moveTarget },
          match: { id: orderId },
        }),
      })
    }
    setSelectedStops(new Set())
    setShowMoveDropdown(false)
    setMoveTarget('')
    await loadStops(selectedDate)
    showToast(`Moved ${selectedStops.size} stops to ${moveTarget}`)
  }

  function toggleStopSelect(id) {
    setSelectedStops(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleExpanded(driverName) {
    setExpandedDrivers(prev => {
      const next = new Set(prev)
      if (next.has(driverName)) next.delete(driverName)
      else next.add(driverName)
      return next
    })
  }

  // Filtered stops for the table
  const filteredStops = useMemo(() => {
    let stops = allStops
    if (driverFilter) {
      stops = stops.filter(s => s.driver_name === driverFilter)
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      stops = stops.filter(s =>
        (s.patient_name && s.patient_name.toLowerCase().includes(q)) ||
        (s.address && s.address.toLowerCase().includes(q)) ||
        (s.city && s.city.toLowerCase().includes(q)) ||
        (s.zip && s.zip.toLowerCase().includes(q))
      )
    }
    return stops
  }, [allStops, driverFilter, searchQuery])

  // Summary stats
  const totalPackages = allStops.length
  const totalStops = new Set(allStops.map(s => s.address)).size
  const activeDrivers = driverNames.filter(n => n !== 'Unassigned').length

  return (
    <DispatchV2Shell title="Routes">
      {/* Date Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <button className="dv2-btn dv2-btn-ghost dv2-btn-sm" onClick={() => shiftDate(-1)}>&larr;</button>
        <span style={{ fontSize: 15, fontWeight: 600, minWidth: 180, textAlign: 'center' }}>
          {formatDateDisplay(selectedDate)}
        </span>
        <button className="dv2-btn dv2-btn-ghost dv2-btn-sm" onClick={() => shiftDate(1)}>&rarr;</button>
        <button className="dv2-btn dv2-btn-ghost dv2-btn-sm" onClick={goToday}>Today</button>
        <div style={{ display: 'flex', gap: 4, marginLeft: 12 }}>
          {DAYS.map((day, i) => (
            <button
              key={day}
              className={`dv2-btn dv2-btn-sm ${weekDates[i] === selectedDate ? 'dv2-btn-navy' : 'dv2-btn-ghost'}`}
              onClick={() => setSelectedDate(weekDates[i])}
            >
              {day}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'rgba(255,255,255,0.4)' }}>
          Loading stops...
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 20, paddingBottom: 70 }}>
          {/* Left Panel — Driver Cards */}
          <div style={{ width: 320, minWidth: 280, flexShrink: 0 }}>
            <h3 style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: 500, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Drivers ({activeDrivers})
            </h3>
            {driverNames.length === 0 && (
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, padding: 20 }}>
                No stops for this date
              </div>
            )}
            {driverNames.map(driverName => {
              const driverStops = grouped[driverName]
              const stats = getDriverStats(driverStops)
              const isExpanded = expandedDrivers.has(driverName)
              const uniqueAddresses = [...new Set(driverStops.map(s => s.address))]
              const displayAddresses = isExpanded ? uniqueAddresses : uniqueAddresses.slice(0, 3)
              const isOptimizing = optimizing.has(driverName)

              return (
                <div
                  key={driverName}
                  className="dv2-card"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setDriverFilter(driverFilter === driverName ? '' : driverName)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{driverName}</span>
                    <span className={`dv2-badge ${stats.status === 'Optimized' ? 'dv2-badge-emerald' : 'dv2-badge-amber'}`}>
                      {stats.status}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 10 }}>
                    <span>{stats.stopCount} stops</span>
                    <span>{stats.packageCount} pkgs</span>
                    {stats.coldCount > 0 && (
                      <span style={{ color: '#60a5fa' }}>{stats.coldCount} cold</span>
                    )}
                  </div>

                  {/* Address preview */}
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
                    {displayAddresses.map((addr, i) => (
                      <div key={i} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {i + 1}. {addr}
                      </div>
                    ))}
                    {uniqueAddresses.length > 3 && (
                      <button
                        onClick={e => { e.stopPropagation(); toggleExpanded(driverName) }}
                        style={{
                          background: 'none', border: 'none', color: '#6b8cff',
                          fontSize: 11, cursor: 'pointer', padding: '4px 0 0',
                        }}
                      >
                        {isExpanded ? 'Show less' : `Show all ${uniqueAddresses.length}`}
                      </button>
                    )}
                  </div>

                  {/* Optimize button */}
                  <button
                    className="dv2-btn dv2-btn-navy dv2-btn-sm"
                    style={{ marginTop: 10, width: '100%' }}
                    onClick={e => { e.stopPropagation(); handleOptimize(driverName) }}
                    disabled={isOptimizing}
                  >
                    {isOptimizing ? 'Optimizing...' : 'Optimize'}
                  </button>
                </div>
              )
            })}
          </div>

          {/* Right Panel — Stop Table */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
              <h3 style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: 500, margin: 0, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Stops ({filteredStops.length})
              </h3>
              <div style={{ flex: 1 }} />
              <select
                className="dv2-select"
                value={driverFilter}
                onChange={e => setDriverFilter(e.target.value)}
                style={{ minWidth: 140 }}
              >
                <option value="">All Drivers</option>
                {driverNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <input
                className="dv2-input"
                placeholder="Search..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ width: 160 }}
              />
              {selectedStops.size > 0 && (
                <div style={{ position: 'relative' }}>
                  <button
                    className="dv2-btn dv2-btn-ghost dv2-btn-sm"
                    onClick={() => setShowMoveDropdown(!showMoveDropdown)}
                  >
                    Move Selected ({selectedStops.size})
                  </button>
                  {showMoveDropdown && (
                    <div style={{
                      position: 'absolute', top: '100%', right: 0, marginTop: 4,
                      background: '#2A2A2E', border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 8, padding: 12, zIndex: 50, minWidth: 200,
                    }}>
                      <select
                        className="dv2-select"
                        value={moveTarget}
                        onChange={e => setMoveTarget(e.target.value)}
                        style={{ width: '100%', marginBottom: 8 }}
                      >
                        <option value="">Select driver...</option>
                        {driverNames.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                      <button
                        className="dv2-btn dv2-btn-navy dv2-btn-sm"
                        style={{ width: '100%' }}
                        onClick={handleMoveSelected}
                        disabled={!moveTarget}
                      >
                        Move
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="dv2-card" style={{ padding: 0, overflow: 'auto' }}>
              <table className="dv2-table">
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>
                      <input
                        type="checkbox"
                        checked={filteredStops.length > 0 && filteredStops.every(s => selectedStops.has(s.id))}
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedStops(new Set(filteredStops.map(s => s.id)))
                          } else {
                            setSelectedStops(new Set())
                          }
                        }}
                      />
                    </th>
                    <th>#</th>
                    <th>Patient</th>
                    <th>Address</th>
                    <th>City</th>
                    <th>ZIP</th>
                    <th>Driver</th>
                    <th>PKG</th>
                    <th>Cold</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStops.map((stop, idx) => (
                    <tr key={stop.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedStops.has(stop.id)}
                          onChange={() => toggleStopSelect(stop.id)}
                        />
                      </td>
                      <td style={{ color: 'rgba(255,255,255,0.3)' }}>{idx + 1}</td>
                      <td style={{ fontWeight: 500, color: '#fff' }}>{stop.patient_name || '-'}</td>
                      <td>{stop.address || '-'}</td>
                      <td>{stop.city || '-'}</td>
                      <td>{stop.zip || '-'}</td>
                      <td>
                        <span className="dv2-badge dv2-badge-navy">{stop.driver_name || '-'}</span>
                      </td>
                      <td>{stop.package_count !== undefined ? stop.package_count : 1}</td>
                      <td>{stop.cold_chain ? 'Yes' : '-'}</td>
                    </tr>
                  ))}
                  {filteredStops.length === 0 && (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: 32, color: 'rgba(255,255,255,0.3)' }}>
                        No stops found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Bar */}
      <div className="dv2-bottombar">
        <div className="dv2-bottombar-stats">
          <span>Stops:<strong>{totalStops}</strong></span>
          <span>Packages:<strong>{totalPackages}</strong></span>
          <span>Drivers:<strong>{activeDrivers}</strong></span>
        </div>
        <div className="dv2-bottombar-actions">
          <button className="dv2-btn dv2-btn-navy" onClick={handleOptimizeAll}>
            Optimize All
          </button>
          <button className="dv2-btn dv2-btn-emerald" onClick={() => setShowSendModal(true)}>
            Send All Routes
          </button>
        </div>
      </div>

      {/* Send Modal */}
      {showSendModal && (
        <div className="dv2-modal-overlay" onClick={() => !sending && setShowSendModal(false)}>
          <div className="dv2-modal" onClick={e => e.stopPropagation()}>
            <h3>Send Routes</h3>
            <p>
              Send routes to {activeDrivers} driver{activeDrivers !== 1 ? 's' : ''} for{' '}
              {formatDateDisplay(selectedDate)}?
            </p>
            <div className="dv2-modal-actions">
              <button
                className="dv2-btn dv2-btn-ghost"
                onClick={() => setShowSendModal(false)}
                disabled={sending}
              >
                Cancel
              </button>
              <button
                className="dv2-btn dv2-btn-emerald"
                onClick={handleSendAll}
                disabled={sending}
              >
                {sending ? 'Sending...' : 'Confirm & Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className="dv2-toast">{toast}</div>}
    </DispatchV2Shell>
  )
}
