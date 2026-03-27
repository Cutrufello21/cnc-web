import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import StopCard from '../components/driver/StopCard'
import WeeklyBar from '../components/driver/WeeklyBar'
import TimeOffCalendar from '../components/driver/TimeOffCalendar'
import DriverSortList from '../components/driver/DriverSortList'
import ThemeToggle from '../components/ThemeToggle'
import BrandMark from '../components/BrandMark'
import './DashboardShell.css'
import './DriverPage.css'

export default function DriverPage() {
  const { user, profile, signOut } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('stops')
  const [listView, setListView] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [teamData, setTeamData] = useState(null)
  const [expandedDriver, setExpandedDriver] = useState(null)
  const [teamSelected, setTeamSelected] = useState(new Set()) // order_ids selected for transfer
  const [transferring, setTransferring] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => {
    if (user?.email) fetchDriverData()
  }, [user?.email])

  // Cache driver info so refresh doesn't re-lookup
  const driverCache = useRef(null)

  async function fetchDriverData() {
    if (!data) setLoading(true)
    setError(null)
    try {
      // Look up driver (cached after first load)
      let driverRow = driverCache.current
      if (!driverRow) {
        const { data: byEmail } = await supabase.from('drivers')
          .select('*').eq('email', user.email.toLowerCase()).single()
        driverRow = byEmail
        if (!driverRow && profile?.driver_number) {
          const { data: byNumber } = await supabase.from('drivers')
            .select('*').eq('driver_number', profile.driver_number).single()
          driverRow = byNumber
        }
        if (!driverRow) throw new Error('Driver not found')
        driverCache.current = driverRow
      }

      const driverName = driverRow.driver_name
      const driverId = driverRow.driver_number
      const tabName = `${driverName} - ${driverId}`

      const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      const todayName = DAYS[new Date().getDay()]
      const isWeekend = todayName === 'Sunday' || todayName === 'Saturday'

      // Get Monday-Friday of current week
      const now = new Date()
      const dow = now.getDay()
      const monOffset = dow === 0 ? -6 : 1 - dow
      const monday = new Date(now)
      monday.setDate(now.getDate() + monOffset)
      const friday = new Date(monday)
      friday.setDate(monday.getDate() + 4)
      const fmtD = d => d.toISOString().split('T')[0]

      // Fetch actual stops from daily_stops + latest delivery date
      const [weekStopsRes, latestRes] = await Promise.all([
        supabase.from('daily_stops').select('delivery_day')
          .eq('driver_name', driverName)
          .gte('delivery_date', fmtD(monday))
          .lte('delivery_date', fmtD(friday)),
        isWeekend ? Promise.resolve({ data: [] }) : supabase.from('daily_stops')
          .select('delivery_date').eq('driver_name', driverName)
          .order('delivery_date', { ascending: false }).limit(1),
      ])

      const dayMap = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri' }
      let dailyStops = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0 }
      for (const s of (weekStopsRes.data || [])) {
        const abbr = dayMap[s.delivery_day]
        if (abbr) dailyStops[abbr]++
      }
      let weekTotal = Object.values(dailyStops).reduce((s, v) => s + v, 0)

      if (isWeekend) {
        setData({
          approved: false, noDeliveryToday: true,
          deliveryDay: todayName, driverName, driverId,
          stops: [], stopCount: 0, coldChainCount: 0, weekTotal, dailyStops,
        })
        return
      }

      const deliveryDate = latestRes.data?.[0]?.delivery_date || new Date().toISOString().split('T')[0]
      const DAYNAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
      const deliveryDayName = DAYNAMES[new Date(deliveryDate + 'T12:00:00').getDay()]

      // Get stops + logs in parallel
      const [stopsRes, logsRes] = await Promise.all([
        supabase.from('daily_stops').select('*')
          .eq('delivery_date', deliveryDate).eq('driver_name', driverName),
        supabase.from('dispatch_logs').select('*')
          .eq('delivery_day', deliveryDayName).in('status', ['Complete', 'Success'])
          .order('date', { ascending: false }).limit(1),
      ])

      const rawStops = stopsRes.data || []
      const hasSortOrder = rawStops.some(s => s.sort_order != null)
      const sorted = hasSortOrder
        ? [...rawStops].sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
        : rawStops

      const stops = sorted.map((s, idx) => ({
        _index: idx,
        _id: s.id,
        'Order ID': s.order_id, Name: s.patient_name,
        Address: s.address, City: s.city, ZIP: s.zip,
        Pharmacy: s.pharmacy, 'Cold Chain': s.cold_chain ? 'Yes' : '',
        _coldChain: s.cold_chain,
        _sigRequired: (s.notes || '').toLowerCase().includes('signature'),
        _transferred: s.assigned_driver_number && s.dispatch_driver_number && s.assigned_driver_number !== s.dispatch_driver_number,
        Notes: s.notes || '',
      }))
      // Approved if dispatch log exists OR if stops are already in Supabase
      const approved = (logsRes.data && logsRes.data.length > 0) || stops.length > 0

      setData({
        approved, deliveryDay: deliveryDayName, deliveryDate, driverName, driverId, tabName,
        pharmacy: driverRow.pharmacy || 'SHSP',
        stops, stopCount: stops.length,
        coldChainCount: stops.filter(s => s._coldChain).length,
        weekTotal, dailyStops,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      setLastUpdated(new Date())
    }
  }

  function toggleSelect(idx) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }

  function toggleSelectAll() {
    if (!data?.stops) return
    setSelected(prev => prev.size === data.stops.length ? new Set() : new Set(data.stops.map((_, i) => i)))
  }

  async function handleRefresh() {
    setRefreshing(true)
    await fetchDriverData()
    setTeamData(null)
    setRefreshing(false)
  }

  async function loadTeamData() {
    if (!data?.deliveryDate) return
    const myPharmacy = data.pharmacy || 'SHSP'
    const query = supabase.from('daily_stops').select('*')
      .eq('delivery_date', data.deliveryDate)
    // Filter by pharmacy unless driver covers Both
    if (myPharmacy !== 'Both') {
      query.eq('pharmacy', myPharmacy)
    }
    const { data: allStops } = await query
    const byDriver = {}
    ;(allStops || []).forEach(s => {
      if (!byDriver[s.driver_name]) byDriver[s.driver_name] = { stops: [], coldChain: 0, driverNumber: s.driver_number }
      byDriver[s.driver_name].stops.push(s)
      if (s.cold_chain) byDriver[s.driver_name].coldChain++
    })
    const drivers = Object.entries(byDriver)
      .map(([name, d]) => ({ name, driverNumber: d.driverNumber, count: d.stops.length, coldChain: d.coldChain, stops: d.stops }))
      .sort((a, b) => b.count - a.count)
    setTeamData(drivers)
    setTeamSelected(new Set())
  }

  function toggleTeamSelect(orderId) {
    setTeamSelected(prev => {
      const next = new Set(prev)
      next.has(orderId) ? next.delete(orderId) : next.add(orderId)
      return next
    })
  }

  async function handleTransfer(toDriverName, toDriverNumber) {
    if (teamSelected.size === 0) return
    setTransferring(true)
    try {
      // Find which driver the selected stops belong to
      const orderIds = [...teamSelected]
      const sourceDriver = teamData?.find(d => d.stops.some(s => teamSelected.has(s.order_id)))
      const resp = await fetch('/api/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'transfer',
          orderIds,
          toDriverName,
          toDriverNumber,
          fromDriverName: sourceDriver?.name || data.driverName,
        }),
      })
      const result = await resp.json()
      if (result.error) throw new Error(result.error)

      // Reload team data
      setTeamSelected(new Set())
      setExpandedDriver(null)
      setTeamData(null)
      alert(`${orderIds.length} stop${orderIds.length > 1 ? 's' : ''} transferred to ${toDriverName}. Email sent to BioTouch.`)
      loadTeamData()
    } catch (err) {
      alert('Transfer failed: ' + err.message)
    } finally {
      setTransferring(false)
    }
  }

  function getSelectedAddresses() {
    if (!data?.stops) return ''
    return [...selected].sort((a, b) => a - b)
      .map(i => data.stops[i])
      .map(s => `${s.Address || ''}, ${s.City || ''}, OH ${s.ZIP || ''}`)
      .filter(a => a.replace(/[, ]/g, '').length > 2)
      .join('\n')
  }

  return (
    <div className="shell">
      <header className="shell__header">
        <div className="container shell__header-inner">
          <div className="shell__brand">
            <span className="shell__pill">CNC</span>
            <span className="shell__title">Driver Portal</span>
          </div>
          <div className="shell__user">
            <button className={`driver__refresh-btn ${refreshing ? 'driver__refresh-btn--spin' : ''}`} onClick={handleRefresh} disabled={refreshing} title="Refresh">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                <path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
              </svg>
              {lastUpdated && <span className="driver__last-updated">{lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>}
            </button>
            <ThemeToggle />
            <span className="shell__name">{data?.driverName || profile?.full_name}</span>
            <button className="shell__signout" onClick={signOut}>Sign Out</button>
          </div>
        </div>
      </header>

      <main className="shell__main container">
        {loading && (
          <div className="dispatch__loading">
            <div className="dispatch__spinner" />
            <p>Loading your route...</p>
          </div>
        )}

        {error && (
          <div className="dispatch__error">
            <p>{error}</p>
            <button onClick={fetchDriverData}>Retry</button>
          </div>
        )}

        {data && !loading && (
          <>
            {/* Status banner */}
            {data.noDeliveryToday ? (
              <div className="driver__banner driver__banner--off">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="8" y1="12" x2="16" y2="12" />
                </svg>
                <div>
                  <h3>No deliveries today</h3>
                  <p>It's {data.deliveryDay}. Routes resume on the next business day.</p>
                </div>
              </div>
            ) : !data.approved ? (
              <div className="driver__banner driver__banner--pending">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
                <div>
                  <h3>Route not ready yet</h3>
                  <p>Your {data.deliveryDay} route is being prepared. You'll be notified when it's approved.</p>
                </div>
              </div>
            ) : (
              <div className="driver__banner driver__banner--approved">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <div>
                  <h3>Route approved</h3>
                  <p>Your {data.deliveryDay} route is ready. {data.stopCount} stop{data.stopCount !== 1 ? 's' : ''} today.</p>
                </div>
              </div>
            )}

            {/* Quick stats */}
            <div className="driver__stats">
              <div className="driver__stat">
                <span className="driver__stat-value">{data.stopCount || 0}</span>
                <span className="driver__stat-label">Today's Stops</span>
              </div>
              <div className="driver__stat">
                <span className="driver__stat-value driver__stat-value--cold">{data.coldChainCount || 0}</span>
                <span className="driver__stat-label">Cold Chain</span>
              </div>
              <div className="driver__stat">
                <span className="driver__stat-value">{data.weekTotal || 0}</span>
                <span className="driver__stat-label">This Week</span>
              </div>
            </div>

            {/* Tabs */}
            <div className="driver__tabs">
              <button
                className={`driver__tab ${activeTab === 'stops' ? 'driver__tab--active' : ''}`}
                onClick={() => setActiveTab('stops')}
              >
                Stops ({data.stopCount || 0})
              </button>
              <button
                className={`driver__tab ${activeTab === 'week' ? 'driver__tab--active' : ''}`}
                onClick={() => setActiveTab('week')}
              >
                Weekly Summary
              </button>
              <button
                className={`driver__tab ${activeTab === 'timeoff' ? 'driver__tab--active' : ''}`}
                onClick={() => setActiveTab('timeoff')}
              >
                Schedule
              </button>
              <button
                className={`driver__tab ${activeTab === 'team' ? 'driver__tab--active' : ''}`}
                onClick={() => { setActiveTab('team'); loadTeamData() }}
              >
                Team
              </button>
              <button
                className={`driver__tab ${activeTab === 'sort' ? 'driver__tab--active' : ''}`}
                onClick={() => setActiveTab('sort')}
              >
                Sort List
              </button>
            </div>

            {/* Tab content */}
            {activeTab === 'stops' && (
              <div className="driver__stops">
                {!data.approved && !data.noDeliveryToday ? (
                  <div className="driver__not-ready">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                    </svg>
                    <h3>Route not ready yet</h3>
                    <p>Your stop list will appear here once the dispatcher approves tonight's routes.</p>
                  </div>
                ) : data.stops?.length > 0 ? (
                  <>
                    <div className="driver__view-toggle">
                      <button className={`driver__view-btn ${!listView ? 'driver__view-btn--active' : ''}`} onClick={() => setListView(false)}>Cards</button>
                      <button className={`driver__view-btn ${listView ? 'driver__view-btn--active' : ''}`} onClick={() => setListView(true)}>List</button>
                    </div>
                    <div className="driver__select-bar">
                      <label className="driver__select-all">
                        <input type="checkbox" checked={selected.size === data.stops.length && data.stops.length > 0} onChange={toggleSelectAll} />
                        <span>{selected.size > 0 ? `${selected.size} selected` : 'Select All'}</span>
                      </label>
                      {selected.size > 0 && (
                        <CopySelectedButton getAddresses={getSelectedAddresses} />
                      )}
                    </div>
                    {listView ? (
                      <div className="driver__list-view">
                        <table className="driver__list-table">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Name</th>
                              <th>Address</th>
                              <th>City</th>
                              <th>ZIP</th>
                              <th>CC</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.stops.map((stop, i) => (
                              <tr key={i} className={stop._coldChain ? 'driver__list-row--cold' : ''}>
                                <td className="driver__list-num">{i + 1}</td>
                                <td>{stop.Name || '—'}</td>
                                <td>
                                  <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${stop.Address}, ${stop.City}, OH ${stop.ZIP}`)}`}
                                    target="_blank" rel="noopener noreferrer" className="driver__list-addr">
                                    {stop.Address || '—'}
                                  </a>
                                </td>
                                <td>{stop.City || '—'}</td>
                                <td>{stop.ZIP || '—'}</td>
                                <td>{stop._coldChain ? '❄️' : ''}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      data.stops.map((stop, i) => (
                        <StopCard
                          key={stop._id || i}
                          stop={stop}
                          index={i + 1}
                          total={data.stops.length}
                          isSelected={selected.has(i)}
                          onToggleSelect={() => toggleSelect(i)}
                          onExportDrag={(e) => {
                            const text = getSelectedAddresses()
                            if (text) {
                              e.dataTransfer.setData('text/plain', text)
                              e.dataTransfer.effectAllowed = 'copy'
                            }
                          }}
                        />
                      ))
                    )}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 8, margin: '16px 0' }}>
                      <CopyRouteButton stops={data.stops} />
                      <ExportExcelButton stops={data.stops} driverName={data.driverName} deliveryDay={data.deliveryDay} />
                    </div>
                  </>
                ) : (
                  <div className="driver__not-ready">
                    <h3>No stops assigned</h3>
                    <p>You have no deliveries for {data.deliveryDay}.</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'week' && (
              <WeeklyBar dailyStops={data.dailyStops} weekTotal={data.weekTotal} driverName={data.driverName} />
            )}

            {activeTab === 'timeoff' && (
              <TimeOffCalendar driverName={data.driverName} />
            )}

            {activeTab === 'team' && (
              <div className="driver__team">
                {!teamData ? (
                  <div className="driver__not-ready"><div className="dispatch__spinner" />Loading team routes...</div>
                ) : (
                  <>
                    <p className="driver__team-sub">{data.pharmacy !== 'Both' ? data.pharmacy + ' — ' : ''}{data.deliveryDay} — {teamData.reduce((s, d) => s + d.count, 0)} total stops</p>
                    {teamSelected.size > 0 && (
                      <div className="driver__team-transfer-bar">
                        <span>{teamSelected.size} stop{teamSelected.size > 1 ? 's' : ''} selected</span>
                        <span className="driver__team-transfer-hint">Tap a driver below to transfer</span>
                      </div>
                    )}
                    {teamData.map(d => {
                      const isMe = d.name === data.driverName
                      const canManageAll = data.pharmacy === 'Both'
                      const canSelect = isMe || canManageAll
                      const isExpanded = expandedDriver === d.name
                      // Can transfer to this driver if stops are selected and they aren't the source
                      const selectedFromThis = d.stops.some(s => teamSelected.has(s.order_id))
                      const canTransferTo = !selectedFromThis && teamSelected.size > 0
                      return (
                        <div key={d.name} className={`driver__team-card ${isMe ? 'driver__team-card--me' : ''} ${canTransferTo ? 'driver__team-card--target' : ''}`}>
                          <div className="driver__team-header" onClick={() => {
                            if (canTransferTo) {
                              if (confirm(`Transfer ${teamSelected.size} stop${teamSelected.size > 1 ? 's' : ''} to ${d.name}?`)) {
                                handleTransfer(d.name, d.driverNumber)
                              }
                            } else {
                              setExpandedDriver(isExpanded ? null : d.name)
                            }
                          }}>
                            {canTransferTo && (
                              <span className="driver__team-transfer-icon">→</span>
                            )}
                            <span className="driver__team-name">{d.name} {isMe && <span className="driver__team-you">(You)</span>}</span>
                            <span className="driver__team-count">{d.count} stops {d.coldChain > 0 && <span className="driver__team-cc">{d.coldChain} CC</span>}</span>
                            {!canTransferTo && (
                              <svg className={`driver__team-chevron ${isExpanded ? 'driver__team-chevron--open' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                            )}
                          </div>
                          {isExpanded && (
                            <div className="driver__team-stops">
                              <table className="driver__team-table">
                                <thead><tr>{canSelect && <th></th>}<th>#</th><th>Name</th><th>Address</th><th>City</th><th>ZIP</th></tr></thead>
                                <tbody>
                                  {d.stops.map((s, i) => (
                                    <tr key={i} className={teamSelected.has(s.order_id) ? 'driver__team-row--selected' : ''}>
                                      {canSelect && (
                                        <td><input type="checkbox" checked={teamSelected.has(s.order_id)} onChange={() => toggleTeamSelect(s.order_id)} /></td>
                                      )}
                                      <td>{i + 1}</td>
                                      <td>{s.patient_name || '—'}</td>
                                      <td><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.address}, ${s.city}, OH ${s.zip}`)}`} target="_blank" rel="noopener noreferrer" className="driver__list-addr">{s.address || '—'}</a></td>
                                      <td>{s.city || '—'}</td>
                                      <td>{s.zip || '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </>
                )}
              </div>
            )}

            {activeTab === 'sort' && (() => {
              const pharmacies = [...new Set(data.stops.map(s => s.Pharmacy).filter(Boolean))]
              if (pharmacies.length === 0) pharmacies.push(data.pharmacy || 'SHSP')
              return pharmacies.map(p => (
                <DriverSortList key={p} driverName={data.driverName} pharmacy={p} />
              ))
            })()}
          </>
        )}
      </main>
    </div>
  )
}

function CopyRouteButton({ stops }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    const text = stops
      .map(s => `${s.Address || ''}, ${s.City || ''}, ${s.ZIP || ''}`)
      .filter(line => line.replace(/,/g, '').trim())
      .join('\n')
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      className="driver__copy-route"
      onClick={handleCopy}
      style={{
        padding: '6px 16px',
        fontSize: 12, color: '#6b7280', background: 'transparent',
        border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer',
      }}
    >
      {copied ? 'Copied!' : 'Copy Route'}
    </button>
  )
}

function ExportExcelButton({ stops, driverName, deliveryDay }) {
  function handleExport() {
    const headers = ['#', 'Patient', 'Address', 'City', 'ZIP', 'Pharmacy', 'Cold Chain', 'Order ID']
    const rows = stops.map((s, i) => [
      i + 1,
      s['Patient Name'] || s.patient_name || '',
      s.Address || s.address || '',
      s.City || s.city || '',
      s.ZIP || s.zip || '',
      s.Pharmacy || s.pharmacy || '',
      (s['Cold Chain'] || s.cold_chain) ? 'Yes' : 'No',
      s['Order ID'] || s.order_id || '',
    ])

    let csv = '\uFEFF'
    csv += headers.join(',') + '\n'
    rows.forEach(r => {
      csv += r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',') + '\n'
    })

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${driverName || 'Route'}_${deliveryDay || 'Today'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <button
      onClick={handleExport}
      style={{
        padding: '6px 16px',
        fontSize: 12, color: '#6b7280', background: 'transparent',
        border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer',
      }}
    >
      Export Excel
    </button>
  )
}

function CopySelectedButton({ getAddresses }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    const text = getAddresses()
    if (!text) return
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="driver__copy-selected-btn"
    >
      {copied ? 'Copied!' : 'Copy Selected'}
    </button>
  )
}
