import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import useDispatchActions from '../hooks/useDispatchActions'
import HQDashboard from '../components/dispatch/HQDashboard'
import Payroll from '../components/dispatch/Payroll'
import Analytics from '../components/dispatch/Analytics'
import Orders from '../components/dispatch/Orders'
import Drivers from '../components/dispatch/Drivers'
import Schedule from '../components/dispatch/Schedule'
import RoutesView from '../components/dispatch/RoutesView'
import ThemeToggle from '../components/ThemeToggle'
import BrandMark from '../components/BrandMark'
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
  const [showRouting, setShowRouting] = useState(false)
  const [showSortList, setShowSortList] = useState(false)
  const [showUnassigned, setShowUnassigned] = useState(false)
  const [dismissedWarnings, setDismissedWarnings] = useState(new Set())
  const [lastMove, setLastMove] = useState(null) // { orderIds, fromName, fromNumber, toName, count }
  const [undoing, setUndoing] = useState(false)
  const [moveToast, setMoveToast] = useState(null)
  const [zipSearch, setZipSearch] = useState('')
  const [pendingTimeOff, setPendingTimeOff] = useState(0)
  const [weekOffset, setWeekOffset] = useState(0)
  // AI Dispatch Suggestions
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState(null)
  const [aiApplying, setAiApplying] = useState(false)

  useEffect(() => {
    fetchDispatchData()
    supabase.from('time_off_requests').select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then(({ count }) => setPendingTimeOff(count || 0))
  }, [weekOffset])

  async function fetchDispatchData(day) {
    if (!data) setLoading(true) // Only show spinner on first load
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
        if (todayIdx === 0 && hour >= 13) {
          // Sunday after 1 PM — show Monday
          deliveryDay = 'Monday'
        } else if (hour >= 18) {
          // After 6 PM — show next business day
          if (todayIdx === 5) deliveryDay = 'Monday'       // Fri evening → Monday
          else if (todayIdx === 6) deliveryDay = 'Monday'   // Saturday → Monday
          else deliveryDay = dayNames[todayIdx + 1]          // Weeknight → tomorrow
        } else {
          // Before cutover — show today (weekends show nearest weekday)
          if (todayIdx === 0) deliveryDay = 'Monday'
          else if (todayIdx === 6) deliveryDay = 'Friday'
          else deliveryDay = dayNames[todayIdx]
        }
      }

      // Get target week's date for the selected day
      const dayOfWeek = now.getDay()
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
      const monday = new Date(now)
      monday.setDate(now.getDate() + mondayOffset + (weekOffset * 7))
      const dayIndex = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].indexOf(deliveryDay)
      const deliveryDate = new Date(monday)
      deliveryDate.setDate(monday.getDate() + (dayIndex >= 0 ? dayIndex : 0))
      const dateStr = `${deliveryDate.getFullYear()}-${String(deliveryDate.getMonth() + 1).padStart(2, '0')}-${String(deliveryDate.getDate()).padStart(2, '0')}`

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

      // Check schedule, time off, and overrides for today
      const [timeOffRes2, schedRes2, overRes2] = await Promise.all([
        supabase.from('time_off_requests').select('driver_name').eq('date_off', dateStr).in('status', ['approved', 'pending']),
        supabase.from('driver_schedule').select('*'),
        supabase.from('schedule_overrides').select('*').eq('date', dateStr),
      ])
      const driversOff = new Set((timeOffRes2.data || []).map(r => r.driver_name))
      const schedMap = {}
      ;(schedRes2.data || []).forEach(r => { schedMap[r.driver_name] = r })
      const overMap = {}
      ;(overRes2.data || []).forEach(r => { overMap[r.driver_name] = r })
      const dayCol = deliveryDay.slice(0, 3).toLowerCase()

      // Determine which drivers are scheduled to work today
      const scheduledToWork = new Set()
      drivers.forEach(d => {
        if (driversOff.has(d.driver_name)) return
        const override = overMap[d.driver_name]
        if (override) { if (override.status === 'working') scheduledToWork.add(d.driver_name); return }
        const sched = schedMap[d.driver_name]
        if (!sched || (sched[dayCol] !== false && sched[dayCol] !== 'false' && sched[dayCol] !== 0)) {
          scheduledToWork.add(d.driver_name)
        }
      })

      // Group stops by driver
      const normalizeAddr = (a) => (a || '').toLowerCase().trim().replace(/\s+/g, ' ')
        .replace(/\bboulevard\b/g, 'blvd').replace(/\bdrive\b/g, 'dr').replace(/\bstreet\b/g, 'st')
        .replace(/\bavenue\b/g, 'ave').replace(/\broad\b/g, 'rd').replace(/\blane\b/g, 'ln')
        .replace(/\bcourt\b/g, 'ct').replace(/\bplace\b/g, 'pl').replace(/\bcircle\b/g, 'cir')
        .replace(/\bparkway\b/g, 'pkwy').replace(/\bhighway\b/g, 'hwy').replace(/\bsuite\b/g, 'ste')
        .replace(/\bapartment\b/g, 'apt').replace(/\bnorth\b/g, 'n').replace(/\bsouth\b/g, 's')
        .replace(/\beast\b/g, 'e').replace(/\bwest\b/g, 'w').replace(/\bnortheast\b/g, 'ne')
        .replace(/\bnorthwest\b/g, 'nw').replace(/\bsoutheast\b/g, 'se').replace(/\bsouthwest\b/g, 'sw')
        .replace(/[.,#]/g, '').replace(/\s+/g, ' ').replace(/\b(ste|suite|unit|apt)\b\s*/g, '').trim()
      const driverStops = {}
      stops.forEach(s => {
        if (!driverStops[s.driver_name]) {
          driverStops[s.driver_name] = { stops: 0, coldChain: 0, totalPackages: 0, stopDetails: [] }
        }
        const ds = driverStops[s.driver_name]
        ds.stops++
        if (s.cold_chain) ds.coldChain++
        ds.stopDetails.push({
          'Order ID': s.order_id, Name: s.patient_name,
          Address: s.address, City: s.city, ZIP: s.zip,
          Pharmacy: s.pharmacy, 'Cold Chain': s.cold_chain ? 'Yes' : '',
          _coldChain: s.cold_chain, Notes: s.notes || '',
          _status: s.status || 'dispatched', _stopId: s.id,
        })
      })

      // Consolidate stops by address within each driver
      for (const dName of Object.keys(driverStops)) {
        const ds = driverStops[dName]
        const rawDetails = ds.stopDetails
        const addrGroups = {}
        for (const stop of rawDetails) {
          const key = normalizeAddr(stop.Address)
          if (!addrGroups[key]) addrGroups[key] = []
          addrGroups[key].push(stop)
        }
        const consolidated = []
        const seen = new Set()
        for (const stop of rawDetails) {
          const key = normalizeAddr(stop.Address)
          if (seen.has(key)) continue
          seen.add(key)
          const group = addrGroups[key]
          if (group.length === 1) {
            consolidated.push({ ...group[0], _packageCount: 1, _consolidatedOrderIds: [group[0]['Order ID']] })
          } else {
            const primary = { ...group[0] }
            primary._packageCount = group.length
            primary._coldChain = group.some(s => s._coldChain)
            primary['Cold Chain'] = primary._coldChain ? 'Yes' : ''
            primary.Notes = group.map(s => s.Notes).filter(Boolean).join(' | ')
            primary._consolidatedOrderIds = group.map(s => s['Order ID'])
            primary._consolidatedNames = group.map(s => s.Name)
            consolidated.push(primary)
          }
        }
        ds.totalPackages = ds.stops
        ds.consolidatedStops = consolidated.length
        ds.stopDetails = consolidated
      }

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
      // Drivers who are off but have stops assigned
      for (const offDriver of driversOff) {
        const ds = driverStops[offDriver]
        if (ds && ds.stops > 0) {
          warnings.push({
            type: 'driver-off',
            severity: 'high',
            message: `${offDriver} is OFF but has ${ds.stops} stops assigned — reassign them`,
            details: [offDriver],
          })
        }
      }

      setData({
        deliveryDay,
        deliveryDateObj: deliveryDate,
        weekMonday: monday,
        scheduledToWork,
        allDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        drivers: drivers.map(d => ({
          'Driver Name': d.driver_name,
          'Driver #': d.driver_number,
          Pharmacy: d.pharmacy || '',
          Email: d.email,
          isOff: driversOff.has(d.driver_name),
          stops: driverStops[d.driver_name]?.consolidatedStops ?? driverStops[d.driver_name]?.stops ?? 0,
          totalPackages: driverStops[d.driver_name]?.totalPackages ?? driverStops[d.driver_name]?.stops ?? 0,
          coldChain: driverStops[d.driver_name]?.coldChain ?? 0,
          hidden: false,
          tabName: `${d.driver_name} - ${d.driver_number}`,
          stopDetails: driverStops[d.driver_name]?.stopDetails ?? [],
        })),
        summary: null,
        unassigned: (driverStops['Unassigned']?.stopDetails || []).map(s => ({
          zip: s.ZIP, pharmacy: s.Pharmacy, city: s.City,
          name: s.Name, order_id: s['Order ID'], address: s.Address,
          _stopId: s._stopId,
        })),
        warnings,
        recentLogs,
        routingRuleCount: routingRules.length,
        assignedZipCount: assignedZips.size,
      })
      setSelectedDay(deliveryDay)

      // Snapshot initial assignments if not already captured for this date
      if (stops.length > 0) {
        fetch('/api/dispatch-log-decision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'snapshot_initial', deliveryDate: dateStr, deliveryDay }),
        }).catch(() => {})
      }
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
    fetchDispatchData(selectedDay)
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


  // ── AI Dispatch Suggestions ────────────────────────────────────
  async function handleAiSuggest() {
    if (aiLoading) return
    setAiLoading(true)
    setAiResult(null)
    try {
      const dateStr = data?.deliveryDateObj
        ? `${data.deliveryDateObj.getFullYear()}-${String(data.deliveryDateObj.getMonth()+1).padStart(2,'0')}-${String(data.deliveryDateObj.getDate()).padStart(2,'0')}`
        : ''
      if (!dateStr) throw new Error('No delivery date')
      const res = await fetch(`/api/ai-dispatch?date=${dateStr}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setAiResult(json)
    } catch (err) {
      setMoveToast(`AI error: ${err.message}`)
      setAiLoading(false)
    } finally {
      setAiLoading(false)
    }
  }

  async function handleAiApply() {
    if (aiApplying || !aiResult?.assignments?.length) return
    setAiApplying(true)
    try {
      const dateStr = data?.deliveryDateObj
        ? `${data.deliveryDateObj.getFullYear()}-${String(data.deliveryDateObj.getMonth()+1).padStart(2,'0')}-${String(data.deliveryDateObj.getDate()).padStart(2,'0')}`
        : ''
      let totalMoved = 0
      for (const a of aiResult.assignments) {
        if (!a.zips?.length || !a.driver_name) continue
        // Find driver_number from drivers in data
        const driverInfo = data?.drivers?.find(d => d.name === a.driver_name)
        const driverNumber = a.driver_number || driverInfo?.number || ''
        // Update all stops matching these ZIPs to this driver
        for (const zip of a.zips) {
          await fetch('/api/db', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              table: 'daily_stops',
              operation: 'update',
              data: {
                driver_name: a.driver_name,
                driver_number: driverNumber,
                assigned_driver_number: driverNumber,
              },
              match: { delivery_date: dateStr, zip },
            }),
          })
          // Also sync orders table
          await fetch('/api/db', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              table: 'orders',
              operation: 'update',
              data: { driver_name: a.driver_name },
              match: { date_delivered: dateStr, zip },
            }),
          })
        }
        // Log as AI suggestion in dispatch_decisions
        for (const zip of a.zips) {
          await fetch('/api/db', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              table: 'dispatch_decisions',
              operation: 'insert',
              data: {
                delivery_date: dateStr,
                delivery_day: data?.deliveryDay || '',
                zip,
                to_driver: a.driver_name,
                decision_type: 'ai_suggested',
                context: a.reasoning || '',
              },
            }),
          })
        }
        totalMoved += a.stop_count || 0
      }
      setMoveToast(`AI applied ${totalMoved} assignments across ${aiResult.assignments.filter(a => a.stop_count > 0).length} drivers`)
      setAiResult(null)
      fetchDispatchData(selectedDay)
    } catch (err) {
      setMoveToast(`AI apply error: ${err.message}`)
    } finally {
      setAiApplying(false)
    }
  }

  const totalStops = data?.drivers?.reduce((sum, d) => sum + (d.stops || 0), 0) ?? 0
  const totalColdChain = data?.drivers?.reduce((sum, d) => sum + (d.coldChain || 0), 0) ?? 0
  // Active = has stops OR is scheduled to work today
  const scheduled = data?.scheduledToWork || new Set()
  const allActiveDrivers = data?.drivers?.filter((d) => d.stops > 0 || scheduled.has(d['Driver Name'])) ?? []
  const allInactiveDrivers = data?.drivers?.filter((d) => d.stops === 0 && !scheduled.has(d['Driver Name'])) ?? []

  // Filter by ZIP search
  const driverHasZip = (d) => {
    if (!zipSearch) return true
    return (d.stopDetails || []).some(s =>
      (s.zip || s.ZIP || s['Zip Code'] || '').includes(zipSearch)
    )
  }
  const activeDrivers = allActiveDrivers.filter(driverHasZip)
  const inactiveDrivers = zipSearch ? [] : allInactiveDrivers

  // Send/email actions — managed by useDispatchActions hook
  const {
    sendingRoutes, routesSent,
    sendingCorrections, correctionsSent,
    sendingForceAll, forceAllSent,
    sendingResendCorrections,
    sentSnapshot, resending,
    sendingCallIns, callInsSent, callInPreview,
    handlePreviewCallIns, handleConfirmCallIns,
    handleSendRoutes, handleResendChanges,
    handleSendCorrections, handleResendCorrections,
    handleForceSendAll,
  } = useDispatchActions({ data, activeDrivers, setMoveToast, fetchDispatchData, selectedDay })

  return (
    <div className="shell">
      {/* ── Left Sidebar ──────────────────────────── */}
      <aside className="shell__sidebar">
        <div className="shell__sidebar-brand">
          <span className="shell__pill">CNC</span>
          <span className="shell__title">Dispatch</span>
        </div>

        <nav className="shell__nav">
          <span className="shell__nav-section">Main</span>
          {[
            ['hq', 'HQ', <svg key="i" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>],
            ['routes', 'Routes', <svg key="i" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 18H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.19M15 6h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-3.19"/><rect x="5" y="14" width="4" height="4" rx="2"/><rect x="15" y="14" width="4" height="4" rx="2"/><path d="M9 18h6"/><path d="M3 6l3-3h12l3 3"/></svg>],
            ['payroll', 'Payroll', <svg key="i" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>],
            ['analytics', 'Analytics', <svg key="i" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>],
            ['orders', 'Orders', <svg key="i" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 12h6"/><path d="M9 16h6"/></svg>],
            ['drivers', 'Drivers', <svg key="i" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>],
            ['timeoff', 'Schedule', <svg key="i" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>],
          ].map(([key, label, icon]) => (
            <button
              key={key}
              className={`shell__nav-btn ${view === key ? 'shell__nav-btn--active' : ''} ${key === 'timeoff' && pendingTimeOff > 0 ? 'shell__nav-btn--alert' : ''}`}
              onClick={() => setView(key)}
            >
              {icon}
              <span>{label}</span>
              {key === 'timeoff' && pendingTimeOff > 0 && (
                <span className="shell__view-badge">{pendingTimeOff}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="shell__sidebar-footer">
          <ThemeToggle />
          <div className="shell__sidebar-user">
            <span className="shell__name">{profile?.full_name}</span>
            <button className="shell__signout" onClick={signOut}>Sign Out</button>
          </div>
        </div>
      </aside>

      {/* ── Main Content ──────────────────────────── */}
      <main className="shell__main">
        {view === 'hq' && <HQDashboard />}
        {view === 'payroll' && <Payroll />}
        {view === 'analytics' && <Analytics />}
        {view === 'orders' && <Orders />}
        {view === 'drivers' && <Drivers />}
        {view === 'timeoff' && <Schedule />}

        {view === 'routes' && <RoutesView data={data} loading={loading} error={error} selectedDay={selectedDay} weekOffset={weekOffset} setWeekOffset={setWeekOffset} showRouting={showRouting} setShowRouting={setShowRouting} showSortList={showSortList} setShowSortList={setShowSortList} showUnassigned={showUnassigned} setShowUnassigned={setShowUnassigned} zipSearch={zipSearch} setZipSearch={setZipSearch} handleDayChange={handleDayChange} fetchDispatchData={fetchDispatchData} handleMoveComplete={handleMoveComplete} handleUndo={handleUndo} moveToast={moveToast} setMoveToast={setMoveToast} lastMove={lastMove} undoing={undoing} dismissedWarnings={dismissedWarnings} setDismissedWarnings={setDismissedWarnings} totalStops={totalStops} totalColdChain={totalColdChain} allActiveDrivers={allActiveDrivers} activeDrivers={activeDrivers} inactiveDrivers={inactiveDrivers} sendingRoutes={sendingRoutes} routesSent={routesSent} handleSendRoutes={handleSendRoutes} sentSnapshot={sentSnapshot} resending={resending} handleResendChanges={handleResendChanges} sendingCorrections={sendingCorrections} correctionsSent={correctionsSent} handleSendCorrections={handleSendCorrections} sendingResendCorrections={sendingResendCorrections} handleResendCorrections={handleResendCorrections} sendingForceAll={sendingForceAll} forceAllSent={forceAllSent} handleForceSendAll={handleForceSendAll} sendingCallIns={sendingCallIns} callInsSent={callInsSent} callInPreview={callInPreview} handlePreviewCallIns={handlePreviewCallIns} handleConfirmCallIns={handleConfirmCallIns} aiLoading={aiLoading} aiResult={aiResult} setAiResult={setAiResult} aiApplying={aiApplying} handleAiSuggest={handleAiSuggest} handleAiApply={handleAiApply}/>}
      </main>
    </div>
  )
}

