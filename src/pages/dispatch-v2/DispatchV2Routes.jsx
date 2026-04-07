import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import DispatchV2Shell from '../../components/dispatch-v2/DispatchV2Shell'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

const CALL_IN_ZIPS = new Set([
  '43450','43903','43908','43945','43986','43988',
  '44134','44136','44141','44147','44203','44216','44217','44230','44270','44273','44276','44281','44314',
  '44423','44427','44460',
  '44606','44607','44608','44612','44613','44620','44624','44625','44626','44627','44629','44632','44634',
  '44645','44651','44659','44662','44672','44675','44678','44681','44683','44691','44695','44697',
])

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxw2xx2atYfnEfGzCaTmkDShmt96D1JsLFSckScOndB94RV2IGev63fpS7Ndc0GqSHWWQ/exec'

const RW_DRIVERS = ['Alex','Josh','Laura','Mark','Mike','Nick','Dom']

function getDefaultDate() {
  const offset = parseInt(localStorage.getItem('dv2-date-offset') || '1', 10)
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toLocaleDateString('en-CA')
}

function parseDateSafe(dateStr) {
  return new Date(dateStr + 'T12:00:00')
}

function formatDateDisplay(dateStr) {
  const d = parseDateSafe(dateStr)
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

function getWeekDates(dateStr) {
  const d = parseDateSafe(dateStr)
  const dayOfWeek = d.getDay()
  // Monday = 1, so offset from Monday
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = new Date(d)
  monday.setDate(d.getDate() + mondayOffset)

  const dates = []
  for (let i = 0; i < 5; i++) {
    const day = new Date(monday)
    day.setDate(monday.getDate() + i)
    dates.push(day.toLocaleDateString('en-CA'))
  }
  return dates
}

function groupByDriver(stops) {
  const map = {}
  for (const s of stops) {
    const name = s.driver_name || 'Unassigned'
    if (!map[name]) map[name] = []
    map[name].push(s)
  }
  return map
}

function buildDriverEmailHTML(driverName, stops, dayName, date) {
  const sorted = [...stops].sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
  let html = `<div style="font-family:Arial,sans-serif;max-width:700px;">
    <h2 style="color:#0A2463;">${driverName} — ${dayName}</h2>
    <p style="color:#666;">Date: ${date} | Stops: ${sorted.length} | Cold Chain: ${sorted.filter(s => s.cold_chain).length}</p>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13px;">
      <tr style="background:#0A2463;color:white;">
        <th>#</th><th>Order</th><th>Patient</th><th>Address</th><th>City</th><th>ZIP</th><th>CC</th><th>Sig</th>
      </tr>`
  sorted.forEach((s, i) => {
    const cold = s.cold_chain ? '❄️' : ''
    const sig = (s.notes || '').toLowerCase().includes('signature') ? '✍️' : ''
    html += `<tr style="background:${i % 2 ? '#f8f9fa' : 'white'}">
      <td>${i + 1}</td><td>${s.order_id || ''}</td><td>${s.patient_name || ''}</td>
      <td>${s.address || ''}</td><td>${s.city || ''}</td><td>${s.zip || ''}</td>
      <td>${cold}</td><td>${sig}</td></tr>`
  })
  html += '</table></div>'
  return html
}

export default function DispatchV2Routes() {
  const [selectedDate, setSelectedDate] = useState(getDefaultDate)
  const [allStops, setAllStops] = useState([])
  const [loading, setLoading] = useState(true)
  const [driverFilter, setDriverFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedStops, setSelectedStops] = useState(new Set())
  const [expandedDrivers, setExpandedDrivers] = useState(new Set())
  const [optimizing, setOptimizing] = useState(new Set())
  const [showSendModal, setShowSendModal] = useState(false)
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState('')
  const [moveTarget, setMoveTarget] = useState('')
  const [showMoveDropdown, setShowMoveDropdown] = useState(false)
  const [allDrivers, setAllDrivers] = useState([])
  const [siciSent, setSiciSent] = useState(false)
  const [siciSending, setSiciSending] = useState(false)
  const [correctionsSent, setCorrectionsSent] = useState(false)
  const [correctionsSending, setCorrectionsSending] = useState(false)
  const [sendingDriver, setSendingDriver] = useState('')
  const [sentSnapshot, setSentSnapshot] = useState(null)
  const [lastMove, setLastMove] = useState(null)
  const [moveToast, setMoveToast] = useState('')
  const [resending, setResending] = useState(false)

  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate])
  const grouped = useMemo(() => groupByDriver(allStops), [allStops])
  const driverNames = useMemo(() => Object.keys(grouped).sort(), [grouped])
  const allDriverNames = useMemo(() => {
    const fromStops = Object.keys(grouped)
    const fromTable = allDrivers.map(d => d.driver_name || d.name).filter(Boolean)
    return [...new Set([...fromStops, ...fromTable])].sort()
  }, [grouped, allDrivers])

  const dayName = useMemo(() => parseDateSafe(selectedDate).toLocaleDateString('en-US', { weekday: 'long' }), [selectedDate])

  const loadStops = useCallback(async (date) => {
    setLoading(true)
    const { data } = await supabase
      .from('daily_stops')
      .select('*')
      .eq('delivery_date', date)
      .order('sort_order', { ascending: true })
    setAllStops(data || [])
    setSelectedStops(new Set())
    setLoading(false)
  }, [])

  const loadDrivers = useCallback(async () => {
    const { data } = await supabase.from('drivers').select('*').eq('active', true)
    setAllDrivers(data || [])
  }, [])

  useEffect(() => {
    loadDrivers()
  }, [loadDrivers])

  useEffect(() => {
    loadStops(selectedDate)
    // Reset sent states when date changes
    setSiciSent(false)
    setCorrectionsSent(false)
    setSentSnapshot(null)
    setLastMove(null)
  }, [selectedDate, loadStops])

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  function shiftDate(delta) {
    const d = parseDateSafe(selectedDate)
    d.setDate(d.getDate() + delta)
    setSelectedDate(d.toLocaleDateString('en-CA'))
  }

  function goToday() {
    setSelectedDate(new Date().toLocaleDateString('en-CA'))
  }

  // Find driver email from allDrivers
  function findDriverEmail(driverName) {
    const driver = allDrivers.find(d => (d.driver_name || d.name) === driverName)
    return driver?.email || null
  }

  // Driver card stats
  function getDriverStats(driverStops) {
    const uniqueAddresses = new Set(driverStops.map(s => s.address))
    const coldCount = driverStops.filter(s => s.cold_chain).length
    const hasOrder = driverStops.some(s => s.sort_order !== null && s.sort_order !== undefined)
    return {
      stopCount: uniqueAddresses.size,
      packageCount: driverStops.length,
      coldCount,
      status: hasOrder ? 'Optimized' : 'Not Sent',
    }
  }

  async function handleOptimize(driverName) {
    const driverStops = grouped[driverName]
    if (!driverStops || driverStops.length === 0) return

    setOptimizing(prev => new Set(prev).add(driverName))
    try {
      const res = await fetch('/api/optimize-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stops: driverStops.map(s => ({
            address: s.address,
            city: s.city,
            zip: s.zip,
            coldChain: s.cold_chain,
          })),
          pharmacy: driverStops[0]?.pharmacy || 'SHSP',
          driverName: driverName,
        }),
      })
      const result = await res.json()
      if (result.optimizedOrder) {
        for (let i = 0; i < result.optimizedOrder.length; i++) {
          const stop = driverStops[result.optimizedOrder[i]]
          if (stop) {
            await fetch('/api/db', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                table: 'daily_stops',
                operation: 'update',
                data: { sort_order: i },
                match: { id: stop.id },
              }),
            })
          }
        }
        await loadStops(selectedDate)
        showToast(`Route optimized for ${driverName}`)
      }
    } catch (err) {
      console.error('Optimize failed:', err)
      showToast('Optimization failed')
    } finally {
      setOptimizing(prev => {
        const next = new Set(prev)
        next.delete(driverName)
        return next
      })
    }
  }

  async function handleOptimizeAll() {
    const dayName = parseDateSafe(selectedDate).toLocaleDateString('en-US', { weekday: 'long' })
    setOptimizing(new Set(['__all__']))
    try {
      const res = await fetch('/api/fleet-optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliveryDate: selectedDate,
          deliveryDay: dayName,
          mode: 'apply',
        }),
      })
      const result = await res.json()
      if (result.error) {
        showToast(`Optimization failed: ${result.error}`)
      } else {
        await loadStops(selectedDate)
        const moved = result.moved || result.changes || 0
        showToast(`Fleet optimized — ${typeof moved === 'number' ? moved + ' changes' : 'routes updated'}`)
      }
    } catch (err) {
      console.error('Fleet optimize failed:', err)
      showToast('Fleet optimization failed')
    } finally {
      setOptimizing(new Set())
    }
  }

  async function handleSendAll() {
    setSending(true)
    try {
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

  async function handleSICI() {
    setSiciSending(true)
    try {
      // a) Filter allStops for ZIPs in CALL_IN_ZIPS where pharmacy !== 'SHSP'
      const siciStops = allStops.filter(s =>
        CALL_IN_ZIPS.has(s.zip) && (s.pharmacy || '').toUpperCase() !== 'SHSP'
      )
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
      await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: 'daily_stops',
          operation: 'update',
          data: { driver_name: moveTarget },
          match: { id: stopId },
        }),
      })
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
        await fetch('/api/db', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            table: 'daily_stops',
            operation: 'update',
            data: { driver_name: stopInfo.originalDriver },
            match: { id: stopInfo.id },
          }),
        })
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

  function toggleStopSelect(id) {
    setSelectedStops(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleExpanded(driverName) {
    setExpandedDrivers(prev => {
      const next = new Set(prev)
      if (next.has(driverName)) next.delete(driverName)
      else next.add(driverName)
      return next
    })
  }

  // Filtered stops for the table
  const filteredStops = useMemo(() => {
    let stops = allStops
    if (driverFilter) {
      stops = stops.filter(s => s.driver_name === driverFilter)
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      stops = stops.filter(s =>
        (s.patient_name && s.patient_name.toLowerCase().includes(q)) ||
        (s.address && s.address.toLowerCase().includes(q)) ||
        (s.city && s.city.toLowerCase().includes(q)) ||
        (s.zip && s.zip.toLowerCase().includes(q))
      )
    }
    return stops
  }, [allStops, driverFilter, searchQuery])

  // Summary stats
  const totalPackages = allStops.length
  const totalStops = new Set(allStops.map(s => s.address)).size
  const activeDrivers = driverNames.filter(n => n !== 'Unassigned').length
  const coldChainCount = allStops.filter(s => s.cold_chain).length
  const unassignedCount = allStops.filter(s => !s.driver_name || s.driver_name.trim() === '').length
  const totalDriverCount = allDrivers.length

  // Drivers with no stops today
  const driversWithStops = useMemo(() => new Set(
    allStops.filter(s => s.driver_name).map(s => s.driver_name)
  ), [allStops])
  const noStopsDrivers = useMemo(() =>
    allDrivers.filter(d => {
      const name = d.driver_name || d.name
      return name && !driversWithStops.has(name)
    }),
    [allDrivers, driversWithStops]
  )

  return (
    <DispatchV2Shell title="Routes">
      {/* Date Navigation + Action Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <button className="dv2-btn dv2-btn-ghost dv2-btn-sm" onClick={() => shiftDate(-1)}>&larr;</button>
        <span style={{ fontSize: 15, fontWeight: 600, minWidth: 180, textAlign: 'center' }}>
          {formatDateDisplay(selectedDate)}
        </span>
        <button className="dv2-btn dv2-btn-ghost dv2-btn-sm" onClick={() => shiftDate(1)}>&rarr;</button>
        <button className="dv2-btn dv2-btn-ghost dv2-btn-sm" onClick={goToday}>Today</button>
        <div style={{ display: 'flex', gap: 4, marginLeft: 12 }}>
          {DAYS.map((day, i) => (
            <button
              key={day}
              className={`dv2-btn dv2-btn-sm ${weekDates[i] === selectedDate ? 'dv2-btn-navy' : 'dv2-btn-ghost'}`}
              onClick={() => setSelectedDate(weekDates[i])}
            >
              {day}
            </button>
          ))}
        </div>

        {/* Right-aligned action buttons */}
        <div style={{ flex: 1 }} />
        {lastMove && (
          <button
            onClick={handleUndo}
            style={{
              padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
              background: 'transparent',
              border: '1px solid #f59e0b',
              color: '#f59e0b',
            }}
          >
            Undo Move ({lastMove.count})
          </button>
        )}
        <button
          className="dv2-btn dv2-btn-navy dv2-btn-sm"
          onClick={handleOptimizeAll}
          disabled={optimizing.size > 0}
        >
          {optimizing.size > 0 ? 'Optimizing...' : 'Optimize'}
        </button>
        <button
          onClick={handleSICI}
          disabled={siciSending || siciSent}
          style={{
            padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
            background: 'transparent',
            border: siciSent ? '1px solid #34d399' : '1px solid #f59e0b',
            color: siciSent ? '#34d399' : '#f59e0b',
          }}
        >
          {siciSending ? 'Sending...' : siciSent ? 'SICI Sent' : 'SICI'}
        </button>
        <button
          onClick={handleSendCorrections}
          disabled={correctionsSending || correctionsSent}
          style={{
            padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
            background: 'transparent',
            border: correctionsSent ? '1px solid #34d399' : '1px solid rgba(255,255,255,0.2)',
            color: correctionsSent ? '#34d399' : 'rgba(255,255,255,0.7)',
          }}
        >
          {correctionsSending ? 'Sending...' : correctionsSent ? 'Corrections Sent' : 'Send Corrections'}
        </button>
        {sentSnapshot && (
          <button
            onClick={handleResendChanges}
            disabled={resending}
            style={{
              padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
              background: 'transparent',
              border: '1px solid #60a5fa',
              color: '#60a5fa',
            }}
          >
            {resending ? 'Resending...' : 'Resend Changes'}
          </button>
        )}
        <button
          className="dv2-btn dv2-btn-emerald dv2-btn-sm"
          onClick={() => setShowSendModal(true)}
        >
          Send Routes
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'rgba(255,255,255,0.4)' }}>
          Loading stops...
        </div>
      ) : (
        <div style={{ paddingBottom: 70 }}>
          {/* Summary Stat Cards */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20,
          }}>
            <div className="dv2-card" style={{ textAlign: 'center', padding: '16px 12px' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>{allStops.length}</div>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>Total Stops</div>
            </div>
            <div className="dv2-card" style={{ textAlign: 'center', padding: '16px 12px' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#60a5fa' }}>{coldChainCount}</div>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>Cold Chain</div>
            </div>
            <div className="dv2-card" style={{ textAlign: 'center', padding: '16px 12px' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>
                {activeDrivers}<span style={{ fontSize: 14, fontWeight: 400, color: 'rgba(255,255,255,0.4)' }}> / {totalDriverCount}</span>
              </div>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>Active Drivers</div>
            </div>
            <div className="dv2-card" style={{ textAlign: 'center', padding: '16px 12px' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: unassignedCount > 0 ? '#f87171' : '#fff' }}>{unassignedCount}</div>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>Unassigned</div>
            </div>
          </div>

          {/* Driver Cards — horizontal grid */}
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: 500, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Drivers ({activeDrivers})
            </h3>
            {driverNames.length === 0 && (
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, padding: 20 }}>
                No stops for this date
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {driverNames.map(driverName => {
              const driverStops = grouped[driverName]
              const stats = getDriverStats(driverStops)
              const isSendingThis = sendingDriver === driverName

              return (
                <div
                  key={driverName}
                  className="dv2-card"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setDriverFilter(driverFilter === driverName ? '' : driverName)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{driverName}</span>
                      {driverStops[0]?.pharmacy && (
                        <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 4, background: driverStops[0].pharmacy === 'Aultman' ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)', color: driverStops[0].pharmacy === 'Aultman' ? '#f87171' : '#60a5fa' }}>
                          {driverStops[0].pharmacy}
                        </span>
                      )}
                    </div>
                    <span className={`dv2-badge ${stats.status === 'Optimized' ? 'dv2-badge-emerald' : 'dv2-badge-amber'}`} style={{ fontSize: 9 }}>
                      {stats.status}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>
                    <span><strong style={{ color: '#fff', fontSize: 16 }}>{stats.stopCount}</strong> stops</span>
                    <span><strong style={{ color: '#fff', fontSize: 16 }}>{stats.packageCount}</strong> pkgs</span>
                    {stats.coldCount > 0 && (
                      <span><strong style={{ color: '#60a5fa', fontSize: 16 }}>{stats.coldCount}</strong> cold</span>
                    )}
                  </div>

                  {/* Send button */}
                  <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    <button
                      className="dv2-btn dv2-btn-sm"
                      style={{
                        padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6,
                        background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
                        color: 'rgba(255,255,255,0.6)', cursor: 'pointer',
                      }}
                      onClick={e => { e.stopPropagation(); handleSendDriverRoute(driverName) }}
                      disabled={isSendingThis}
                    >
                      {isSendingThis ? '...' : 'Send'}
                    </button>
                  </div>
                </div>
              )
            })}
            </div>
          </div>

          {/* No Stops Today Section */}
          {noStopsDrivers.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', fontWeight: 500, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                No Stops Today ({noStopsDrivers.length})
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {noStopsDrivers.map(driver => {
                  const dName = driver.driver_name || driver.name
                  const pharmacy = driver.pharmacy || driver.origin_pharmacy || ''
                  return (
                  <div
                    key={driver.id || dName}
                    style={{
                      background: '#2A2A2E', borderRadius: 8, padding: '8px 14px',
                      display: 'flex', alignItems: 'center', gap: 8,
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>{dName}</span>
                    {pharmacy && (
                      <span style={{
                        fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 4,
                        background: pharmacy.toLowerCase().includes('aultman') ? 'rgba(239,68,68,0.15)' : pharmacy.toLowerCase() === 'both' ? 'rgba(168,85,247,0.15)' : 'rgba(59,130,246,0.15)',
                        color: pharmacy.toLowerCase().includes('aultman') ? '#f87171' : pharmacy.toLowerCase() === 'both' ? '#c084fc' : '#60a5fa',
                      }}>
                        {pharmacy}
                      </span>
                    )}
                    <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase' }}>0 stops</span>
                  </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Stop Table — full width below driver cards */}
          <div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
              <h3 style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: 500, margin: 0, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Stops ({filteredStops.length})
              </h3>
              <div style={{ flex: 1 }} />
              <select
                className="dv2-select"
                value={driverFilter}
                onChange={e => setDriverFilter(e.target.value)}
                style={{ minWidth: 140 }}
              >
                <option value="">All Drivers</option>
                {allDriverNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <input
                className="dv2-input"
                placeholder="Search..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ width: 160 }}
              />
              {selectedStops.size > 0 && (
                <div style={{ position: 'relative' }}>
                  <button
                    className="dv2-btn dv2-btn-ghost dv2-btn-sm"
                    onClick={() => setShowMoveDropdown(!showMoveDropdown)}
                  >
                    Move Selected ({selectedStops.size})
                  </button>
                  {showMoveDropdown && (
                    <div style={{
                      position: 'absolute', top: '100%', right: 0, marginTop: 4,
                      background: '#2A2A2E', border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 8, padding: 12, zIndex: 50, minWidth: 200,
                    }}>
                      <select
                        className="dv2-select"
                        value={moveTarget}
                        onChange={e => setMoveTarget(e.target.value)}
                        style={{ width: '100%', marginBottom: 8 }}
                      >
                        <option value="">Select driver...</option>
                        {allDriverNames.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                      <button
                        className="dv2-btn dv2-btn-navy dv2-btn-sm"
                        style={{ width: '100%' }}
                        onClick={handleMoveSelected}
                        disabled={!moveTarget}
                      >
                        Move
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="dv2-card" style={{ padding: 0, overflow: 'auto' }}>
              <table className="dv2-table">
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>
                      <input
                        type="checkbox"
                        checked={filteredStops.length > 0 && filteredStops.every(s => selectedStops.has(s.id))}
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedStops(new Set(filteredStops.map(s => s.id)))
                          } else {
                            setSelectedStops(new Set())
                          }
                        }}
                      />
                    </th>
                    <th>#</th>
                    <th>Patient</th>
                    <th>Address</th>
                    <th>City</th>
                    <th>ZIP</th>
                    <th>Driver</th>
                    <th>PKG</th>
                    <th>Cold</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStops.map((stop, idx) => (
                    <tr key={stop.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedStops.has(stop.id)}
                          onChange={() => toggleStopSelect(stop.id)}
                        />
                      </td>
                      <td style={{ color: 'rgba(255,255,255,0.3)' }}>{idx + 1}</td>
                      <td style={{ fontWeight: 500, color: '#fff' }}>{stop.patient_name || '-'}</td>
                      <td>{stop.address || '-'}</td>
                      <td>{stop.city || '-'}</td>
                      <td>{stop.zip || '-'}</td>
                      <td>
                        <span className="dv2-badge dv2-badge-navy">{stop.driver_name || '-'}</span>
                      </td>
                      <td>{stop.package_count !== undefined ? stop.package_count : 1}</td>
                      <td>{stop.cold_chain ? 'Yes' : '-'}</td>
                    </tr>
                  ))}
                  {filteredStops.length === 0 && (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: 32, color: 'rgba(255,255,255,0.3)' }}>
                        No stops found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}


      {/* Send Modal */}
      {showSendModal && (
        <div className="dv2-modal-overlay" onClick={() => !sending && setShowSendModal(false)}>
          <div className="dv2-modal" onClick={e => e.stopPropagation()}>
            <h3>Send Routes</h3>
            <p>
              Send routes to {activeDrivers} driver{activeDrivers !== 1 ? 's' : ''} for{' '}
              {formatDateDisplay(selectedDate)}?
            </p>
            <div className="dv2-modal-actions">
              <button
                className="dv2-btn dv2-btn-ghost"
                onClick={() => setShowSendModal(false)}
                disabled={sending}
              >
                Cancel
              </button>
              <button
                className="dv2-btn dv2-btn-emerald"
                onClick={handleSendAll}
                disabled={sending}
              >
                {sending ? 'Sending...' : 'Confirm & Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className="dv2-toast">{toast}</div>}
    </DispatchV2Shell>
  )
}
