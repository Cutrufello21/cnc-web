import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import DriverCard from '../components/dispatch/DriverCard'
import WarningBanner from '../components/dispatch/WarningBanner'
import DispatchSummary from '../components/dispatch/DispatchSummary'
import RecentLog from '../components/dispatch/RecentLog'
import SheetViewer from '../components/dispatch/SheetViewer'
import HQDashboard from '../components/dispatch/HQDashboard'
import RoutingEditor from '../components/dispatch/RoutingEditor'
import Payroll from '../components/dispatch/Payroll'
import Analytics from '../components/dispatch/Analytics'
import Orders from '../components/dispatch/Orders'
import WeatherWidget from '../components/dispatch/WeatherWidget'
import StopDistribution from '../components/dispatch/StopDistribution'
import ThemeToggle from '../components/ThemeToggle'
import './DashboardShell.css'
import './DispatchPage.css'

export default function DispatchPage() {
  const { profile, signOut } = useAuth()
  const [view, setView] = useState('routes')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [approving, setApproving] = useState(false)
  const [approved, setApproved] = useState(false)
  const [selectedDay, setSelectedDay] = useState(null)
  const [dismissedWarnings, setDismissedWarnings] = useState(new Set())
  const [lastMove, setLastMove] = useState(null) // { orderIds, fromName, fromNumber, toName, count }
  const [undoing, setUndoing] = useState(false)
  const [moveToast, setMoveToast] = useState(null)

  useEffect(() => {
    fetchDispatchData()
  }, [])

  async function fetchDispatchData(day) {
    setLoading(true)
    setError(null)
    setApproved(false)
    try {
      // Determine delivery day
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      const now = new Date()
      const hour = now.getHours()
      const todayIdx = now.getDay()
      let deliveryDay = day

      if (!deliveryDay) {
        if (hour >= 17) {
          deliveryDay = todayIdx === 5 || todayIdx === 6 ? 'Monday' : dayNames[todayIdx + 1]
        } else {
          deliveryDay = todayIdx === 0 ? 'Monday' : todayIdx === 6 ? 'Friday' : dayNames[todayIdx]
        }
      }

      // Get this week's date for the selected day
      const dayOfWeek = now.getDay()
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
      const monday = new Date(now)
      monday.setDate(now.getDate() + mondayOffset)
      const dayIndex = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].indexOf(deliveryDay)
      const deliveryDate = new Date(monday)
      deliveryDate.setDate(monday.getDate() + (dayIndex >= 0 ? dayIndex : 0))
      const dateStr = deliveryDate.toISOString().split('T')[0]

      // Fetch everything from Supabase in parallel
      const [driversRes, routingRes, logsRes, stopsRes] = await Promise.all([
        supabase.from('drivers').select('*').eq('active', true).order('driver_name'),
        supabase.from('routing_rules').select('*'),
        supabase.from('dispatch_logs').select('*').order('date', { ascending: false }).limit(7),
        supabase.from('daily_stops').select('*').eq('delivery_date', dateStr),
      ])

      const drivers = (driversRes.data || []).filter(d => d.driver_name)
      const routingRules = routingRes.data || []
      const assignedZips = new Set(routingRules.map(r => r.zip_code).filter(Boolean))
      const stops = stopsRes.data || []

      // Group stops by driver
      const driverStops = {}
      stops.forEach(s => {
        if (!driverStops[s.driver_name]) {
          driverStops[s.driver_name] = { stops: 0, coldChain: 0, stopDetails: [] }
        }
        const ds = driverStops[s.driver_name]
        ds.stops++
        if (s.cold_chain) ds.coldChain++
        ds.stopDetails.push({
          'Order ID': s.order_id, Name: s.patient_name,
          Address: s.address, City: s.city, ZIP: s.zip,
          Pharmacy: s.pharmacy, 'Cold Chain': s.cold_chain ? 'Yes' : '',
          _coldChain: s.cold_chain,
        })
      })

      const WEEKDAYS = new Set(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])
      const recentLogs = (logsRes.data || [])
        .filter(r => WEEKDAYS.has(r.delivery_day))
        .slice(0, 7)
        .map(r => ({
          Date: r.date, 'Delivery Day': r.delivery_day,
          'Orders Processed': r.orders_processed, 'Cold Chain': r.cold_chain,
          'Unassigned Count': r.unassigned_count, Status: r.status,
          'Top Driver': r.top_driver,
        }))

      // Build warnings
      const warnings = []
      // Check for unassigned (stops with no driver or driver_name is empty)
      // For now, no unassigned tracking from Supabase - that can be added later

      setData({
        deliveryDay,
        allDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        drivers: drivers.map(d => ({
          'Driver Name': d.driver_name,
          'Driver #': d.driver_number,
          Email: d.email,
          stops: driverStops[d.driver_name]?.stops ?? 0,
          coldChain: driverStops[d.driver_name]?.coldChain ?? 0,
          hidden: false,
          tabName: `${d.driver_name} - ${d.driver_number}`,
          stopDetails: driverStops[d.driver_name]?.stopDetails ?? [],
        })),
        summary: null,
        unassigned: [],
        warnings,
        recentLogs,
        routingRuleCount: routingRules.length,
        assignedZipCount: assignedZips.size,
      })
      setSelectedDay(deliveryDay)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleDayChange(day) {
    setSelectedDay(day)
    fetchDispatchData(day)
  }

  function handleMoveComplete(moveInfo) {
    setLastMove(moveInfo)
    setMoveToast(`Moved ${moveInfo.count} stop${moveInfo.count > 1 ? 's' : ''} to ${moveInfo.toName}`)
  }

  async function handleUndo() {
    if (!lastMove) return
    setUndoing(true)
    try {
      const { data: updated, error } = await supabase.from('daily_stops')
        .update({
          driver_name: lastMove.fromName,
          driver_number: lastMove.fromNumber,
          assigned_driver_number: lastMove.fromNumber,
        })
        .in('order_id', lastMove.orderIds)
        .eq('driver_name', lastMove.toName)
        .select()

      if (error) throw new Error(error.message)
      setMoveToast(`Undone — ${updated?.length || lastMove.count} stop${lastMove.count > 1 ? 's' : ''} back to ${lastMove.fromName}`)
      setLastMove(null)
      fetchDispatchData(selectedDay)
    } catch (err) {
      setMoveToast(`Undo error: ${err.message}`)
    } finally {
      setUndoing(false)
    }
  }

  async function handleApprove() {
    setApproving(true)
    try {
      const res = await fetch('/api/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve' }) })
      if (!res.ok) throw new Error('Approval failed')
      setApproved(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setApproving(false)
    }
  }

  const totalStops = data?.drivers?.reduce((sum, d) => sum + (d.stops || 0), 0) ?? 0
  const totalColdChain = data?.drivers?.reduce((sum, d) => sum + (d.coldChain || 0), 0) ?? 0
  const activeDrivers = data?.drivers?.filter((d) => d.stops > 0) ?? []
  const inactiveDrivers = data?.drivers?.filter((d) => d.stops === 0) ?? []

  return (
    <div className="shell">
      <header className="shell__header">
        <div className="container shell__header-inner">
          <div className="shell__brand">
            <span className="shell__logo">CNC</span>
            <span className="shell__title">Dispatch</span>
            <div className="shell__view-toggle">
              {[
                ['hq', 'HQ'],
                ['routes', 'Routes'],
                ['payroll', 'Payroll'],
                ['analytics', 'Analytics'],
                ['orders', 'Orders'],
                ['routing', 'Routing Rules'],
                ['sheets', 'Sheets'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  className={`shell__view-btn ${view === key ? 'shell__view-btn--active' : ''}`}
                  onClick={() => setView(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="shell__user">
            <WeatherWidget />
            <ThemeToggle />
            <span className="shell__name">{profile?.full_name}</span>
            <button className="shell__signout" onClick={signOut}>Sign Out</button>
          </div>
        </div>
      </header>

      <main className="shell__main container">
        {view === 'hq' && <HQDashboard />}
        {view === 'routing' && <RoutingEditor />}
        {view === 'payroll' && <Payroll />}
        {view === 'analytics' && <Analytics />}
        {view === 'orders' && <Orders />}
        {view === 'sheets' && <SheetViewer />}

        {view === 'routes' && loading && (
          <div className="dispatch__loading">
            <div className="dispatch__spinner" />
            <p>Loading dispatch data from sheets...</p>
          </div>
        )}

        {view === 'routes' && error && (
          <div className="dispatch__error">
            <p>{error}</p>
            <button onClick={fetchDispatchData}>Retry</button>
          </div>
        )}

        {view === 'routes' && data && !loading && (
          <>
            {/* Day selector */}
            <div className="dispatch__days">
              {(data.allDays || ['Monday','Tuesday','Wednesday','Thursday','Friday']).map((day) => (
                <button
                  key={day}
                  className={`dispatch__day ${selectedDay === day ? 'dispatch__day--active' : ''}`}
                  onClick={() => handleDayChange(day)}
                >
                  {day.slice(0, 3)}
                </button>
              ))}
            </div>

            {/* Header row */}
            <div className="dispatch__top">
              <div>
                <h1 className="dispatch__heading">
                  {data.deliveryDay} Delivery
                </h1>
                <p className="dispatch__date">
                  {new Date().toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
              <div className="dispatch__actions">
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
                <button
                  className="dispatch__refresh"
                  onClick={() => fetchDispatchData(selectedDay)}
                  title="Refresh data"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                    <path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                  </svg>
                  Refresh
                </button>
                <button
                  className={`dispatch__approve ${approved ? 'dispatch__approve--done' : ''}`}
                  onClick={handleApprove}
                  disabled={approving || approved || totalStops === 0}
                >
                  {approved ? 'Approved' : approving ? 'Approving...' : 'Approve Routes'}
                </button>
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
              activeDriverCount={activeDrivers.length}
              totalDriverCount={data.drivers?.length ?? 0}
              unassignedCount={data.unassigned?.length ?? 0}
              routingRuleCount={data.routingRuleCount ?? 0}
            />

            {/* Stop distribution */}
            <StopDistribution drivers={data.drivers} />

            {/* Active drivers */}
            <section className="dispatch__section">
              <h2 className="dispatch__section-title">
                Active Drivers
                <span className="dispatch__section-count">{activeDrivers.length}</span>
              </h2>
              <div className="dispatch__drivers">
                {activeDrivers
                  .sort((a, b) => (b.stops || 0) - (a.stops || 0))
                  .map((driver) => (
                    <DriverCard
                      key={driver['Driver Name']}
                      driver={driver}
                      allDrivers={data.drivers}
                      selectedDay={selectedDay}
                      onRefresh={() => fetchDispatchData(selectedDay)}
                      onMoveComplete={handleMoveComplete}
                    />
                  ))}
              </div>
            </section>

            {/* Inactive drivers */}
            {inactiveDrivers.length > 0 && (
              <section className="dispatch__section">
                <h2 className="dispatch__section-title">
                  No Stops Today
                  <span className="dispatch__section-count dispatch__section-count--muted">
                    {inactiveDrivers.length}
                  </span>
                </h2>
                <div className="dispatch__drivers dispatch__drivers--inactive">
                  {inactiveDrivers.map((driver) => (
                    <DriverCard
                      key={driver['Driver Name']}
                      driver={driver}
                      inactive
                      allDrivers={data.drivers}
                      selectedDay={selectedDay}
                      onRefresh={() => fetchDispatchData(selectedDay)}
                      onMoveComplete={handleMoveComplete}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Unassigned orders */}
            {data.unassigned?.length > 0 && !dismissedWarnings.has('unassigned-section') && (
              <UnassignedSection
                unassigned={data.unassigned}
                drivers={data.drivers}
                selectedDay={selectedDay}
                onRefresh={() => fetchDispatchData(selectedDay)}
                onDismiss={() => setDismissedWarnings(prev => new Set([...prev, 'unassigned', 'unassigned-section']))}
              />
            )}

            {/* Recent dispatch log */}
            {data.recentLogs?.length > 0 && (
              <RecentLog logs={data.recentLogs} />
            )}
          </>
        )}
      </main>
    </div>
  )
}

function UnassignedSection({ unassigned, drivers, selectedDay, onRefresh, onDismiss }) {
  const [assigning, setAssigning] = useState(null)

  async function handleAssign(order, driverTabName) {
    if (!driverTabName) return
    setAssigning(order['Order ID'])
    try {
      const res = await fetch('/api/reassign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          day: selectedDay,
          fromDriver: 'Unassigned',
          toDriver: driverTabName,
          orderIds: [order['Order ID'] || order['Order_ID']],
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (onRefresh) setTimeout(onRefresh, 500)
    } catch {
      // Will refresh anyway
    } finally {
      setAssigning(null)
    }
  }

  const driverOptions = drivers?.filter(d => d.tabName) || []

  return (
    <section className="dispatch__section">
      <div className="dispatch__section-header">
        <h2 className="dispatch__section-title dispatch__section-title--warn">
          Unassigned Orders
          <span className="dispatch__section-count dispatch__section-count--warn">
            {unassigned.length}
          </span>
        </h2>
        <button className="dispatch__dismiss" onClick={onDismiss}>Dismiss</button>
      </div>
      <div className="dispatch__table-wrap">
        <table className="dispatch__table">
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Name</th>
              <th>Address</th>
              <th>City</th>
              <th>ZIP</th>
              <th>Status</th>
              <th>Assign To</th>
            </tr>
          </thead>
          <tbody>
            {unassigned.map((u, i) => {
              const oid = u['Order ID'] || u['Order_ID'] || ''
              return (
                <tr key={i}>
                  <td>{oid || '—'}</td>
                  <td>{u['Name'] || u['Patient'] || '—'}</td>
                  <td>{u['Address'] || '—'}</td>
                  <td>{u['City'] || '—'}</td>
                  <td className="dispatch__zip">{u['ZIP'] || '—'}</td>
                  <td>{u['Status'] || '—'}</td>
                  <td>
                    {assigning === oid ? (
                      <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>Moving...</span>
                    ) : (
                      <select
                        className="dispatch__assign-select"
                        defaultValue=""
                        onChange={(e) => handleAssign(u, e.target.value)}
                      >
                        <option value="">Assign...</option>
                        {driverOptions.map(d => (
                          <option key={d.tabName} value={d.tabName}>
                            {d['Driver Name']} ({d.stops})
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
