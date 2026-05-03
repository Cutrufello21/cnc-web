import { useState } from 'react'
import { supabase } from '../lib/supabase'

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxw2xx2atYfnEfGzCaTmkDShmt96D1JsLFSckScOndB94RV2IGev63fpS7Ndc0GqSHWWQ/exec'
const TEST_MODE = false
const TEST_EMAIL = 'dom@cncdeliveryservice.com'

const CALL_IN_ZIPS = new Set([
  '43450','43903','43908','43945','43986','43988',
  '44134','44136','44141','44147','44203','44216','44217','44230','44270','44273','44276','44281','44314',
  '44423','44427','44460',
  '44606','44607','44608','44612','44613','44620','44624','44625','44626','44627','44629','44632','44634',
  '44645','44651','44659','44662','44672','44675','44678','44681','44683','44691','44695','44697',
])

export default function useDispatchActions({ data, activeDrivers, setMoveToast, fetchDispatchData, selectedDay, sessionCorrections, sessionStartTime, setSessionFinalMinutes }) {
  const [sendingRoutes, setSendingRoutes] = useState(false)
  const [routesSent, setRoutesSent] = useState(false)
  const [sendingCorrections, setSendingCorrections] = useState(false)
  const [sendingForceAll, setSendingForceAll] = useState(false)
  const [forceAllSent, setForceAllSent] = useState(false)
  const [correctionsSent, setCorrectionsSent] = useState(false)
  const [sendingResendCorrections, setSendingResendCorrections] = useState(false)
  const [sentSnapshot, setSentSnapshot] = useState(null)
  const [resending, setResending] = useState(false)
  const [sendingCallIns, setSendingCallIns] = useState(false)
  const [callInsSent, setCallInsSent] = useState(false)
  const [callInPreview, setCallInPreview] = useState(null)
  const [correctionPreview, setCorrectionPreview] = useState(null)
  const [combinedPreview, setCombinedPreview] = useState(null)
  const [resendAllPreview, setResendAllPreview] = useState(null)
  const [forceDriverSelection, setForceDriverSelection] = useState(null)

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
    const snap = {}
    for (const d of (data?.drivers || [])) {
      const name = d['Driver Name']
      const ids = (d.stopDetails || []).map(s => s['Order ID']).filter(Boolean)
      if (ids.length > 0) snap[name] = new Set(ids)
    }
    return snap
  }

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

  async function handleConfirmCallIns(passedCallIns) {
    const items = passedCallIns || callInPreview
    if (!items?.length) return
    setSendingCallIns(true)
    try {
      const html = `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
        <tr style="background:#0A2463;color:white"><th>Order #</th><th>Address</th><th>City</th><th>Patient Name</th><th>ZIP</th></tr>
        ${items.map(r => `<tr><td>${r.orderId}</td><td>${r.address}</td><td>${r.city}</td><td>${r.name}</td><td>${r.zip}</td></tr>`).join('')}
      </table>`
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
      alert(`${items.length} call-in orders sent to BioTouch.`)
    } catch (err) {
      alert('Failed to send call-ins: ' + err.message)
    } finally {
      setSendingCallIns(false)
    }
  }

  async function handleSendRoutes() {
    const dateStr0 = data.deliveryDateObj
      ? `${data.deliveryDateObj.getFullYear()}-${String(data.deliveryDateObj.getMonth()+1).padStart(2,'0')}-${String(data.deliveryDateObj.getDate()).padStart(2,'0')}`
      : null
    const dayLabel = data.deliveryDay || dateStr0
    const msg = TEST_MODE
      ? `TEST MODE — Send all route emails to ${TEST_EMAIL} instead of drivers?`
      : `Send route emails to all active drivers for ${dayLabel}?`
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
      setSentSnapshot(takeSnapshot())
      setRoutesSent(true)
      setMoveToast(`Routes sent to ${sent} drivers`)

      const dateStr = data.deliveryDateObj
        ? `${data.deliveryDateObj.getFullYear()}-${String(data.deliveryDateObj.getMonth()+1).padStart(2,'0')}-${String(data.deliveryDateObj.getDate()).padStart(2,'0')}`
        : null
      if (dateStr) {
        // Mark all stops for this date as dispatched so drivers can see them
        // Also populate driver numbers for correction emails
        // Update status to dispatched and set assigned_driver_number
        // NEVER overwrite dispatch_driver_number — that's the BioTouch original assignment from Gmail import
        const { data: dateStops } = await supabase.from('daily_stops').select('id, driver_name, dispatch_driver_number, assigned_driver_number').eq('delivery_date', dateStr)
        const driverNumMap = {}
        activeDrivers.forEach(d => { if (d['Driver Name'] && d['Driver #']) driverNumMap[d['Driver Name']] = String(d['Driver #']) })
        for (const s of (dateStops || [])) {
          if (!s.driver_name || !driverNumMap[s.driver_name]) continue
          const num = driverNumMap[s.driver_name]
          const update = { status: 'dispatched', assigned_driver_number: num, driver_number: num }
          // Only set dispatch_driver_number if it's null (wasn't set by Gmail import)
          if (!s.dispatch_driver_number) update.dispatch_driver_number = num
          supabase.from('daily_stops').update(update).eq('id', s.id).then(() => {})
        }
        fetch('/api/dispatch-log-decision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'snapshot', deliveryDate: dateStr, deliveryDay: data.deliveryDay }),
        }).catch(() => {})
        const sessionMinutes = sessionStartTime ? Math.round((Date.now() - sessionStartTime) / 60000) : null
        if (setSessionFinalMinutes && sessionMinutes != null) setSessionFinalMinutes(sessionMinutes)
        fetch('/api/dispatch-log-decision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'auto_log', deliveryDate: dateStr, deliveryDay: data.deliveryDay, session_corrections: sessionCorrections || 0, session_duration_minutes: sessionMinutes }),
        }).catch(() => {})
        fetch('/api/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'push_routes', date: dateStr }),
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
      const current = takeSnapshot()
      const affected = new Set()
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
      for (const c of changes) {
        const driverStops = (data?.drivers || []).find(d => d['Driver Name'] === c.name)?.stopDetails || []
        const cityCounts = {}
        driverStops.forEach(s => { const city = s.City || 'Unknown'; cityCounts[city] = (cityCounts[city] || 0) + 1 })
        const cityList = Object.entries(cityCounts).sort((a, b) => b[1] - a[1]).map(([city, n]) => `${n} ${city}`).join(', ')
        const parts = []
        if (c.gained > 0) parts.push(`+${c.gained} added`)
        if (c.lost > 0) parts.push(`${c.lost} removed`)
        const body = `Route updated: ${parts.join(', ')}. Now ${c.newTotal} stops (${cityList}).`
        fetch('/api/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'push_notify', driverNames: [c.name], title: 'Route Changed', body })
        }).catch(() => {})
      }

      setSentSnapshot(takeSnapshot())
      setMoveToast(`Updated routes sent to ${sent} drivers`)
    } catch (err) {
      setMoveToast(`Error: ${err.message}`)
    } finally {
      setResending(false)
    }
  }

  // Shared: calculate corrections for a given date, optionally skip already-sent
  async function calcCorrections(skipAlreadySent) {
    const dateStr = data.deliveryDateObj
      ? `${data.deliveryDateObj.getFullYear()}-${String(data.deliveryDateObj.getMonth()+1).padStart(2,'0')}-${String(data.deliveryDateObj.getDate()).padStart(2,'0')}`
      : ''
    if (!dateStr) return { corrections: {}, alreadySent: 0, stops: [], dateStr }

    const { data: stops } = await supabase
      .from('daily_stops')
      .select('*')
      .eq('delivery_date', dateStr)
      .limit(10000)

    // Build driver number → name map
    const numToName = {}
    activeDrivers.forEach(d => { if (d['Driver #']) numToName[String(d['Driver #'])] = d['Driver Name'] })

    const corrections = {}
    let alreadySent = 0
    for (const s of (stops || [])) {
      if (!s.assigned_driver_number) continue
      const needsCorrection =
        !s.dispatch_driver_number ||
        String(s.dispatch_driver_number) !== String(s.assigned_driver_number)
      if (!needsCorrection) continue
      if (skipAlreadySent &&
        s.last_correction_driver &&
        String(s.last_correction_driver) === String(s.assigned_driver_number)
      ) {
        alreadySent++
        continue
      }
      const did = s.assigned_driver_number
      const driverName = numToName[did] || `Driver #${did}`
      if (!corrections[did]) corrections[did] = { name: driverName, orderIds: [] }
      corrections[did].orderIds.push(s.order_id)
    }
    return { corrections, alreadySent, stops, dateStr }
  }

  async function handlePreviewCorrections(forceAll) {
    const { corrections, alreadySent } = await calcCorrections(!forceAll)
    if (Object.keys(corrections).length === 0) {
      setMoveToast(alreadySent > 0 ? `No new corrections — ${alreadySent} already sent` : 'No corrections needed — all assignments match')
      return
    }
    if (forceAll) {
      setResendAllPreview({ corrections, alreadySent })
    } else {
      setCorrectionPreview({ corrections, alreadySent, forceAll })
    }
  }

  async function handleConfirmResendAll() {
    if (!resendAllPreview) return
    setResendAllPreview(null)
    await handleResendCorrections(true)
  }

  async function handlePreviewAndReview() {
    // Load both corrections and call-ins at once
    const { corrections, alreadySent } = await calcCorrections(true)

    // Call-ins
    let callIns = []
    if (data?.drivers) {
      const allStops = data.drivers.flatMap(d => (d.stopDetails || []))
      callIns = allStops.filter(s => {
        const zip = s.zip || s.ZIP || s['Zip Code']
        const pharma = (s.pharmacy || s.Pharmacy || '').toLowerCase()
        return CALL_IN_ZIPS.has(zip) && pharma !== 'shsp'
      }).map(s => ({
        orderId: s.order_id || s['Order ID'],
        address: s.address || s.Address,
        city: s.city || s.City || '',
        name: s.patient_name || s.Name,
        zip: s.zip || s.ZIP || s['Zip Code'],
      }))
    }

    if (Object.keys(corrections).length === 0 && callIns.length === 0) {
      setMoveToast('No corrections or call-in orders found')
      return
    }

    setCombinedPreview({ corrections, alreadySent, callIns })
  }

  async function handleConfirmCorrections() {
    if (!correctionPreview) return
    const { forceAll } = correctionPreview
    setCorrectionPreview(null)
    if (forceAll) {
      await handleResendCorrections(true)
    } else {
      await handleSendCorrections(true)
    }
  }

  async function handleSendCorrections(confirmed, passedCorrections) {
    if (!confirmed && !confirm('Send correction emails for reassigned stops?')) return
    setSendingCorrections(true)
    try {
      let corrections, alreadySent, stops, dateStr
      if (passedCorrections) {
        corrections = passedCorrections
        alreadySent = 0
        const dd = data.deliveryDateObj
        dateStr = dd ? `${dd.getFullYear()}-${String(dd.getMonth()+1).padStart(2,'0')}-${String(dd.getDate()).padStart(2,'0')}` : ''
      } else {
        ({ corrections, alreadySent, stops, dateStr } = await calcCorrections(true))
      }

      if (Object.keys(corrections).length === 0) {
        setMoveToast(
          alreadySent > 0
            ? `No new corrections — ${alreadySent} already sent`
            : 'No corrections needed — all assignments match'
        )
        setSendingCorrections(false)
        return
      }

      let sent = 0
      let markErrors = []
      for (const [driverId, { orderIds }] of Object.entries(corrections)) {
        try {
          await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
              action: 'email',
              to: 'wfldispatch@biotouchglobal.com',
              subject: `Assign to Driver ${driverId}`,
              html: `<pre>${orderIds.join('\n')}</pre>`,
            }),
          })
        } catch (e) {
          markErrors.push(`email ${driverId}: ${e.message}`)
          continue
        }
        const markRes = await fetch('/api/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'mark_correction_sent',
            orderIds,
            driverNumber: driverId,
          }),
        })
        if (!markRes.ok) {
          const txt = await markRes.text().catch(() => '')
          markErrors.push(`mark ${driverId}: ${markRes.status} ${txt}`)
        }
        sent++
      }
      if (markErrors.length) {
        console.error('[send corrections] mark errors:', markErrors)
      }
      const stopsByDriver = {}
      for (const s of (stops || [])) {
        if (s.dispatch_driver_number && s.assigned_driver_number && s.dispatch_driver_number !== s.assigned_driver_number) {
          if (!stopsByDriver[s.driver_name]) stopsByDriver[s.driver_name] = { added: [], cities: {} }
          stopsByDriver[s.driver_name].added.push(s)
          const city = s.city || 'Unknown'
          stopsByDriver[s.driver_name].cities[city] = (stopsByDriver[s.driver_name].cities[city] || 0) + 1
        }
      }
      for (const [driverName, info] of Object.entries(stopsByDriver)) {
        const cityList = Object.entries(info.cities).sort((a, b) => b[1] - a[1]).map(([city, n]) => `${n} ${city}`).join(', ')
        fetch('/api/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'push_notify', driverNames: [driverName], title: 'Route Corrected', body: `${info.added.length} stops reassigned to you (${cityList}).` })
        }).catch(() => {})
      }

      setCorrectionsSent(true)
      if (markErrors.length) {
        setMoveToast(`Sent ${sent} drivers, but ${markErrors.length} failed to mark — check console`)
      } else {
        setMoveToast(`Correction emails sent for ${sent} drivers`)
      }
    } catch (err) {
      setMoveToast(`Error: ${err.message}`)
    } finally {
      setSendingCorrections(false)
    }
  }

  async function handleResendCorrections(confirmed) {
    setSendingResendCorrections(true)
    try {
      const { corrections, alreadySent, stops, dateStr } = await calcCorrections(false)

      const driverCount = Object.keys(corrections).length
      const totalOrders = Object.values(corrections).reduce((n, arr) => n + arr.orderIds.length, 0)
      if (driverCount === 0) {
        setMoveToast('No reassigned stops to resend — every stop matches its original dispatch')
        setSendingResendCorrections(false)
        return
      }
      if (!confirmed && !confirm(`Resend ${totalOrders} reassigned orders across ${driverCount} drivers to BioTouch?`)) {
        setSendingResendCorrections(false)
        return
      }

      let sent = 0
      const markErrors = []
      for (const [driverId, { orderIds }] of Object.entries(corrections)) {
        try {
          await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
              action: 'email',
              to: 'wfldispatch@biotouchglobal.com',
              subject: `Assign to Driver ${driverId}`,
              html: `<pre>${orderIds.join('\n')}</pre>`,
            }),
          })
        } catch (e) {
          markErrors.push(`email ${driverId}: ${e.message}`)
          continue
        }
        const markRes = await fetch('/api/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'mark_correction_sent',
            orderIds,
            driverNumber: driverId,
          }),
        })
        if (!markRes.ok) {
          const txt = await markRes.text().catch(() => '')
          markErrors.push(`mark ${driverId}: ${markRes.status} ${txt}`)
        }
        sent++
      }
      if (markErrors.length) {
        console.error('[resend corrections] mark errors:', markErrors)
        setMoveToast(`Resent ${sent} drivers, but ${markErrors.length} failed to mark — check console`)
      } else {
        setMoveToast(`Resent ${totalOrders} corrections to BioTouch (${sent} drivers)`)
      }
    } catch (err) {
      setMoveToast(`Error: ${err.message}`)
    } finally {
      setSendingResendCorrections(false)
    }
  }

  async function handleForceSendAll() {
    const dateStr = data.deliveryDateObj
      ? `${data.deliveryDateObj.getFullYear()}-${String(data.deliveryDateObj.getMonth()+1).padStart(2,'0')}-${String(data.deliveryDateObj.getDate()).padStart(2,'0')}`
      : ''
    if (!dateStr) { setMoveToast('No delivery date'); return }

    const { data: stops } = await supabase
      .from('daily_stops')
      .select('*')
      .eq('delivery_date', dateStr)
      .limit(10000)

    // Build driver number → name map
    const numToName = {}
    activeDrivers.forEach(d => { if (d['Driver #']) numToName[String(d['Driver #'])] = d['Driver Name'] })

    const byDriver = {}
    for (const s of (stops || [])) {
      if (!s.assigned_driver_number || !s.order_id) continue
      const did = String(s.assigned_driver_number)
      const driverName = numToName[did] || `Driver #${did}`
      if (!byDriver[did]) byDriver[did] = { name: driverName, orderIds: [] }
      byDriver[did].orderIds.push(s.order_id)
    }

    if (Object.keys(byDriver).length === 0) {
      setMoveToast('No assigned stops found')
      return
    }

    // Open driver selection UI — all selected by default
    const selected = {}
    Object.keys(byDriver).forEach(id => { selected[id] = true })
    setForceDriverSelection({ byDriver, selected })
  }

  async function handleForceSendSelected() {
    if (!forceDriverSelection) return
    const { byDriver, selected } = forceDriverSelection
    const selectedDrivers = Object.entries(selected).filter(([, v]) => v).map(([id]) => id)
    if (selectedDrivers.length === 0) return

    setForceDriverSelection(null)
    setSendingForceAll(true)
    try {
      let sent = 0
      let totalOrders = 0
      const markErrors = []
      for (const driverId of selectedDrivers) {
        const { orderIds } = byDriver[driverId]
        totalOrders += orderIds.length
        try {
          await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
              action: 'email',
              to: 'wfldispatch@biotouchglobal.com',
              subject: `Assign to Driver ${driverId}`,
              html: `<pre>${orderIds.join('\n')}</pre>`,
            }),
          })
        } catch (e) {
          markErrors.push(`email ${driverId}: ${e.message}`)
          continue
        }
        const markRes = await fetch('/api/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'mark_correction_sent',
            orderIds,
            driverNumber: driverId,
          }),
        })
        if (!markRes.ok) {
          const txt = await markRes.text().catch(() => '')
          markErrors.push(`mark ${driverId}: ${markRes.status} ${txt}`)
        }
        sent++
      }

      setForceAllSent(true)
      if (markErrors.length) {
        console.error('[force send all] mark errors:', markErrors)
        setMoveToast(`Force-sent ${sent} drivers, but ${markErrors.length} failed to mark — check console`)
      } else {
        setMoveToast(`Force-sent full order list for ${sent} drivers (${totalOrders} stops)`)
      }
    } catch (err) {
      setMoveToast(`Error: ${err.message}`)
    } finally {
      setSendingForceAll(false)
    }
  }

  return {
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
  }
}
