import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { dbDelete } from '../lib/db'
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
import Drivers from '../components/dispatch/Drivers'
import TimeOff from '../components/dispatch/TimeOff'
import SortList from '../components/dispatch/SortList'
import WeatherWidget from '../components/dispatch/WeatherWidget'
import StopDistribution from '../components/dispatch/StopDistribution'
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
  const [sendingCallIns, setSendingCallIns] = useState(false)
  const [callInsSent, setCallInsSent] = useState(false)
  const [callInPreview, setCallInPreview] = useState(null)
  const [pendingTimeOff, setPendingTimeOff] = useState(0)
  const [weekOffset, setWeekOffset] = useState(0)
  const [optimizing, setOptimizing] = useState(false)
  const [optimizePreview, setOptimizePreview] = useState(null)

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

      // Check for drivers off today
      const { data: timeOffData } = await supabase.from('time_off_requests')
        .select('driver_name').eq('date_off', dateStr).in('status', ['approved', 'pending'])
      const driversOff = new Set((timeOffData || []).map(r => r.driver_name))

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
          _coldChain: s.cold_chain, Notes: s.notes || '',
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
        allDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        drivers: drivers.map(d => ({
          'Driver Name': d.driver_name,
          'Driver #': d.driver_number,
          Pharmacy: d.pharmacy || '',
          Email: d.email,
          isOff: driversOff.has(d.driver_name),
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

  async function handleOptimize(mode = 'preview') {
    if (!data?.deliveryDateObj) return
    setOptimizing(true)
    try {
      const dateStr = `${data.deliveryDateObj.getFullYear()}-${String(data.deliveryDateObj.getMonth()+1).padStart(2,'0')}-${String(data.deliveryDateObj.getDate()).padStart(2,'0')}`
      const res = await fetch('/api/auto-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deliveryDate: dateStr, deliveryDay: data.deliveryDay, mode }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error)

      if (mode === 'apply') {
        // Log accepted optimize decisions
        fetch('/api/dispatch-log-decision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'log_optimize',
            deliveryDate: dateStr,
            deliveryDay: data.deliveryDay,
            accepted: true,
            changes: optimizePreview?.changes || result.changes || [],
          }),
        }).catch(() => {})
        setOptimizePreview(null)
        fetchDispatchData(data.deliveryDay)
      } else {
        setOptimizePreview(result)
      }
    } catch (err) {
      alert('Optimize error: ' + err.message)
    } finally {
      setOptimizing(false)
    }
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

  const [sendingRoutes, setSendingRoutes] = useState(false)
  const [routesSent, setRoutesSent] = useState(false)
  const [sendingCorrections, setSendingCorrections] = useState(false)
  const [correctionsSent, setCorrectionsSent] = useState(false)
  const [sentSnapshot, setSentSnapshot] = useState(null) // { driverName: Set of orderIds }
  const [resending, setResending] = useState(false)
  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxw2xx2atYfnEfGzCaTmkDShmt96D1JsLFSckScOndB94RV2IGev63fpS7Ndc0GqSHWWQ/exec'
  const TEST_MODE = false
  const TEST_EMAIL = 'dom@cncdeliveryservice.com'

  function buildDriverEmail(name, stops, cc, dayStr) {
    const ccLine = cc > 0 ? ` — ${cc} are cold chain.` : '.'
    return `<div style="font-family:-apple-system,sans-serif;max-width:500px">
      <h2 style="color:#0A2463">CNC Delivery</h2>
      <p>Hi ${name},</p>
      <p>You have <strong>${stops} stops</strong> for ${dayStr}${ccLine}</p>
      <p><a href="https://cncdelivery.com/driver" style="display:inline-block;padding:12px 24px;background:#0A2463;color:white;text-decoration:none;border-radius:8px;font-weight:600">View Your Route</a></p>
      <p style="color:#6b7280;font-size:13px">CNC Delivery</p>
    </div>`
  }

  function takeSnapshot() {
    // Save current state: which order IDs belong to which driver
    const snap = {}
    for (const d of (data?.drivers || [])) {
      const name = d['Driver Name']
      const ids = (d.stopDetails || []).map(s => s['Order ID']).filter(Boolean)
      if (ids.length > 0) snap[name] = new Set(ids)
    }
    return snap
  }

  const CALL_IN_ZIPS = new Set([
    '43450','43903','43908','43945','43986','43988',
    '44134','44136','44141','44147','44203','44216','44217','44230','44270','44273','44276','44281','44314',
    '44423','44427','44460',
    '44606','44607','44608','44612','44613','44620','44624','44625','44626','44627','44629','44632','44634',
    '44645','44651','44659','44662','44672','44675','44678','44681','44683','44691','44695','44697',
  ])

  function handlePreviewCallIns() {
    if (!data?.drivers) return
    const allStops = data.drivers.flatMap(d => (d.stopDetails || []))
    const callIns = allStops.filter(s => {
      const zip = s.zip || s.ZIP || s['Zip Code']
      const pharma = (s.pharmacy || s.Pharmacy || '').toLowerCase()
      return CALL_IN_ZIPS.has(zip) && pharma !== 'shsp'
    })
    if (callIns.length === 0) {
      alert('No call-in orders found for today.')
      return
    }
    setCallInPreview(callIns.map(s => ({
      orderId: s.order_id || s['Order ID'],
      address: s.address || s.Address,
      city: s.city || s.City || '',
      name: s.patient_name || s.Name,
      zip: s.zip || s.ZIP || s['Zip Code'],
    })))
  }

  async function handleConfirmCallIns() {
    if (!callInPreview?.length) return
    setSendingCallIns(true)
    try {
      const html = `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
        <tr style="background:#0A2463;color:white"><th>Order #</th><th>Address</th><th>City</th><th>Patient Name</th><th>ZIP</th></tr>
        ${callInPreview.map(r => `<tr><td>${r.orderId}</td><td>${r.address}</td><td>${r.city}</td><td>${r.name}</td><td>${r.zip}</td></tr>`).join('')}
      </table>`
      const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxw2xx2atYfnEfGzCaTmkDShmt96D1JsLFSckScOndB94RV2IGev63fpS7Ndc0GqSHWWQ/exec'
      await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({
          action: 'email',
          to: 'wfldispatch@biotouchglobal.com',
          subject: `Call In Orders — ${data.deliveryDay} ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
          html,
        }),
      })
      setCallInsSent(true)
      setCallInPreview(null)
      alert(`${callInPreview.length} call-in orders sent to BioTouch.`)
    } catch (err) {
      alert('Failed to send call-ins: ' + err.message)
    } finally {
      setSendingCallIns(false)
    }
  }

  async function handleSendRoutes() {
    const msg = TEST_MODE
      ? `TEST MODE — Send all route emails to ${TEST_EMAIL} instead of drivers?`
      : 'Send route emails to all active drivers?'
    if (!confirm(msg)) return
    setSendingRoutes(true)
    try {
      const drivers = activeDrivers.filter(d => d.Email)
      let sent = 0
      for (const d of drivers) {
        await fetch(APPS_SCRIPT_URL, {
          method: 'POST',
          body: JSON.stringify({
            action: 'email',
            to: TEST_MODE ? TEST_EMAIL : d.Email,
            subject: `${TEST_MODE ? '[TEST] ' : ''}CNC Delivery — ${d['Driver Name']} — ${data.deliveryDay}`,
            html: buildDriverEmail(d['Driver Name'], d.stops, d.coldChain, data.deliveryDay),
          }),
        })
        sent++
      }
      // Push to Road Warrior for configured drivers
      const rwDrivers = ['Alex', 'Josh', 'Laura', 'Mark', 'Mike', 'Nick', 'Dom']
      const rwPayload = activeDrivers
        .filter(d => rwDrivers.includes(d['Driver Name']) && d.stopDetails?.length > 0)
        .map(d => ({
          name: d['Driver Name'],
          routeName: `${d['Driver Name']} - ${data.deliveryDay}`,
          stops: d.stopDetails.map(s => ({
            order_id: s['Order ID'] || '', address: s.Address || '',
            city: s.City || '', zip: s.ZIP || '',
            cold_chain: s._coldChain || false, pharmacy: s.Pharmacy || '',
          })),
        }))

      let rwCount = 0
      if (rwPayload.length > 0) {
        try {
          const rwRes = await fetch('/api/actions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'roadwarrior', drivers: rwPayload }),
          })
          const rwData = await rwRes.json()
          rwCount = rwData.results?.filter(r => r.success).length || 0
        } catch {}
      }

      setSentSnapshot(takeSnapshot())
      setRoutesSent(true)
      setMoveToast(`Routes sent to ${sent} drivers${rwCount > 0 ? `, Road Warrior pushed to ${rwCount}` : ''}`)

      // Log final state for learning engine
      const dateStr = data.deliveryDateObj
        ? `${data.deliveryDateObj.getFullYear()}-${String(data.deliveryDateObj.getMonth()+1).padStart(2,'0')}-${String(data.deliveryDateObj.getDate()).padStart(2,'0')}`
        : null
      if (dateStr) {
        fetch('/api/dispatch-log-decision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'snapshot', deliveryDate: dateStr, deliveryDay: data.deliveryDay }),
        }).catch(() => {})
      }
    } catch (err) {
      setMoveToast(`Error sending routes: ${err.message}`)
    } finally {
      setSendingRoutes(false)
    }
  }

  async function handleResendChanges() {
    if (!sentSnapshot) return
    setResending(true)
    try {
      // Compare current assignments vs snapshot
      const current = takeSnapshot()
      const affected = new Set()

      // Find drivers who gained or lost stops
      const allDrivers = new Set([...Object.keys(sentSnapshot), ...Object.keys(current)])
      const changes = []

      for (const name of allDrivers) {
        const oldIds = sentSnapshot[name] || new Set()
        const newIds = current[name] || new Set()
        const gained = [...newIds].filter(id => !oldIds.has(id))
        const lost = [...oldIds].filter(id => !newIds.has(id))
        if (gained.length > 0 || lost.length > 0) {
          affected.add(name)
          changes.push({ name, gained: gained.length, lost: lost.length, newTotal: newIds.size })
        }
      }

      if (affected.size === 0) {
        setMoveToast('No changes since last send')
        setResending(false)
        return
      }

      const changeList = changes.map(c =>
        `${c.name}: ${c.newTotal} stops (${c.gained > 0 ? '+' + c.gained : ''}${c.gained > 0 && c.lost > 0 ? ', ' : ''}${c.lost > 0 ? '-' + c.lost : ''})`
      ).join('\n')

      if (!confirm(`${TEST_MODE ? 'TEST MODE — ' : ''}Resend to ${affected.size} affected drivers?\n\n${changeList}`)) {
        setResending(false)
        return
      }

      // Email only affected drivers
      const driversWithEmail = (data?.drivers || []).filter(d => affected.has(d['Driver Name']) && d.Email)
      let sent = 0
      for (const d of driversWithEmail) {
        await fetch(APPS_SCRIPT_URL, {
          method: 'POST',
          body: JSON.stringify({
            action: 'email',
            to: TEST_MODE ? TEST_EMAIL : d.Email,
            subject: `${TEST_MODE ? '[TEST] ' : ''}CNC Delivery — ${d['Driver Name']} — ${data.deliveryDay} (Updated)`,
            html: buildDriverEmail(d['Driver Name'], d.stops, d.coldChain, data.deliveryDay),
          }),
        })
        sent++
      }
      // Update snapshot
      setSentSnapshot(takeSnapshot())
      setMoveToast(`Updated routes sent to ${sent} drivers`)
    } catch (err) {
      setMoveToast(`Error: ${err.message}`)
    } finally {
      setResending(false)
    }
  }

  async function handleSendCorrections() {
    if (!confirm('Send correction emails for reassigned stops?')) return
    setSendingCorrections(true)
    try {
      const dateStr = data.deliveryDateObj
        ? `${data.deliveryDateObj.getFullYear()}-${String(data.deliveryDateObj.getMonth()+1).padStart(2,'0')}-${String(data.deliveryDateObj.getDate()).padStart(2,'0')}`
        : ''
      if (!dateStr) throw new Error('No delivery date')

      const { data: stops } = await supabase.from('daily_stops').select('*').eq('delivery_date', dateStr)

      const corrections = {}
      for (const s of (stops || [])) {
        if (s.dispatch_driver_number && s.assigned_driver_number && s.dispatch_driver_number !== s.assigned_driver_number) {
          const did = s.assigned_driver_number
          if (!corrections[did]) corrections[did] = []
          corrections[did].push(s.order_id)
        }
      }

      if (Object.keys(corrections).length === 0) {
        setMoveToast('No corrections needed — all assignments match')
        setSendingCorrections(false)
        return
      }

      let sent = 0
      for (const [driverId, orderIds] of Object.entries(corrections)) {
        await fetch(APPS_SCRIPT_URL, {
          method: 'POST',
          body: JSON.stringify({
            action: 'email',
            to: 'wfldispatch@biotouchglobal.com',
            subject: `Assign to Driver ${driverId}`,
            html: `<pre>${orderIds.join('\n')}</pre>`,
          }),
        })
        sent++
      }
      setCorrectionsSent(true)
      setMoveToast(`Correction emails sent for ${sent} drivers`)
    } catch (err) {
      setMoveToast(`Error: ${err.message}`)
    } finally {
      setSendingCorrections(false)
    }
  }

  const totalStops = data?.drivers?.reduce((sum, d) => sum + (d.stops || 0), 0) ?? 0
  const totalColdChain = data?.drivers?.reduce((sum, d) => sum + (d.coldChain || 0), 0) ?? 0
  const allActiveDrivers = data?.drivers?.filter((d) => d.stops > 0) ?? []
  const allInactiveDrivers = data?.drivers?.filter((d) => d.stops === 0) ?? []

  // Filter by ZIP search
  const driverHasZip = (d) => {
    if (!zipSearch) return true
    return (d.stopDetails || []).some(s =>
      (s.zip || s.ZIP || s['Zip Code'] || '').includes(zipSearch)
    )
  }
  const activeDrivers = allActiveDrivers.filter(driverHasZip)
  const inactiveDrivers = zipSearch ? [] : allInactiveDrivers

  return (
    <div className="shell">
      <header className="shell__header">
        <div className="container shell__header-inner">
          <div className="shell__brand">
            <span className="shell__pill">CNC</span>
            <span className="shell__title">Dispatch</span>
            <div className="shell__view-toggle">
              {[
                ['hq', 'HQ', <svg key="i" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>],
                ['routes', 'Routes', <svg key="i" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 18H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.19M15 6h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-3.19"/><rect x="5" y="14" width="4" height="4" rx="2"/><rect x="15" y="14" width="4" height="4" rx="2"/><path d="M9 18h6"/><path d="M3 6l3-3h12l3 3"/></svg>],
                ['payroll', 'Payroll', <svg key="i" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>],
                ['analytics', 'Analytics', <svg key="i" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>],
                ['orders', 'Orders', <svg key="i" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 12h6"/><path d="M9 16h6"/></svg>],
                ['drivers', 'Drivers', <svg key="i" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>],
                ['timeoff', 'Schedule', <svg key="i" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>],
              ].map(([key, label, icon]) => (
                <button
                  key={key}
                  className={`shell__view-btn ${view === key ? 'shell__view-btn--active' : ''} ${key === 'timeoff' && pendingTimeOff > 0 ? 'shell__view-btn--alert' : ''}`}
                  onClick={() => setView(key)}
                >
                  {icon} {label}
                  {key === 'timeoff' && pendingTimeOff > 0 && (
                    <span className="shell__view-badge">{pendingTimeOff}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="shell__user">
            <ThemeToggle />
            <span className="shell__name">{profile?.full_name}</span>
            <button className="shell__signout" onClick={signOut}>Sign Out</button>
          </div>
        </div>
      </header>

      <main className="shell__main container">
        {view === 'hq' && <HQDashboard />}
        {view === 'payroll' && <Payroll />}
        {view === 'analytics' && <Analytics />}
        {view === 'orders' && <Orders />}
        {view === 'drivers' && <Drivers />}
        {view === 'timeoff' && <TimeOff />}

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
                  className={`dispatch__day dispatch__day--routing ${showSortList ? 'dispatch__day--routing-active' : ''}`}
                  onClick={() => { setShowSortList(!showSortList); setShowRouting(false); setShowUnassigned(false) }}
                >
                  Sort List
                </button>
                <button
                  className={`dispatch__day dispatch__day--routing ${showRouting ? 'dispatch__day--routing-active' : ''}`}
                  onClick={() => { setShowRouting(!showRouting); setShowSortList(false); setShowUnassigned(false) }}
                >
                  Routing Rules
                </button>
                <button
                  className={`dispatch__day dispatch__day--routing ${showUnassigned ? 'dispatch__day--routing-active' : ''}`}
                  onClick={() => { setShowUnassigned(!showUnassigned); setShowRouting(false); setShowSortList(false) }}
                >
                  Unassigned
                </button>
                <button
                  className={`dispatch__optimize-btn ${routesSent ? 'dispatch__optimize-btn--sent' : ''}`}
                  onClick={() => {
                    if (routesSent && !confirm('Routes have already been sent for this day. Optimizing now will change assignments drivers already received. Continue?')) return
                    handleOptimize('preview')
                  }}
                  disabled={optimizing}
                  title={routesSent ? 'Routes already sent — changes will need to be resent' : 'Optimize route assignments'}
                >
                  {optimizing ? 'Analyzing...' : routesSent ? '⚡ Optimize (Sent)' : '⚡ Optimize'}
                </button>
              </div>
            </div>

            {/* Optimize Preview Modal */}
            {optimizePreview && (
              <div className="dispatch__optimize-preview">
                <div className="dispatch__optimize-header">
                  <h3>Route Optimization Preview</h3>
                  <button className="dispatch__optimize-close" onClick={() => setOptimizePreview(null)}>&times;</button>
                </div>
                <div className="dispatch__optimize-summary">
                  <div className="dispatch__optimize-stat">
                    <span className="dispatch__optimize-stat-val">{optimizePreview.totalStops}</span>
                    <span className="dispatch__optimize-stat-label">Total Stops</span>
                  </div>
                  <div className="dispatch__optimize-stat">
                    <span className="dispatch__optimize-stat-val">{optimizePreview.changes?.length || 0}</span>
                    <span className="dispatch__optimize-stat-label">Changes</span>
                  </div>
                  <div className="dispatch__optimize-stat">
                    <span className="dispatch__optimize-stat-val">{optimizePreview.availableDrivers?.length || 0}</span>
                    <span className="dispatch__optimize-stat-label">Drivers Available</span>
                  </div>
                  <div className="dispatch__optimize-stat">
                    <span className="dispatch__optimize-stat-val">{optimizePreview.driversOff?.length || 0}</span>
                    <span className="dispatch__optimize-stat-label">Drivers Off</span>
                  </div>
                </div>
                {optimizePreview.driversOff?.length > 0 && (
                  <p style={{ fontSize: 13, color: '#f59e0b', marginBottom: 12 }}>
                    Off today: <strong>{optimizePreview.driversOff.join(', ')}</strong>
                  </p>
                )}
                {optimizePreview.changes?.length === 0 ? (
                  <p style={{ padding: 16, textAlign: 'center', color: 'var(--gray-500)' }}>Routes are already optimized — no changes needed.</p>
                ) : (
                  <>
                    <div className="dispatch__optimize-table-wrap">
                      <table className="dispatch__optimize-table">
                        <thead>
                          <tr><th>Order</th><th>ZIP</th><th>City</th><th>From</th><th>To</th><th>Reason</th></tr>
                        </thead>
                        <tbody>
                          {(optimizePreview.changes || []).map((c, i) => (
                            <tr key={i}>
                              <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{c.orderId}</td>
                              <td style={{ fontWeight: 600 }}>{c.zip}</td>
                              <td>{c.city}</td>
                              <td style={{ color: '#dc4a4a' }}>{c.from || 'Unassigned'}</td>
                              <td style={{ color: '#16a34a', fontWeight: 700 }}>{c.to}</td>
                              <td style={{ fontSize: 12, color: 'var(--gray-500)' }}>{c.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* Load distribution after changes */}
                    <div className="dispatch__optimize-loads">
                      <h4>Projected Load Distribution</h4>
                      <div className="dispatch__optimize-load-bars">
                        {Object.entries(optimizePreview.loads || {}).sort((a, b) => b[1] - a[1]).map(([name, load]) => (
                          <div key={name} className="dispatch__optimize-load-row">
                            <span className="dispatch__optimize-load-name">{name}</span>
                            <div className="dispatch__optimize-load-bar-wrap">
                              <div className="dispatch__optimize-load-bar" style={{ width: `${(load / (Math.max(...Object.values(optimizePreview.loads)) || 1)) * 100}%` }} />
                            </div>
                            <span className="dispatch__optimize-load-count">{load}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="dispatch__optimize-actions">
                      <button className="dispatch__optimize-apply" onClick={() => handleOptimize('apply')} disabled={optimizing}>
                        {optimizing ? 'Applying...' : `Apply ${optimizePreview.changes?.length} Changes`}
                      </button>
                      <button className="dispatch__optimize-cancel" onClick={() => setOptimizePreview(null)}>Cancel</button>
                    </div>
                  </>
                )}
              </div>
            )}

            {showSortList && <SortList deliveryDate={data.deliveryDateObj ? `${data.deliveryDateObj.getFullYear()}-${String(data.deliveryDateObj.getMonth()+1).padStart(2,'0')}-${String(data.deliveryDateObj.getDate()).padStart(2,'0')}` : null} />}
            {showRouting && <RoutingEditor />}
            {showUnassigned && <UnassignedZips />}

            {!showRouting && !showSortList && !showUnassigned && <>
            {/* Context bar — heading, weather, actions */}
            <div className="dispatch__context-bar">
              <div className="dispatch__context-left">
                <h1 className="dispatch__heading">{data.deliveryDay} Delivery</h1>
                <span className="dispatch__date-inline">
                  {(data.deliveryDateObj || new Date()).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
                <WeatherWidget />
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
                  className={`dispatch__callin-btn ${callInsSent ? 'dispatch__callin-btn--done' : ''}`}
                  onClick={handlePreviewCallIns}
                  disabled={sendingCallIns}
                  title="Send call-in orders to BioTouch"
                >
                  {sendingCallIns ? 'Sending...' : callInsSent ? 'Sent' : 'SICI'}
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
                <button
                  className={`dispatch__send-btn dispatch__send-btn--corrections ${correctionsSent ? 'dispatch__send-btn--done' : ''}`}
                  onClick={handleSendCorrections}
                  disabled={sendingCorrections || correctionsSent || totalStops === 0}
                >
                  {correctionsSent ? 'Sent' : sendingCorrections ? 'Sending...' : 'Corrections'}
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
              activeDriverCount={allActiveDrivers.length}
              totalDriverCount={data.drivers?.length ?? 0}
              unassignedCount={data.unassigned?.length ?? 0}
              routingRuleCount={data.routingRuleCount ?? 0}
            />

            {/* Call-in preview */}
            {callInPreview && (
              <div className="dispatch__callin-preview">
                <div className="dispatch__callin-header">
                  <h3>Call-In Orders Preview — {callInPreview.length} order{callInPreview.length !== 1 ? 's' : ''}</h3>
                  <div className="dispatch__callin-actions">
                    <button className="dispatch__callin-cancel" onClick={() => setCallInPreview(null)}>Cancel</button>
                    <button className="dispatch__callin-confirm" onClick={handleConfirmCallIns} disabled={sendingCallIns}>
                      {sendingCallIns ? 'Sending...' : 'Confirm & Send to BioTouch'}
                    </button>
                  </div>
                </div>
                <div className="dispatch__callin-table-wrap">
                  <table className="dispatch__callin-table">
                    <thead>
                      <tr><th>Order #</th><th>Patient Name</th><th>Address</th><th>City</th><th>ZIP</th></tr>
                    </thead>
                    <tbody>
                      {callInPreview.map((r, i) => (
                        <tr key={i}><td>{r.orderId}</td><td>{r.name}</td><td>{r.address}</td><td>{r.city}</td><td>{r.zip}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

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
            </>}
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

function UnassignedZips() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadUnassigned()
  }, [])

  async function loadUnassigned() {
    setLoading(true)
    try {
      const [stopsRes, rulesRes] = await Promise.all([
        supabase.from('daily_stops').select('zip, pharmacy, city, patient_name, order_id, address').order('delivery_date', { ascending: false }).limit(5000),
        supabase.from('routing_rules').select('zip_code, pharmacy'),
      ])

      const ruleSet = new Set((rulesRes.data || []).map(r => `${r.zip_code}|${r.pharmacy}`))

      // Find stops whose zip+pharmacy combo has no routing rule
      const unmatched = {}
      ;(stopsRes.data || []).forEach(s => {
        const key = `${s.zip}|${s.pharmacy}`
        if (ruleSet.has(key)) return
        if (!unmatched[key]) unmatched[key] = { zip: s.zip, pharmacy: s.pharmacy, city: s.city || '', count: 0, orders: [] }
        unmatched[key].count++
        if (unmatched[key].orders.length < 5) unmatched[key].orders.push(s)
      })

      setData(Object.values(unmatched).sort((a, b) => b.count - a.count))
    } catch {
      setData([])
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="dispatch__loading"><div className="dispatch__spinner" />Loading unassigned...</div>

  return (
    <div style={{ padding: '0 0 24px' }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Unassigned ZIPs</h2>
      <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 16 }}>ZIPs from recent orders that don't have routing rules. Add them in Routing Rules to auto-assign.</p>

      {(!data || data.length === 0) ? (
        <p style={{ color: '#6b7280', fontSize: 14 }}>All ZIPs have routing rules.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ textAlign: 'left', padding: '8px 10px', color: '#6b7280', fontWeight: 600 }}>ZIP</th>
              <th style={{ textAlign: 'left', padding: '8px 10px', color: '#6b7280', fontWeight: 600 }}>Pharmacy</th>
              <th style={{ textAlign: 'left', padding: '8px 10px', color: '#6b7280', fontWeight: 600 }}>City</th>
              <th style={{ textAlign: 'right', padding: '8px 10px', color: '#6b7280', fontWeight: 600 }}>Orders</th>
              <th style={{ padding: '8px 10px' }}></th>
            </tr>
          </thead>
          <tbody>
            {data.map(d => (
              <tr key={`${d.zip}|${d.pharmacy}`} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '8px 10px', fontWeight: 600 }}>{d.zip}</td>
                <td style={{ padding: '8px 10px' }}><span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: d.pharmacy === 'Aultman' ? '#dbeafe' : '#f3f4f6', color: d.pharmacy === 'Aultman' ? '#2563eb' : '#374151' }}>{d.pharmacy}</span></td>
                <td style={{ padding: '8px 10px', color: '#6b7280' }}>{d.city}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: '#dc2626' }}>{d.count}</td>
                <td style={{ padding: '8px 10px' }}>
                  <button
                    style={{ background: 'none', border: '1px solid #fca5a5', borderRadius: 4, color: '#dc2626', fontSize: 11, fontWeight: 600, padding: '3px 10px', cursor: 'pointer' }}
                    onClick={async () => {
                      if (!confirm(`Delete ${d.count} orders for ZIP ${d.zip} (${d.pharmacy})?`)) return
                      const ids = d.orders.map(o => o.order_id)
                      for (const id of ids) {
                        await dbDelete('daily_stops', { order_id: id, zip: d.zip })
                      }
                      // Also delete any remaining with this zip+pharmacy
                      await dbDelete('daily_stops', { zip: d.zip, pharmacy: d.pharmacy })
                      setData(prev => prev.filter(x => !(x.zip === d.zip && x.pharmacy === d.pharmacy)))
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
