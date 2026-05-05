import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { dbUpdate } from '../lib/db'

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxw2xx2atYfnEfGzCaTmkDShmt96D1JsLFSckScOndB94RV2IGev63fpS7Ndc0GqSHWWQ/exec'
const CALL_IN_ZIPS = new Set([
  '43450','43903','43908','43945','43986','43988',
  '44134','44136','44141','44147','44203','44216','44217','44230','44270','44273','44276','44281','44314',
  '44423','44427','44460',
  '44606','44607','44608','44612','44613','44620','44624','44625','44626','44627','44629','44632','44634',
  '44645','44651','44659','44662','44672','44675','44678','44681','44683','44691','44695','44697',
])
const RW_DRIVERS = ['Alex','Josh','Laura','Mark','Mike','Nick','Dom']

export default function useRouteActions({ selectedDate, allStops, grouped, allDrivers, dayName, findDriverEmail, showToast, loadStops, buildDriverEmailHTML }) {
  const [sending, setSending] = useState(false)
  const [siciSent, setSiciSent] = useState(false)
  const [siciSending, setSiciSending] = useState(false)
  const [correctionsSent, setCorrectionsSent] = useState(false)
  const [correctionsSending, setCorrectionsSending] = useState(false)
  const [sendingDriver, setSendingDriver] = useState('')
  const [sentSnapshot, setSentSnapshot] = useState(null)
  const [lastMove, setLastMove] = useState(null)
  const [moveToast, setMoveToast] = useState('')
  const [resending, setResending] = useState(false)
  const [moveTarget, setMoveTarget] = useState('')
  const [showMoveDropdown, setShowMoveDropdown] = useState(false)

  function resetSendStates() {
    setSiciSent(false)
    setCorrectionsSent(false)
    setSentSnapshot(null)
    setLastMove(null)
  }

  async function handleSendAll() {
    setSending(true)
    try {
      // Auto-optimize each driver's route before sending
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      for (const driverName of driverNames) {
        if (driverName === 'Unassigned') continue
        const driverStops = grouped[driverName]
        if (!driverStops || driverStops.length < 2) continue
        try {
          const driverRecord = allDrivers.find(d => (d.driver_name || d.name) === driverName)
          const hasHome = driverRecord?.home_lat && driverRecord?.home_lng
          const body = {
            stops: driverStops.map(s => ({
              address: s.address, city: s.city, zip: s.zip,
              coldChain: s.cold_chain, lat: s.lat, lng: s.lng,
            })),
            pharmacy: driverStops[0]?.pharmacy || 'SHSP',
          }
          if (hasHome) { body.endLat = driverRecord.home_lat; body.endLng = driverRecord.home_lng }
          const res = await fetch('/api/optimize-route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify(body),
          })
          const result = await res.json()
          if (result.optimizedOrder) {
            await Promise.all(result.optimizedOrder.map((origIdx, newIdx) => {
              const stop = driverStops[origIdx]
              return stop?.id ? supabase.from('daily_stops').update({ sort_order: newIdx }).eq('id', stop.id) : null
            }).filter(Boolean))
            // Save route distance
            if (result.totalDistance) {
              await supabase.from('driver_routes').upsert({
                driver_name: driverName, date: selectedDate,
                stop_sequence: result.optimizedOrder.map(i => String(driverStops[i]?.id || driverStops[i]?.order_id)),
                origin_hospital: driverStops[0]?.pharmacy || 'SHSP',
                optimized_at: new Date().toISOString(),
                route_miles: result.totalDistance,
              }, { onConflict: 'driver_name,date' })
            }
          }
        } catch (e) { console.error(`Auto-optimize ${driverName} failed:`, e) }
      }
      await loadStops(selectedDate)

      let sentCount = 0

      // a) Send email to EACH driver via Apps Script
      for (const driverName of driverNames) {
        if (driverName === 'Unassigned') continue
        const driverStops = grouped[driverName]
        if (!driverStops || driverStops.length === 0) continue

        const driverEmail = findDriverEmail(driverName)
        if (driverEmail) {
          const html = buildDriverEmailHTML(driverName, driverStops, dayName, selectedDate)
          await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
              action: 'email',
              to: driverEmail,
              subject: `[CNC Delivery] ${driverName} — ${dayName}`,
              html: html
            }),
            mode: 'no-cors'
          })
        }
        sentCount++
      }

      // b) Send to Road Warrior for RW_DRIVERS
      const rwDrivers = driverNames.filter(n => RW_DRIVERS.includes(n))
      if (rwDrivers.length > 0) {
        await fetch('/api/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'roadwarrior',
            drivers: rwDrivers.map(name => ({
              name,
              routeName: `${name} - ${dayName}`,
              stops: grouped[name].sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999)).map(s => ({
                order_id: s.order_id, address: s.address, city: s.city, zip: s.zip,
                cold_chain: s.cold_chain, pharmacy: s.pharmacy
              }))
            }))
          })
        })
      }

      // c) Send push notifications
      await fetch('/api/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'push_routes', date: selectedDate })
      })

      // d) Log snapshot for change detection
      await fetch('/api/dispatch-log-decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'snapshot', deliveryDate: selectedDate })
      })

      // e) Auto-log to dispatch_logs
      await fetch('/api/dispatch-log-decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'auto_log', deliveryDate: selectedDate })
      })

      // f) Save sentSnapshot state for resend detection
      const snapshot = {}
      for (const driverName of driverNames) {
        if (driverName === 'Unassigned') continue
        snapshot[driverName] = grouped[driverName].map(s => s.order_id || s.id)
      }
      setSentSnapshot(snapshot)

      // g) Show toast with count
      showToast(`Routes sent to ${sentCount} drivers!`)
      setShowSendModal(false)
      await loadStops(selectedDate)
    } catch (err) {
      console.error('Send failed:', err)
      showToast('Failed to send routes')
    } finally {
      setSending(false)
    }
  }

  async function handleSendDriverRoute(driverName) {
    setSendingDriver(driverName)
    try {
      const driverStops = grouped[driverName]
      if (!driverStops || driverStops.length === 0) {
        showToast(`No stops for ${driverName}`)
        setSendingDriver('')
        return
      }

      // a) Build HTML email and send via Apps Script
      const driverEmail = findDriverEmail(driverName)
      if (driverEmail) {
        const html = buildDriverEmailHTML(driverName, driverStops, dayName, selectedDate)
        await fetch(APPS_SCRIPT_URL, {
          method: 'POST',
          body: JSON.stringify({
            action: 'email',
            to: driverEmail,
            subject: `[CNC Delivery] ${driverName} — ${dayName}`,
            html: html
          }),
          mode: 'no-cors'
        })
      }

      // b) Send to Road Warrior if driver is in RW_DRIVERS
      if (RW_DRIVERS.includes(driverName)) {
        await fetch('/api/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'roadwarrior',
            drivers: [{
              name: driverName,
              routeName: `${driverName} - ${dayName}`,
              stops: [...driverStops].sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999)).map(s => ({
                order_id: s.order_id, address: s.address, city: s.city, zip: s.zip,
                cold_chain: s.cold_chain, pharmacy: s.pharmacy
              }))
            }]
          })
        })
      }

      // c) Send push notification
      await fetch('/api/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'push_notify',
          driverNames: [driverName],
          title: 'Route Ready',
          body: `You have ${driverStops.length} stops assigned. Open the app to view your route.`
        })
      })

      showToast(`Route sent for ${driverName}`)
    } catch (err) {
      console.error('Send driver route failed:', err)
      showToast(`Failed to send route for ${driverName}`)
    } finally {
      setSendingDriver('')
    }
  }

  async function handleSendCorrections() {
    setCorrectionsSending(true)
    try {
      // a) Query daily_stops for the date
      const { data: stopsData } = await supabase
        .from('daily_stops')
        .select('*')
        .eq('delivery_date', selectedDate)

      if (!stopsData || stopsData.length === 0) {
        showToast('No stops found for corrections')
        setCorrectionsSending(false)
        return
      }

      // b) Find corrections (dispatch_driver_number !== assigned_driver_number)
      const corrections = stopsData.filter(s =>
        s.dispatch_driver_number && s.assigned_driver_number &&
        s.dispatch_driver_number !== s.assigned_driver_number
      )
      if (corrections.length === 0) {
        showToast('No corrections needed')
        setCorrectionsSending(false)
        return
      }

      // c) Group by assigned_driver_number
      const groups = {}
      for (const s of corrections) {
        const key = s.assigned_driver_number
        if (!groups[key]) groups[key] = []
        groups[key].push(s)
      }

      // d) Send email to BioTouch via Apps Script for EACH group
      for (const [assignedDriver, stops] of Object.entries(groups)) {
        let html = `<div style="font-family:Arial,sans-serif;max-width:700px;">
          <h2 style="color:#0A2463;">Corrections — Driver #${assignedDriver}</h2>
          <p style="color:#666;">Date: ${selectedDate} | Corrections: ${stops.length}</p>
          <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13px;">
            <tr style="background:#0A2463;color:white;">
              <th>Order</th><th>Patient</th><th>Address</th><th>City</th><th>ZIP</th><th>From</th><th>To</th>
            </tr>`
        stops.forEach((s, i) => {
          html += `<tr style="background:${i % 2 ? '#f8f9fa' : 'white'}">
            <td>${s.order_id || s.order_number || ''}</td><td>${s.patient_name || ''}</td>
            <td>${s.address || ''}</td><td>${s.city || ''}</td><td>${s.zip || ''}</td>
            <td>${s.dispatch_driver_number || ''}</td><td>${s.assigned_driver_number || ''}</td></tr>`
        })
        html += '</table></div>'

        await fetch(APPS_SCRIPT_URL, {
          method: 'POST',
          body: JSON.stringify({
            action: 'email',
            to: 'wfldispatch@biotouchglobal.com',
            subject: `Corrections — Driver #${assignedDriver} — ${dayName} ${selectedDate}`,
            html: html
          }),
          mode: 'no-cors'
        })

        // e) Send push notification to each affected driver with city summary
        const driverName = stops[0]?.driver_name
        if (driverName) {
          const cities = [...new Set(stops.map(s => s.city).filter(Boolean))]
          const citySummary = cities.slice(0, 3).join(', ') + (cities.length > 3 ? '...' : '')
          await fetch('/api/actions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'push_notify',
              driverNames: [driverName],
              title: 'Route Corrected',
              body: `${stops.length} stops reassigned to you (${citySummary}).`
            })
          })
        }
      }

      setCorrectionsSent(true)
      showToast(`Corrections sent: ${corrections.length} stops`)
    } catch (err) {
      console.error('Corrections send failed:', err)
      showToast('Corrections send failed')
    } finally {
      setCorrectionsSending(false)
    }
  }

  const [siciPreview, setSiciPreview] = useState(null)

  function handleSICIPreview() {
    const siciStops = allStops.filter(s =>
      CALL_IN_ZIPS.has(s.zip) && (s.pharmacy || '').toUpperCase() !== 'SHSP'
    )
    if (siciStops.length === 0) {
      showToast('No SICI orders found')
      return
    }
    setSiciPreview(siciStops)
  }

  async function handleSICI() {
    const siciStops = siciPreview || allStops.filter(s =>
      CALL_IN_ZIPS.has(s.zip) && (s.pharmacy || '').toUpperCase() !== 'SHSP'
    )
    setSiciSending(true)
    setSiciPreview(null)
    try {
      if (siciStops.length === 0) {
        showToast('No SICI stops found')
        setSiciSending(false)
        return
      }

      // b) Build HTML table
      let html = `<div style="font-family:Arial,sans-serif;max-width:700px;">
        <h2 style="color:#0A2463;">Call In Orders — ${dayName} ${selectedDate}</h2>
        <p style="color:#666;">Total: ${siciStops.length} orders</p>
        <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13px;">
          <tr style="background:#0A2463;color:white;">
            <th>Order #</th><th>Patient</th><th>Address</th><th>City</th><th>ZIP</th>
          </tr>`
      siciStops.forEach((s, i) => {
        html += `<tr style="background:${i % 2 ? '#f8f9fa' : 'white'}">
          <td>${s.order_id || s.order_number || ''}</td><td>${s.patient_name || ''}</td>
          <td>${s.address || ''}</td><td>${s.city || ''}</td><td>${s.zip || ''}</td></tr>`
      })
      html += '</table></div>'

      // c) Send via Apps Script
      await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({
          action: 'email',
          to: 'wfldispatch@biotouchglobal.com',
          subject: `Call In Orders — ${dayName} ${selectedDate}`,
          html: html
        }),
        mode: 'no-cors'
      })

      setSiciSent(true)
      showToast(`SICI sent: ${siciStops.length} orders`)
    } catch (err) {
      console.error('SICI send failed:', err)
      showToast('SICI send failed')
    } finally {
      setSiciSending(false)
    }
  }

  async function handleResendChanges() {
    if (!sentSnapshot) return
    setResending(true)
    try {
      const currentGrouped = groupByDriver(allStops)
      const changedDrivers = []

      // Compare current state to sentSnapshot
      for (const driverName of Object.keys(currentGrouped)) {
        if (driverName === 'Unassigned') continue
        const currentIds = currentGrouped[driverName].map(s => s.order_id || s.id).sort().join(',')
        const snapshotIds = (sentSnapshot[driverName] || []).sort().join(',')
        if (currentIds !== snapshotIds) {
          changedDrivers.push(driverName)
        }
      }
      // Check for drivers that were in snapshot but no longer have stops
      for (const driverName of Object.keys(sentSnapshot)) {
        if (!currentGrouped[driverName] && !changedDrivers.includes(driverName)) {
          changedDrivers.push(driverName)
        }
      }

      if (changedDrivers.length === 0) {
        showToast('No changes detected since last send')
        setResending(false)
        return
      }

      // Send updated emails only to affected drivers
      for (const driverName of changedDrivers) {
        const driverStops = currentGrouped[driverName]
        if (!driverStops || driverStops.length === 0) continue

        const driverEmail = findDriverEmail(driverName)
        if (driverEmail) {
          const html = buildDriverEmailHTML(driverName, driverStops, dayName, selectedDate)
          await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
              action: 'email',
              to: driverEmail,
              subject: `[CNC Delivery] ${driverName} — ${dayName} (Updated)`,
              html: html
            }),
            mode: 'no-cors'
          })
        }

        // Send to Road Warrior if applicable
        if (RW_DRIVERS.includes(driverName)) {
          await fetch('/api/actions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'roadwarrior',
              drivers: [{
                name: driverName,
                routeName: `${driverName} - ${dayName}`,
                stops: [...driverStops].sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999)).map(s => ({
                  order_id: s.order_id, address: s.address, city: s.city, zip: s.zip,
                  cold_chain: s.cold_chain, pharmacy: s.pharmacy
                }))
              }]
            })
          })
        }

        // Send push with change details
        await fetch('/api/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'push_notify',
            driverNames: [driverName],
            title: 'Route Updated',
            body: `Your route has been updated. You now have ${driverStops.length} stops. Open the app to view changes.`
          })
        })
      }

      // Update snapshot
      const snapshot = {}
      for (const driverName of Object.keys(currentGrouped)) {
        if (driverName === 'Unassigned') continue
        snapshot[driverName] = currentGrouped[driverName].map(s => s.order_id || s.id)
      }
      setSentSnapshot(snapshot)

      showToast(`Resent updates to ${changedDrivers.length} driver${changedDrivers.length !== 1 ? 's' : ''}: ${changedDrivers.join(', ')}`)
    } catch (err) {
      console.error('Resend changes failed:', err)
      showToast('Failed to resend changes')
    } finally {
      setResending(false)
    }
  }

  async function handleMoveSelected() {
    if (!moveTarget || selectedStops.size === 0) return

    // Store lastMove for undo
    const movingStops = allStops.filter(s => selectedStops.has(s.id))
    const fromNames = [...new Set(movingStops.map(s => s.driver_name || 'Unassigned'))]
    setLastMove({
      orderIds: [...selectedStops],
      fromNames,
      toName: moveTarget,
      count: selectedStops.size,
      stops: movingStops.map(s => ({ id: s.id, originalDriver: s.driver_name }))
    })

    for (const stopId of selectedStops) {
      await dbUpdate('daily_stops', { driver_name: moveTarget }, { id: stopId })
    }

    // Log each move to dispatch_decisions
    for (const stopId of selectedStops) {
      const stop = allStops.find(s => s.id === stopId)
      if (stop) {
        await fetch('/api/dispatch-log-decision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'log_move',
            deliveryDate: selectedDate,
            orderId: stop.order_id,
            zip: stop.zip,
            city: stop.city,
            pharmacy: stop.pharmacy,
            fromDriver: stop.driver_name,
            toDriver: moveTarget
          })
        })
      }
    }

    const moveCount = selectedStops.size
    setSelectedStops(new Set())
    setShowMoveDropdown(false)
    setMoveTarget('')
    await loadStops(selectedDate)
    showToast(`Moved ${moveCount} stops to ${moveTarget}`)
  }

  async function handleUndo() {
    if (!lastMove) return
    try {
      for (const stopInfo of lastMove.stops) {
        await dbUpdate('daily_stops', { driver_name: stopInfo.originalDriver }, { id: stopInfo.id })
      }
      const undoneCount = lastMove.count
      setLastMove(null)
      await loadStops(selectedDate)
      showToast(`Undid move of ${undoneCount} stops`)
    } catch (err) {
      console.error('Undo failed:', err)
      showToast('Undo failed')
    }
  }


  return {
    sending, siciSent, siciSending,
    correctionsSent, correctionsSending,
    sendingDriver, sentSnapshot, resending,
    lastMove, moveToast, setMoveToast,
    moveTarget, setMoveTarget, showMoveDropdown, setShowMoveDropdown,
    resetSendStates,
    handleSendAll, handleSendDriverRoute,
    handleSendCorrections, handleSICIPreview, handleSICI,
    handleResendChanges, handleMoveSelected, handleUndo,
  }
}
