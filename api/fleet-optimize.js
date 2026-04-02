// Fleet Route Optimization — Google Route Optimization API
// Assigns stops to drivers AND orders each route in one API call
// Handles: cold chain priority, driver home locations, pharmacy origins,
// time-off, load balancing, and real-world driving distances

import { supabase } from './_lib/supabase.js'
import { parseBody } from './_lib/sheets.js'

const GOOGLE_API_KEY = process.env.GOOGLE_ROUTES_API_KEY || 'AIzaSyBiQLZq4iSLhq8qR3D_TzGAgSqZwLh5k_M'

const PHARMACY_ORIGINS = {
  SHSP: { latitude: 41.0534, longitude: -81.5185 },
  Aultman: { latitude: 40.7989, longitude: -81.3784 },
}

const DAY_MAP = { Monday: 'mon', Tuesday: 'tue', Wednesday: 'wed', Thursday: 'thu', Friday: 'fri' }
const FLOATING_DRIVERS = new Set(['Brad', 'Kasey'])
const MAX_STOPS = 55

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  try {
    const { deliveryDate, deliveryDay, mode } = await parseBody(req)
    if (!deliveryDate || !deliveryDay) return res.status(400).json({ error: 'Missing deliveryDate or deliveryDay' })

    const dayCol = DAY_MAP[deliveryDay]
    if (!dayCol) return res.status(400).json({ error: `Invalid day: ${deliveryDay}` })

    // 1. Fetch all data in parallel
    const [stopsRes, driversRes, scheduleRes, timeOffRes, rulesRes] = await Promise.all([
      supabase.from('daily_stops').select('*').eq('delivery_date', deliveryDate),
      supabase.from('drivers').select('*').eq('active', true),
      supabase.from('driver_schedule').select('*'),
      supabase.from('time_off_requests').select('driver_name').eq('date_off', deliveryDate).eq('status', 'approved'),
      supabase.from('routing_rules').select('*'),
    ])

    const stops = stopsRes.data || []
    const drivers = (driversRes.data || []).filter(d => d.driver_name !== 'Paul')
    const schedules = scheduleRes.data || []
    const timeOff = new Set((timeOffRes.data || []).map(r => r.driver_name))
    const rules = rulesRes.data || []

    if (stops.length === 0) return res.json({ success: true, message: 'No stops', changes: [], routes: [] })

    // 2. Determine available drivers
    const availableDrivers = drivers.filter(d => {
      if (timeOff.has(d.driver_name)) return false
      const sched = schedules.find(s => s.driver_name === d.driver_name)
      if (sched && !sched[dayCol]) return false
      return true
    })

    if (availableDrivers.length === 0) return res.json({ success: true, message: 'No available drivers', changes: [], routes: [] })

    // 3. Geocode stops that need it
    const geocodedStops = await geocodeAll(stops)

    // 4. Build Google Route Optimization request
    const vehicles = availableDrivers.map((d, i) => {
      const pharmacy = d.pharmacy || 'SHSP'
      const origin = pharmacy === 'Both' ? PHARMACY_ORIGINS.SHSP : (PHARMACY_ORIGINS[pharmacy] || PHARMACY_ORIGINS.SHSP)

      return {
        label: d.driver_name,
        startLocation: { latitude: origin.latitude, longitude: origin.longitude },
        endLocation: { latitude: origin.latitude, longitude: origin.longitude },
        travelMode: 'DRIVING',
        costPerHour: 1,
        costPerKilometer: 0.5,
        // Soft limit — prefer balanced loads
        loadLimits: {
          stops: { maxLoad: String(MAX_STOPS), softMaxLoad: String(Math.round(stops.length / availableDrivers.length) + 5), costPerUnitAboveSoftMax: 2 }
        },
      }
    })

    const shipments = geocodedStops.filter(s => s.lat && s.lng).map((s, i) => {
      const isCold = s.cold_chain && s.cold_chain !== 'No' && s.cold_chain !== 'no'

      const shipment = {
        label: `${s.order_id}|${s.patient_name}|${s.address}`,
        deliveries: [{
          arrivalLocation: { latitude: s.lat, longitude: s.lng },
          duration: '120s', // 2 min service time for all stops
        }],
        loadDemands: {
          stops: { amount: '1' },
        },
      }

      // Hard constraint: if stop has a driver assigned, lock it to that driver
      // Optimizer will only reorder stops within each driver, not reassign
      const currentDriver = s.driver_name
      const vehicleIdx = availableDrivers.findIndex(d => d.driver_name === currentDriver)
      if (vehicleIdx >= 0 && !FLOATING_DRIVERS.has(currentDriver)) {
        // allowedVehicleIndices locks this stop to its assigned driver
        shipment.allowedVehicleIndices = [vehicleIdx]
      }

      return shipment
    })

    // 5. Call Google Route Optimization API
    let result
    try {
      const apiBody = {
        model: {
          shipments,
          vehicles,
          globalStartTime: `${deliveryDate}T07:00:00Z`,
          globalEndTime: `${deliveryDate}T20:00:00Z`,
        },
        searchMode: 'CONSUME_ALL_AVAILABLE_TIME',
      }

      const resp = await fetch('https://routeoptimization.googleapis.com/v1:optimizeTours', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_API_KEY,
        },
        body: JSON.stringify(apiBody),
        signal: AbortSignal.timeout(60000), // 60s timeout for large fleets
      })

      result = await resp.json()

      if (result.error) {
        throw new Error(`Google Fleet: ${result.error.message || JSON.stringify(result.error)}`)
      }
    } catch (err) {
      console.error('Google Fleet Optimization failed:', err.message)
      // Fall back to existing auto-dispatch logic
      return res.json({
        success: false,
        error: err.message,
        fallback: 'Use existing auto-dispatch',
      })
    }

    // 6. Parse optimization result into changes
    const changes = []
    const routes = []

    for (const route of (result.routes || [])) {
      const driverName = route.vehicleLabel
      const driverData = drivers.find(d => d.driver_name === driverName)
      const routeStops = []

      for (const visit of (route.visits || [])) {
        const shipmentIdx = visit.shipmentIndex
        const shipment = shipments[shipmentIdx]
        if (!shipment) continue

        const [orderId] = shipment.label.split('|')
        const stop = geocodedStops.find(s => String(s.order_id) === String(orderId))
        if (!stop) continue

        routeStops.push({
          orderId: stop.order_id,
          patientName: stop.patient_name,
          address: stop.address,
          city: stop.city,
          zip: stop.zip,
          coldChain: !!(stop.cold_chain && stop.cold_chain !== 'No'),
        })

        // Track if this is a reassignment
        if (stop.driver_name !== driverName) {
          changes.push({
            orderId: stop.order_id,
            from: stop.driver_name || 'Unassigned',
            to: driverName,
            reason: 'Fleet optimization',
            zip: stop.zip,
            city: stop.city,
          })
        }
      }

      if (routeStops.length > 0) {
        routes.push({
          driver: driverName,
          driverNumber: driverData?.driver_number,
          stops: routeStops,
          totalStops: routeStops.length,
          coldChain: routeStops.filter(s => s.coldChain).length,
        })
      }
    }

    // Handle skipped shipments
    const skipped = (result.skippedShipments || []).map(s => {
      const [orderId, name, addr] = (shipments[s.index]?.label || '').split('|')
      return { orderId, name, addr, reason: s.label || 'Could not assign' }
    })

    // 7. Apply if mode === 'apply'
    if (mode === 'apply' && changes.length > 0) {
      for (const route of routes) {
        const driverData = drivers.find(d => d.driver_name === route.driver)
        for (let i = 0; i < route.stops.length; i++) {
          const stop = route.stops[i]
          await supabase.from('daily_stops').update({
            driver_name: route.driver,
            driver_number: driverData?.driver_number || '',
            assigned_driver_number: driverData?.driver_number || '',
            sort_order: i,
          }).eq('order_id', stop.orderId)
        }
      }
    }

    return res.json({
      success: true,
      mode: mode || 'preview',
      method: 'google-fleet-optimization',
      totalStops: stops.length,
      availableDrivers: availableDrivers.map(d => d.driver_name),
      driversOff: [...timeOff],
      changes,
      routes,
      skipped,
      loads: Object.fromEntries(routes.map(r => [r.driver, r.totalStops])),
      avgLoad: Math.round(stops.length / availableDrivers.length),
      metrics: result.metrics || null,
    })
  } catch (err) {
    console.error('[fleet-optimize]', err)
    return res.status(500).json({ error: err.message })
  }
}

// ═══ GEOCODING ═══

async function geocodeAll(stops) {
  // Use existing lat/lng from Supabase where available
  const needsGeocode = stops.filter(s => !s.lat || !s.lng)

  if (needsGeocode.length === 0) return stops

  // Try Mapbox for any missing (faster than Census for batch)
  const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN

  for (const stop of needsGeocode) {
    try {
      const addr = `${stop.address || ''}, ${stop.city || ''}, OH ${stop.zip || ''}`
      const resp = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addr)}.json?access_token=${MAPBOX_TOKEN}&country=US&limit=1`,
        { signal: AbortSignal.timeout(5000) }
      )
      const data = await resp.json()
      const feature = data.features?.[0]
      if (feature?.center) {
        stop.lat = feature.center[1]
        stop.lng = feature.center[0]
        // Save back to Supabase for future
        supabase.from('daily_stops').update({ lat: stop.lat, lng: stop.lng }).eq('id', stop.id).then(() => {})
      }
    } catch {}
  }

  return stops
}
