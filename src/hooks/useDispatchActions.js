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

export default function useDispatchActions({ data, activeDrivers, setMoveToast, fetchDispatchData, selectedDay }) {
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

  async function handleConfirmCallIns() {
    if (!callInPreview?.length) return
    setSendingCallIns(true)
    try {
      const html = `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
        <tr style="background:#0A2463;color:white"><th>Order #</th><th>Address</th><th>City</th><th>Patient Name</th><th>ZIP</th></tr>
        ${callInPreview.map(r => `<tr><td>${r.orderId}</td><td>${r.address}</td><td>${r.city}</td><td>${r.name}</td><td>${r.zip}</td></tr>`).join('')}
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

      const dateStr = data.deliveryDateObj
        ? `${data.deliveryDateObj.getFullYear()}-${String(data.deliveryDateObj.getMonth()+1).padStart(2,'0')}-${String(data.deliveryDateObj.getDate()).padStart(2,'0')}`
        : null
      if (dateStr) {
        fetch('/api/dispatch-log-decision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'snapshot', deliveryDate: dateStr, deliveryDay: data.deliveryDay }),
        }).catch(() => {})
        fetch('/api/dispatch-log-decision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'auto_log', deliveryDate: dateStr, deliveryDay: data.deliveryDay }),
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

  async function handleSendCorrections() {
    if (!confirm('Send correction emails for reassigned stops?')) return
    setSendingCorrections(true)
    try {
      const dateStr = data.deliveryDateObj
        ? `${data.deliveryDateObj.getFullYear()}-${String(data.deliveryDateObj.getMonth()+1).padStart(2,'0')}-${String(data.deliveryDateObj.getDate()).padStart(2,'0')}`
        : ''
      if (!dateStr) throw new Error('No delivery date')

      const { data: stops } = await supabase
        .from('daily_stops')
        .select('*')
        .eq('delivery_date', dateStr)
        .limit(10000)

      const corrections = {}
      let alreadySent = 0
      for (const s of (stops || [])) {
        if (!s.assigned_driver_number) continue
        const needsCorrection =
          !s.dispatch_driver_number ||
          String(s.dispatch_driver_number) !== String(s.assigned_driver_number)
        if (!needsCorrection) continue
        if (
          s.last_correction_driver &&
          String(s.last_correction_driver) === String(s.assigned_driver_number)
        ) {
          alreadySent++
          continue
        }
        const did = s.assigned_driver_number
        if (!corrections[did]) corrections[did] = []
        corrections[did].push(s.order_id)
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
      for (const [driverId, orderIds] of Object.entries(corrections)) {
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

  async function handleResendCorrections() {
    setSendingResendCorrections(true)
    try {
      const dateStr = data.deliveryDateObj
        ? `${data.deliveryDateObj.getFullYear()}-${String(data.deliveryDateObj.getMonth()+1).padStart(2,'0')}-${String(data.deliveryDateObj.getDate()).padStart(2,'0')}`
        : ''
      if (!dateStr) throw new Error('No delivery date')

      const { data: stops } = await supabase
        .from('daily_stops')
        .select('*')
        .eq('delivery_date', dateStr)
        .limit(10000)

      const corrections = {}
      for (const s of (stops || [])) {
        if (!s.assigned_driver_number) continue
        const needsCorrection =
          !s.dispatch_driver_number ||
          String(s.dispatch_driver_number) !== String(s.assigned_driver_number)
        if (!needsCorrection) continue
        const did = s.assigned_driver_number
        if (!corrections[did]) corrections[did] = []
        corrections[did].push(s.order_id)
      }

      const driverCount = Object.keys(corrections).length
      const totalOrders = Object.values(corrections).reduce((n, arr) => n + arr.length, 0)
      if (driverCount === 0) {
        setMoveToast('No reassigned stops to resend — every stop matches its original dispatch')
        setSendingResendCorrections(false)
        return
      }
      if (!confirm(`Resend ${totalOrders} reassigned orders across ${driverCount} drivers to BioTouch?\n\n(Ignores already-sent tracking. Does NOT send the ${(stops || []).length - totalOrders} stops that match their original dispatch.)`)) {
        setSendingResendCorrections(false)
        return
      }

      let sent = 0
      const markErrors = []
      for (const [driverId, orderIds] of Object.entries(corrections)) {
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
    if (!confirm('FORCE SEND ALL: email WFL the full order list for every driver (ignores already-sent tracking). Continue?')) return
    setSendingForceAll(true)
    try {
      const dateStr = data.deliveryDateObj
        ? `${data.deliveryDateObj.getFullYear()}-${String(data.deliveryDateObj.getMonth()+1).padStart(2,'0')}-${String(data.deliveryDateObj.getDate()).padStart(2,'0')}`
        : ''
      if (!dateStr) throw new Error('No delivery date')

      const { data: stops } = await supabase
        .from('daily_stops')
        .select('*')
        .eq('delivery_date', dateStr)
        .limit(10000)

      const byDriver = {}
      for (const s of (stops || [])) {
        if (!s.assigned_driver_number || !s.order_id) continue
        const did = String(s.assigned_driver_number)
        if (!byDriver[did]) byDriver[did] = []
        byDriver[did].push(s.order_id)
      }

      if (Object.keys(byDriver).length === 0) {
        setMoveToast('No assigned stops found')
        setSendingForceAll(false)
        return
      }

      const totalToSend = Object.values(byDriver).reduce((n, arr) => n + arr.length, 0)
      if (!confirm(`Send ${totalToSend} order IDs across ${Object.keys(byDriver).length} drivers to WFL?`)) {
        setSendingForceAll(false)
        return
      }

      let sent = 0
      const markErrors = []
      for (const [driverId, orderIds] of Object.entries(byDriver)) {
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
        setMoveToast(`Force-sent full order list for ${sent} drivers (${totalToSend} stops)`)
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
    handleForceSendAll,
  }
}
