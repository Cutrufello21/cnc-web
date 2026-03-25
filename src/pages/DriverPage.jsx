import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import StopCard from '../components/driver/StopCard'
import WeeklyBar from '../components/driver/WeeklyBar'
import TimeOffCalendar from '../components/driver/TimeOffCalendar'
import DriverSortList from '../components/driver/DriverSortList'
import ThemeToggle from '../components/ThemeToggle'
import './DashboardShell.css'
import './DriverPage.css'

export default function DriverPage() {
  const { user, profile, signOut } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('stops')
  const [listView, setListView] = useState(false)
  const [dragIdx, setDragIdx] = useState(null)
  const [hasCustomOrder, setHasCustomOrder] = useState(false)
  const originalStopsRef = useRef(null)
  const [selected, setSelected] = useState(new Set())

  useEffect(() => {
    if (user?.email) fetchDriverData()
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      if (user?.email && !document.hidden) fetchDriverData()
    }, 30000)
    return () => clearInterval(interval)
  }, [user?.email])

  async function fetchDriverData() {
    setLoading(true)
    setError(null)
    try {
      // Look up driver from Supabase
      const { data: driverRow, error: driverErr } = await supabase.from('drivers')
        .select('*').eq('email', user.email.toLowerCase()).single()
      if (driverErr || !driverRow) throw new Error('Driver not found')

      const driverName = driverRow.driver_name
      const driverId = driverRow.driver_number
      const tabName = `${driverName} - ${driverId}`

      const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      const todayName = DAYS[new Date().getDay()]
      const isWeekend = todayName === 'Sunday' || todayName === 'Saturday'

      // Get payroll data from Supabase
      const { data: payrollData } = await supabase.from('payroll')
        .select('*').eq('driver_name', driverName)
        .order('week_of', { ascending: false }).limit(1)

      const payroll = payrollData?.[0]
      let weekTotal = 0
      let dailyStops = {}
      if (payroll) {
        dailyStops = { Mon: payroll.mon || 0, Tue: payroll.tue || 0, Wed: payroll.wed || 0, Thu: payroll.thu || 0, Fri: payroll.fri || 0 }
        weekTotal = payroll.week_total || 0
      }

      if (isWeekend) {
        setData({
          approved: false, noDeliveryToday: true,
          deliveryDay: todayName, driverName, driverId,
          stops: [], stopCount: 0, coldChainCount: 0, weekTotal, dailyStops,
        })
        return
      }

      // Get the most recent stops for this driver — query by driver name,
      // order by delivery_date descending, take the latest batch
      const { data: latestStops } = await supabase.from('daily_stops')
        .select('delivery_date')
        .eq('driver_name', driverName)
        .order('delivery_date', { ascending: false })
        .limit(1)

      const deliveryDate = latestStops?.[0]?.delivery_date || new Date().toISOString().split('T')[0]
      const DAYNAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
      const deliveryDayName = DAYNAMES[new Date(deliveryDate + 'T12:00:00').getDay()]

      // Get daily stops and approval status from Supabase
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
        Notes: s.notes || '',
      }))
      // Store original dispatch order (by id, before any sort_order)
      originalStopsRef.current = rawStops.map((s, idx) => ({
        _index: idx,
        _id: s.id,
        'Order ID': s.order_id, Name: s.patient_name,
        Address: s.address, City: s.city, ZIP: s.zip,
        Pharmacy: s.pharmacy, 'Cold Chain': s.cold_chain ? 'Yes' : '',
        _coldChain: s.cold_chain,
        Notes: s.notes || '',
      }))
      setHasCustomOrder(hasSortOrder)
      // Approved if dispatch log exists OR if stops are already in Supabase
      const approved = (logsRes.data && logsRes.data.length > 0) || stops.length > 0

      setData({
        approved, deliveryDay: deliveryDayName, driverName, driverId, tabName,
        pharmacy: driverRow.pharmacy || 'SHSP',
        stops, stopCount: stops.length,
        coldChainCount: stops.filter(s => s._coldChain).length,
        weekTotal, dailyStops,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleDragStart(idx) { setDragIdx(idx) }
  function handleDragOver(e) { e.preventDefault() }
  function handleDragEnd() { setDragIdx(null) }

  async function reorderStops(fromIdx, toIdx) {
    if (fromIdx === toIdx) return
    const stops = [...data.stops]
    const [moved] = stops.splice(fromIdx, 1)
    stops.splice(toIdx, 0, moved)
    setData(prev => ({ ...prev, stops }))
    setDragIdx(null)
    setHasCustomOrder(true)

    // Save sort_order to Supabase
    const updates = stops.map((s, i) => ({ id: s._id, sort_order: i }))
    for (const u of updates) {
      await supabase.from('daily_stops').update({ sort_order: u.sort_order }).eq('id', u.id)
    }
  }

  async function handleDrop(targetIdx) {
    if (dragIdx === null) return
    await reorderStops(dragIdx, targetIdx)
  }

  // Touch drag support for mobile
  const touchState = useRef({ idx: null, startY: 0 })
  function handleTouchDragStart(idx, e) {
    touchState.current = { idx, startY: e.touches[0].clientY }
    setDragIdx(idx)

    const onMove = (ev) => {
      ev.preventDefault()
      const y = ev.touches[0].clientY
      const cards = document.querySelectorAll('.stop')
      for (let i = 0; i < cards.length; i++) {
        const rect = cards[i].getBoundingClientRect()
        if (y > rect.top && y < rect.bottom && i !== touchState.current.idx) {
          const stops = [...data.stops]
          const [moved] = stops.splice(touchState.current.idx, 1)
          stops.splice(i, 0, moved)
          setData(prev => ({ ...prev, stops }))
          touchState.current.idx = i
          setDragIdx(i)
          break
        }
      }
    }
    const onEnd = () => {
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      if (touchState.current.idx !== idx) {
        setHasCustomOrder(true)
        // Save to Supabase
        const currentStops = data.stops
        currentStops.forEach(async (s, i) => {
          await supabase.from('daily_stops').update({ sort_order: i }).eq('id', s._id)
        })
      }
      setDragIdx(null)
    }
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd)
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

  function getSelectedAddresses() {
    if (!data?.stops) return ''
    return [...selected].sort((a, b) => a - b)
      .map(i => data.stops[i])
      .map(s => `${s.Address || ''}, ${s.City || ''}, OH ${s.ZIP || ''}`)
      .filter(a => a.replace(/[, ]/g, '').length > 2)
      .join('\n')
  }

  function handleCopySelected() {
    const text = getSelectedAddresses()
    if (text) navigator.clipboard.writeText(text)
  }

  async function handleResetOrder() {
    if (!originalStopsRef.current) return
    setData(prev => ({ ...prev, stops: [...originalStopsRef.current] }))
    setHasCustomOrder(false)

    // Clear sort_order in Supabase
    const ids = originalStopsRef.current.map(s => s._id)
    for (const id of ids) {
      await supabase.from('daily_stops').update({ sort_order: null }).eq('id', id)
    }
  }

  return (
    <div className="shell">
      <header className="shell__header">
        <div className="container shell__header-inner">
          <div className="shell__brand">
            <span className="shell__logo">CNC</span>
            <span className="shell__title">Driver Portal</span>
          </div>
          <div className="shell__user">
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
                      {hasCustomOrder && !listView && (
                        <button className="driver__view-btn driver__reset-btn" onClick={handleResetOrder}>Reset Order</button>
                      )}
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
                          isDragging={dragIdx === i}
                          isSelected={selected.has(i)}
                          onToggleSelect={() => toggleSelect(i)}
                          onDragStart={(e) => {
                            handleDragStart(i)
                            // If this stop is selected, attach all selected addresses as drag data
                            if (selected.size > 0 && selected.has(i)) {
                              e.dataTransfer.setData('text/plain', getSelectedAddresses())
                              e.dataTransfer.effectAllowed = 'copyMove'
                            }
                          }}
                          onDragOver={handleDragOver}
                          onDrop={() => handleDrop(i)}
                          onDragEnd={handleDragEnd}
                          onTouchDragStart={(e) => handleTouchDragStart(i, e)}
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
              <WeeklyBar dailyStops={data.dailyStops} weekTotal={data.weekTotal} />
            )}

            {activeTab === 'timeoff' && (
              <TimeOffCalendar driverName={data.driverName} />
            )}

            {activeTab === 'sort' && (
              <DriverSortList driverName={data.driverName} pharmacy={data.pharmacy || 'SHSP'} />
            )}
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
