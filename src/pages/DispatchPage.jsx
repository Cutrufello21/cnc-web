import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTenant } from '../context/TenantContext'
import { supabase } from '../lib/supabase'
import { dbInsert, dbUpdate } from '../lib/db'
import useDispatchData from '../hooks/useDispatchData'
import useDispatchActions from '../hooks/useDispatchActions'
import HQDashboard from '../components/dispatch/HQDashboard'
import Payroll from '../components/dispatch/Payroll'
import Analytics from '../components/dispatch/Analytics'
import Orders from '../components/dispatch/Orders'
import Drivers from '../components/dispatch/Drivers'
import Schedule from '../components/dispatch/Schedule'
import Communications from '../components/dispatch/Communications'
import PODRecords from '../components/dispatch/PODRecords'
import RoutesView from '../components/dispatch/RoutesView'
import Pickups from '../components/dispatch/Pickups'
import ThemeToggle from '../components/ThemeToggle'
import BrandMark from '../components/BrandMark'
import './DashboardShell.css'
import './DispatchPage.css'

export default function DispatchPage() {
  const { profile, signOut } = useAuth()
  const { tenant, isLoading: tenantLoading, error: tenantError } = useTenant()
  const tenantName = tenant?.displayName || (tenantLoading || tenantError ? '' : 'CNC Delivery')
  const tenantMonogram = tenantName.trim().split(/\s+/)[0] || ''
  const [view, setView] = useState('routes')
  const [showRouting, setShowRouting] = useState(false)
  const [showSortList, setShowSortList] = useState(false)
  const [showUnassigned, setShowUnassigned] = useState(false)
  const [dismissedWarnings, setDismissedWarnings] = useState(new Set())
  const [lastMove, setLastMove] = useState(null)
  const [undoing, setUndoing] = useState(false)
  const [moveToast, setMoveToast] = useState(null)
  const [zipSearch, setZipSearch] = useState('')
  const [weekOffset, setWeekOffset] = useState(0)
  // Session tracking — persisted in localStorage
  const [sessionCorrections, setSessionCorrections] = useState(() => {
    try { const v = localStorage.getItem('cnc_session_corrections'); return v ? parseInt(v) : 0 } catch { return 0 }
  })
  const [sessionStartTime, setSessionStartTime] = useState(() => {
    try { const v = localStorage.getItem('cnc_session_start'); return v ? parseInt(v) : null } catch { return null }
  })
  const [sessionFinalMinutes, setSessionFinalMinutes] = useState(() => {
    try { const v = localStorage.getItem('cnc_session_final'); return v ? parseInt(v) : null } catch { return null }
  })
  const prevDateRef = useRef(null)

  // AI Dispatch Suggestions
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState(null)
  const [aiApplying, setAiApplying] = useState(false)

  // Data fetching
  const { data, setData, loading, error, selectedDay, setSelectedDay, pendingTimeOff, fetchDispatchData } = useDispatchData(weekOffset)

  // Reset session on date change
  useEffect(() => {
    const dateKey = data?.deliveryDateObj?.toISOString()?.slice(0, 10) || null
    if (dateKey && dateKey !== prevDateRef.current) {
      const savedDate = localStorage.getItem('cnc_session_date')
      if (savedDate !== dateKey) {
        // New date — reset everything
        setSessionCorrections(0)
        setSessionStartTime(null)
        setSessionFinalMinutes(null)
        localStorage.setItem('cnc_session_date', dateKey)
        localStorage.removeItem('cnc_session_corrections')
        localStorage.removeItem('cnc_session_start')
        localStorage.removeItem('cnc_session_final')
      }
      prevDateRef.current = dateKey
    }
  }, [data])

  // Persist to localStorage on changes
  useEffect(() => { localStorage.setItem('cnc_session_corrections', sessionCorrections) }, [sessionCorrections])
  useEffect(() => { if (sessionStartTime) localStorage.setItem('cnc_session_start', sessionStartTime); else localStorage.removeItem('cnc_session_start') }, [sessionStartTime])
  useEffect(() => { if (sessionFinalMinutes != null) localStorage.setItem('cnc_session_final', sessionFinalMinutes); else localStorage.removeItem('cnc_session_final') }, [sessionFinalMinutes])

  function handleDayChange(day) {
    setSelectedDay(day)
    fetchDispatchData(day)
  }

  function handleMoveComplete(moveInfo) {
    setLastMove(moveInfo)
    setSessionCorrections(prev => prev + (moveInfo.count || 1))
    // Start timer on first correction
    if (!sessionStartTime && sessionFinalMinutes == null) {
      setSessionStartTime(Date.now())
    }
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
        const driverInfo = data?.drivers?.find(d => d.name === a.driver_name)
        const driverNumber = a.driver_number || driverInfo?.number || ''
        for (const zip of a.zips) {
          await dbUpdate('daily_stops',
            { driver_name: a.driver_name, driver_number: driverNumber, assigned_driver_number: driverNumber },
            { delivery_date: dateStr, zip },
          )
          await dbUpdate('daily_stops',
            { driver_name: a.driver_name },
            { delivery_date: dateStr, zip },
          )
        }
        for (const zip of a.zips) {
          await dbInsert('dispatch_decisions', {
            delivery_date: dateStr, delivery_day: data?.deliveryDay || '', zip,
            to_driver: a.driver_name, decision_type: 'ai_suggested', context: a.reasoning || '',
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
  const scheduled = data?.scheduledToWork || new Set()
  const isDemo = (d) => d['Driver Name'] === 'Demo Driver' || String(d['Driver #']) === '99999'
  const allActiveDrivers = data?.drivers?.filter((d) => !isDemo(d) && (d.stops > 0 || scheduled.has(d['Driver Name']))) ?? []
  const allInactiveDrivers = data?.drivers?.filter((d) => !isDemo(d) && d.stops === 0 && !scheduled.has(d['Driver Name'])) ?? []

  const driverHasZip = (d) => {
    if (!zipSearch) return true
    return (d.stopDetails || []).some(s => (s.zip || s.ZIP || s['Zip Code'] || '').includes(zipSearch))
  }
  const activeDrivers = allActiveDrivers.filter(driverHasZip)
  const inactiveDrivers = zipSearch ? [] : allInactiveDrivers

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
    handlePreviewCorrections, handleConfirmCorrections, correctionPreview, setCorrectionPreview,
    handlePreviewAndReview, combinedPreview, setCombinedPreview,
    handleForceSendAll, handleForceSendSelected,
    resendAllPreview, setResendAllPreview, handleConfirmResendAll,
    forceDriverSelection, setForceDriverSelection,
  } = useDispatchActions({ data, activeDrivers, setMoveToast, fetchDispatchData, selectedDay, sessionCorrections, sessionStartTime, setSessionFinalMinutes })

  return (
    <div className="shell">
      {/* ── Left Sidebar ──────────────────────────── */}
      <aside className="shell__sidebar">
        <div className="shell__sidebar-brand">
          <span className="shell__pill">{tenantMonogram}</span>
          <span className="shell__title">Dispatch</span>
        </div>

        <nav className="shell__nav">
          {[
            { label: 'Dispatch', items: [
              ['hq', 'HQ', <svg key="i" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>],
              ['routes', 'Routes', <svg key="i" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 18H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.19M15 6h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-3.19"/><rect x="5" y="14" width="4" height="4" rx="2"/><rect x="15" y="14" width="4" height="4" rx="2"/><path d="M9 18h6"/><path d="M3 6l3-3h12l3 3"/></svg>],
            ]},
            { label: 'Records', items: [
              ['pickups', 'Pickups', <svg key="i" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h18"/><polyline points="9 6 3 12 9 18"/><path d="M14 4v16"/></svg>],
              ['pod', 'POD', <svg key="i" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M3 17l4-4 3 3 5-5 6 5"/></svg>],
              ['orders', 'Orders', <svg key="i" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 12h6"/><path d="M9 16h6"/></svg>],
            ]},
            { label: 'Team', items: [
              ['drivers', 'Drivers', <svg key="i" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>],
              ['timeoff', 'Schedule', <svg key="i" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>],
              ['comms', 'Comms', <svg key="i" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>],
            ]},
            { label: 'Finance', items: [
              ['payroll', 'Payroll', <svg key="i" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>],
              ['analytics', 'Analytics', <svg key="i" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>],
            ]},
          ].map((section, sIdx) => (
            <div key={section.label}>
              <span className={`shell__nav-section ${sIdx > 0 ? 'shell__nav-section--mt' : ''}`}>{section.label}</span>
              {section.items.map(([key, label, icon]) => (
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
            </div>
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
        {view === 'pod' && <PODRecords />}
        {view === 'drivers' && <Drivers />}
        {view === 'timeoff' && <Schedule />}
        {view === 'comms' && <Communications />}
        {view === 'pickups' && <Pickups />}

        {view === 'routes' && <RoutesView data={data} loading={loading} error={error} selectedDay={selectedDay} weekOffset={weekOffset} setWeekOffset={setWeekOffset} showRouting={showRouting} setShowRouting={setShowRouting} showSortList={showSortList} setShowSortList={setShowSortList} showUnassigned={showUnassigned} setShowUnassigned={setShowUnassigned} zipSearch={zipSearch} setZipSearch={setZipSearch} handleDayChange={handleDayChange} fetchDispatchData={fetchDispatchData} handleMoveComplete={handleMoveComplete} handleUndo={handleUndo} moveToast={moveToast} setMoveToast={setMoveToast} lastMove={lastMove} undoing={undoing} dismissedWarnings={dismissedWarnings} setDismissedWarnings={setDismissedWarnings} totalStops={totalStops} totalColdChain={totalColdChain} allActiveDrivers={allActiveDrivers} activeDrivers={activeDrivers} inactiveDrivers={inactiveDrivers} sendingRoutes={sendingRoutes} routesSent={routesSent} handleSendRoutes={handleSendRoutes} sentSnapshot={sentSnapshot} resending={resending} handleResendChanges={handleResendChanges} sendingCorrections={sendingCorrections} correctionsSent={correctionsSent} handleSendCorrections={handleSendCorrections} sendingResendCorrections={sendingResendCorrections} handleResendCorrections={handleResendCorrections} sendingForceAll={sendingForceAll} forceAllSent={forceAllSent} handleForceSendAll={handleForceSendAll} sendingCallIns={sendingCallIns} callInsSent={callInsSent} callInPreview={callInPreview} handlePreviewCallIns={handlePreviewCallIns} handleConfirmCallIns={handleConfirmCallIns} correctionPreview={correctionPreview} setCorrectionPreview={setCorrectionPreview} handlePreviewCorrections={handlePreviewCorrections} handleConfirmCorrections={handleConfirmCorrections} handlePreviewAndReview={handlePreviewAndReview} combinedPreview={combinedPreview} setCombinedPreview={setCombinedPreview} resendAllPreview={resendAllPreview} setResendAllPreview={setResendAllPreview} handleConfirmResendAll={handleConfirmResendAll} forceDriverSelection={forceDriverSelection} setForceDriverSelection={setForceDriverSelection} handleForceSendSelected={handleForceSendSelected} sessionCorrections={sessionCorrections} sessionStartTime={sessionStartTime} sessionFinalMinutes={sessionFinalMinutes} routesSent={routesSent} aiLoading={aiLoading} aiResult={aiResult} setAiResult={setAiResult} aiApplying={aiApplying} handleAiSuggest={handleAiSuggest} handleAiApply={handleAiApply}/>}
      </main>
    </div>
  )
}
