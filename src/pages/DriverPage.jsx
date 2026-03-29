import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import StopCard from '../components/driver/StopCard'
import WeeklyBar from '../components/driver/WeeklyBar'
import TimeOffCalendar from '../components/driver/TimeOffCalendar'
import DriverSortList from '../components/driver/DriverSortList'
import DriverScorecard from '../components/driver/DriverScorecard'
import RouteMap from '../components/driver/RouteMap'
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
  const [deliveryTick, setDeliveryTick] = useState(0)
  const [optimizedStops, setOptimizedStops] = useState(null)
  const [optimizeMode, setOptimizeMode] = useState(null) // 'oneway' | 'roundtrip'
  const [optimizing, setOptimizing] = useState(false)

  useEffect(() => {
    if (user?.email) fetchDriverData()
  }, [user?.email])

  // Realtime: auto-refresh when stops change for this driver
  useEffect(() => {
    if (!data?.driverName || !data?.deliveryDate) return
    const channel = supabase
      .channel('driver-stops-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'daily_stops',
          filter: `driver_name=eq.${data.driverName}`,
        },
        () => {
          // A stop was added, updated, or removed for this driver — refresh
          setOptimizedStops(null)
          setOptimizeMode(null)
          fetchDriverData()
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'daily_stops',
          filter: `delivery_date=eq.${data.deliveryDate}`,
        },
        (payload) => {
          // Also catch stops transferred AWAY from this driver
          if (payload.old?.driver_name === data.driverName && payload.new?.driver_name !== data.driverName) {
            setOptimizedStops(null)
            setOptimizeMode(null)
            fetchDriverData()
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [data?.driverName, data?.deliveryDate])

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
      const fmtD = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

      // Determine which delivery date to show based on cutover rules
      const hour = now.getHours()
      const todayIdx = now.getDay()
      let targetDate
      if (todayIdx === 6) {
        // Saturday → show Monday (next week)
        const nextMon = new Date(now)
        nextMon.setDate(now.getDate() + 2)
        targetDate = fmtD(nextMon)
      } else if (todayIdx === 0) {
        // Sunday → show Monday
        const nextMon = new Date(now)
        nextMon.setDate(now.getDate() + 1)
        targetDate = fmtD(nextMon)
      } else if (hour >= 18) {
        // After 6 PM weeknight → show next business day
        if (todayIdx === 5) {
          // Friday evening → Monday
          const nextMon = new Date(now)
          nextMon.setDate(now.getDate() + 3)
          targetDate = fmtD(nextMon)
        } else {
          const tomorrow = new Date(now)
          tomorrow.setDate(now.getDate() + 1)
          targetDate = fmtD(tomorrow)
        }
      } else {
        targetDate = fmtD(now)
      }

      // For weekly summary, fetch next week's Monday-Friday if viewing next week
      const targetMon = new Date(targetDate + 'T12:00:00')
      const tDow = targetMon.getDay()
      const tMonOffset = tDow === 0 ? -6 : 1 - tDow
      const weekMon = new Date(targetMon)
      weekMon.setDate(targetMon.getDate() + tMonOffset)
      const weekFri = new Date(weekMon)
      weekFri.setDate(weekMon.getDate() + 4)

      const weekStopsRes = await supabase.from('daily_stops').select('delivery_day')
        .eq('driver_name', driverName)
        .gte('delivery_date', fmtD(weekMon))
        .lte('delivery_date', fmtD(weekFri))

      const dayMap = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri' }
      let dailyStops = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0 }
      for (const s of (weekStopsRes.data || [])) {
        const abbr = dayMap[s.delivery_day]
        if (abbr) dailyStops[abbr]++
      }
      let weekTotal = Object.values(dailyStops).reduce((s, v) => s + v, 0)

      const deliveryDate = targetDate
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

      const rawMappedStops = sorted.map((s, idx) => ({
        _index: idx,
        _id: s.id,
        'Order ID': s.order_id, Name: s.patient_name,
        Address: s.address, City: s.city, ZIP: s.zip,
        Pharmacy: s.pharmacy, 'Cold Chain': s.cold_chain ? 'Yes' : '',
        _coldChain: s.cold_chain,
        _sigRequired: (s.notes || '').toLowerCase().includes('signature'),
        _transferred: s.assigned_driver_number && s.dispatch_driver_number && s.assigned_driver_number !== s.dispatch_driver_number,
        Notes: s.notes || '',
        status: s.status || 'dispatched',
        delivered_at: s.delivered_at || null,
        photo_url: s.photo_url || null,
        photo_urls: s.photo_urls || null,
        barcode: s.barcode || null,
        signature_url: s.signature_url || null,
        failure_reason: s.failure_reason || null,
        delivery_note: s.delivery_note || null,
      }))

      // Consolidate stops by normalized address
      const normalizeAddr = (a) => (a || '').toLowerCase().trim().replace(/\s+/g, ' ')
        .replace(/\bboulevard\b/g, 'blvd').replace(/\bdrive\b/g, 'dr').replace(/\bstreet\b/g, 'st')
        .replace(/\bavenue\b/g, 'ave').replace(/\broad\b/g, 'rd').replace(/\blane\b/g, 'ln')
        .replace(/\bcourt\b/g, 'ct').replace(/\bplace\b/g, 'pl').replace(/\bcircle\b/g, 'cir')
        .replace(/\bparkway\b/g, 'pkwy').replace(/\bhighway\b/g, 'hwy').replace(/\bsuite\b/g, 'ste')
        .replace(/\bapartment\b/g, 'apt').replace(/\bnorth\b/g, 'n').replace(/\bsouth\b/g, 's')
        .replace(/\beast\b/g, 'e').replace(/\bwest\b/g, 'w').replace(/\bnortheast\b/g, 'ne')
        .replace(/\bnorthwest\b/g, 'nw').replace(/\bsoutheast\b/g, 'se').replace(/\bsouthwest\b/g, 'sw')
        .replace(/[.,#]/g, '')
      const addrGroups = {}
      for (const stop of rawMappedStops) {
        const key = normalizeAddr(stop.Address)
        if (!addrGroups[key]) addrGroups[key] = []
        addrGroups[key].push(stop)
      }
      const stops = []
      const seen = new Set()
      for (const stop of rawMappedStops) {
        const key = normalizeAddr(stop.Address)
        if (seen.has(key)) continue
        seen.add(key)
        const group = addrGroups[key]
        if (group.length === 1) {
          stops.push({ ...group[0], _packageCount: 1, _consolidatedOrders: [{ orderId: group[0]['Order ID'], name: group[0].Name, coldChain: group[0]._coldChain, sigRequired: group[0]._sigRequired, notes: group[0].Notes, status: group[0].status, _id: group[0]._id }] })
        } else {
          const primary = { ...group[0] }
          primary._packageCount = group.length
          primary._coldChain = group.some(s => s._coldChain)
          primary['Cold Chain'] = primary._coldChain ? 'Yes' : ''
          primary._sigRequired = group.some(s => s._sigRequired)
          primary.Notes = group.map(s => s.Notes).filter(Boolean).join(' | ')
          primary._consolidatedOrders = group.map(s => ({ orderId: s['Order ID'], name: s.Name, coldChain: s._coldChain, sigRequired: s._sigRequired, notes: s.Notes, status: s.status, _id: s._id }))
          stops.push(primary)
        }
      }

      // Total packages = total orders (for progress tracking)
      const totalPackages = rawMappedStops.length

      // Approved if dispatch log exists OR if stops are already in Supabase
      const approved = (logsRes.data && logsRes.data.length > 0) || stops.length > 0

      setData({
        approved, deliveryDay: deliveryDayName, deliveryDate, driverName, driverId, tabName,
        pharmacy: driverRow.pharmacy || 'SHSP',
        stops, stopCount: stops.length, totalPackages,
        coldChainCount: rawMappedStops.filter(s => s._coldChain).length,
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

  async function handleOptimize(mode) {
    if (!data?.stops?.length || optimizing) return
    setOptimizing(true)
    try {
      const stopsPayload = data.stops
        .filter(s => s.status !== 'delivered' && s.status !== 'failed')
        .map(s => ({ address: s.Address, city: s.City, zip: s.ZIP }))
      if (stopsPayload.length < 2) {
        setOptimizing(false)
        return
      }
      const res = await fetch('/api/optimize-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stops: stopsPayload, mode }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error)

      // Map optimized indices back to the undelivered stops, then append delivered
      const undelivered = data.stops.filter(s => s.status !== 'delivered' && s.status !== 'failed')
      const done = data.stops.filter(s => s.status === 'delivered' || s.status === 'failed')
      const reordered = result.optimizedOrder.map(i => undelivered[i]).filter(Boolean)
      setOptimizedStops([...reordered, ...done])
      setOptimizeMode(mode)
    } catch (err) {
      console.error('Route optimization failed:', err)
      alert('Route optimization failed: ' + err.message)
    } finally {
      setOptimizing(false)
    }
  }

  function handleResetOrder() {
    setOptimizedStops(null)
    setOptimizeMode(null)
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
                  <p>Your {data.deliveryDay} route is ready. {data.stopCount} stop{data.stopCount !== 1 ? 's' : ''}{data.totalPackages > data.stopCount ? ` (${data.totalPackages} packages)` : ''} today.</p>
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
                className={`driver__tab ${activeTab === 'stats' ? 'driver__tab--active' : ''}`}
                onClick={() => setActiveTab('stats')}
              >
                Stats
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
                    {/* Delivery progress bar */}
                    {(() => {
                      const allOrders = data.stops.flatMap(s => s._consolidatedOrders || [])
                      const deliveredCount = allOrders.filter(o => o.status === 'delivered').length
                      const totalCount = allOrders.length
                      const pct = totalCount ? Math.round((deliveredCount / totalCount) * 100) : 0
                      return deliveredCount > 0 ? (
                        <div className="driver__progress">
                          <div className="driver__progress-bar">
                            <div className="driver__progress-fill" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="driver__progress-label">
                            {deliveredCount === totalCount ? 'All delivered!' : `${deliveredCount}/${totalCount} delivered`}
                          </span>
                        </div>
                      ) : null
                    })()}
                    <div className="driver__toolbar-row">
                      <div className="driver__view-toggle">
                        <button className={`driver__view-btn ${!listView ? 'driver__view-btn--active' : ''}`} onClick={() => setListView(false)}>Cards</button>
                        <button className={`driver__view-btn ${listView ? 'driver__view-btn--active' : ''}`} onClick={() => setListView(true)}>List</button>
                      </div>
                      {data.stops.filter(s => s.status !== 'delivered' && s.status !== 'failed').length >= 2 && (
                        <div className="driver__optimize">
                          {!optimizeMode ? (
                            <>
                              <button className="driver__optimize-btn" onClick={() => handleOptimize('oneway')} disabled={optimizing}>
                                {optimizing ? 'Optimizing...' : 'Optimize One-Way'}
                              </button>
                              <button className="driver__optimize-btn" onClick={() => handleOptimize('roundtrip')} disabled={optimizing}>
                                {optimizing ? '...' : 'Optimize Round Trip'}
                              </button>
                            </>
                          ) : (
                            <>
                              <span className="driver__optimize-badge">
                                Route optimized — {optimizeMode === 'oneway' ? 'one-way' : 'round trip'}
                              </span>
                              <button className="driver__optimize-reset" onClick={handleResetOrder}>Reset Order</button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    {optimizeMode && optimizedStops && (
                      <RouteMap
                        stops={optimizedStops}
                        mode={optimizeMode}
                        pharmacy={data.pharmacy}
                        onReorder={(newStops) => {
                          const done = optimizedStops.filter(s => s.status === 'delivered' || s.status === 'failed')
                          setOptimizedStops([...newStops, ...done])
                        }}
                      />
                    )}
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
                            {(optimizedStops || data.stops).map((stop, i) => (
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
                      (() => {
                        const displayStops = optimizedStops || data.stops
                        const undelivered = displayStops.filter(s => s.status !== 'delivered')
                        const deliveredStops = displayStops.filter(s => s.status === 'delivered')
                        const renderStop = (stop) => {
                          const origIdx = data.stops.indexOf(stop)
                          return (
                            <StopCard
                              key={stop._id || origIdx}
                              stop={stop}
                              index={origIdx + 1}
                              total={data.stops.length}
                              isSelected={selected.has(origIdx)}
                              onToggleSelect={() => toggleSelect(origIdx)}
                              onExportDrag={(e) => {
                                const text = getSelectedAddresses()
                                if (text) {
                                  e.dataTransfer.setData('text/plain', text)
                                  e.dataTransfer.effectAllowed = 'copy'
                                }
                              }}
                              deliveryDate={data.deliveryDate}
                              driverName={data.driverName}
                              onDeliveryChange={() => setDeliveryTick(t => t + 1)}
                            />
                          )
                        }
                        return (
                          <>
                            {undelivered.map(renderStop)}
                            {deliveredStops.length > 0 && (
                              <div className="driver__delivered-divider">
                                <span>Completed ({deliveredStops.length})</span>
                              </div>
                            )}
                            {deliveredStops.map(renderStop)}
                          </>
                        )
                      })()
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

            {activeTab === 'stats' && (
              <DriverScorecard driverName={data.driverName} deliveryDate={data.deliveryDate} />
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
