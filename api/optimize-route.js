// Route optimization engine v6 — Google Route Optimization API
// Uses Google's dedicated logistics-grade TSP solver (formerly Fleet Routing)
// Supports true open-ended routes, no destination hacks needed

import ZIP_COORDS from '../src/lib/zipCoords.js'
import { supabase } from './_lib/supabase.js'
import { requireAuth } from './_lib/auth.js'

const GOOGLE_API_KEY = process.env.GOOGLE_ROUTES_API_KEY
const GOOGLE_GEOCODE_KEY = process.env.GOOGLE_GEOCODE_API_KEY || GOOGLE_API_KEY
const GOOGLE_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'cnc-dispatch'

function toRad(deg) { return deg * Math.PI / 180 }
function haversine(lat1, lon1, lat2, lon2) {
  const R = 3959
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const PHARMACY_ORIGINS = {
  SHSP: [41.0534, -81.5185],
  Aultman: [40.7989, -81.3784],
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const user = await requireAuth(req, res, { allowApiSecret: true })
  if (!user) return

  try {
    const { stops, pharmacy, startLat, startLng, endLat, endLng, oneWay } = req.body
    if (!stops?.length) return res.status(400).json({ error: 'stops array required' })

    const coords = await geocodeStops(stops)
    const withCoords = coords.filter(c => c.lat !== null)
    const withoutCoords = coords.filter(c => c.lat === null)

    if (withCoords.length === 0) {
      return res.json({ optimizedOrder: stops.map((_, i) => i), totalDistance: 0, totalDuration: 0 })
    }

    const phOrigin = PHARMACY_ORIGINS[pharmacy] || PHARMACY_ORIGINS.SHSP
    const origin = (startLat != null && startLng != null) ? [startLat, startLng] : phOrigin
    const hasEnd = endLat != null && endLng != null
    const isOneWay = !hasEnd && (oneWay === true || endLat === undefined)
    const endPoint = hasEnd ? [endLat, endLng] : null

    let optimizedAll, method, totalDistMeters = null, totalDurSeconds = null

    // Try Route Optimization API first (best quality)
    try {
      const result = await routeOptimizationAPI(withCoords, origin, endPoint, isOneWay)
      optimizedAll = result.stops
      totalDistMeters = result.distanceMeters
      totalDurSeconds = result.durationSeconds
      method = 'route-optimization-api'
    } catch (err) {
      console.warn('Route Optimization API failed:', err.message, '— falling back to Routes API')

      // Fallback to Routes API computeRoutes
      try {
        const dest = hasEnd ? endPoint : isOneWay ? null : origin
        const result = await googleRoutesApiFallback(withCoords, origin, dest, isOneWay)
        optimizedAll = result.stops
        totalDistMeters = result.distanceMeters
        totalDurSeconds = result.durationSeconds
        method = 'google-routes-fallback'
      } catch (err2) {
        console.warn('Routes API also failed:', err2.message, '— falling back to OSRM')
        try {
          optimizedAll = await osrmFallback(withCoords, origin[0], origin[1], hasEnd ? endLat : null, hasEnd ? endLng : null)
          method = 'osrm-fallback'
        } catch {
          optimizedAll = nearestNeighbor(withCoords, origin[0], origin[1])
          method = 'nearest-neighbor'
        }
      }
    }

    const optimizedOrder = [...optimizedAll.map(s => s.index), ...withoutCoords.map(c => c.index)]

    let totalDistance, totalDuration
    if (totalDistMeters != null) {
      totalDistance = Math.round((totalDistMeters / 1609.34) * 10) / 10
      totalDuration = totalDurSeconds ? Math.round(totalDurSeconds / 60) : null
    } else {
      totalDistance = 0
      let curLat = origin[0], curLng = origin[1]
      for (const s of optimizedAll) {
        totalDistance += haversine(curLat, curLng, s.lat, s.lng)
        curLat = s.lat; curLng = s.lng
      }
      totalDistance = Math.round(totalDistance * 10) / 10
      totalDuration = null
    }

    // Per-stop reasons
    let curLat = origin[0], curLng = origin[1]
    const reasons = []
    for (const s of optimizedAll) {
      const legDist = haversine(curLat, curLng, s.lat, s.lng)
      let reason = `${Math.round(legDist * 10) / 10} mi from ${reasons.length === 0 ? 'start' : 'previous'}`
      if (s.geocodeMethod === 'zip-center') reason += ' · ZIP estimate'
      if (s.coldChain) reason += ' · Cold chain'
      reasons.push(reason)
      curLat = s.lat; curLng = s.lng
    }
    for (const c of withoutCoords) reasons.push('No geocode — placed at end')

    return res.json({
      optimizedOrder,
      totalDistance,
      totalDuration,
      reasons,
      method,
      summary: `${optimizedAll.length} stops optimized via ${method}`,
    })
  } catch (err) {
    console.error('optimize-route error:', err)
    return res.status(500).json({ error: err.message })
  }
}

// ═══ GOOGLE ROUTE OPTIMIZATION API (primary) ═══
// True logistics-grade TSP solver — supports open-ended routes natively

async function routeOptimizationAPI(stops, origin, endPoint, isOneWay) {
  const now = new Date()
  const globalStart = now.toISOString()
  const globalEnd = new Date(now.getTime() + 12 * 3600000).toISOString() // 12 hour window

  // Build shipments — each stop is a delivery-only shipment
  const shipments = stops.map((s, i) => ({
    label: `stop-${s.index}`,
    deliveries: [{
      arrivalWaypoint: {
        location: {
          latLng: { latitude: s.lat, longitude: s.lng }
        }
      },
      duration: '60s', // 1 min per stop
    }],
  }))

  // Build vehicle — one driver
  const vehicle = {
    label: 'driver',
    startWaypoint: {
      location: {
        latLng: { latitude: origin[0], longitude: origin[1] }
      }
    },
    travelMode: 'DRIVING',
    costPerHour: 30,
    costPerKilometer: 0.5,
  }

  // End location: explicit endpoint, round-trip to origin, or open-ended (omit endWaypoint)
  if (endPoint) {
    vehicle.endWaypoint = {
      location: {
        latLng: { latitude: endPoint[0], longitude: endPoint[1] }
      }
    }
  } else if (!isOneWay) {
    // Round trip — end at origin
    vehicle.endWaypoint = {
      location: {
        latLng: { latitude: origin[0], longitude: origin[1] }
      }
    }
  }
  // If isOneWay and no endPoint: no endWaypoint → open-ended route

  const body = {
    model: {
      shipments,
      vehicles: [vehicle],
      globalStartTime: globalStart,
      globalEndTime: globalEnd,
    },
    searchMode: 'CONSUME_ALL_AVAILABLE_TIME',
    considerRoadTraffic: true,
    timeout: '5s',
  }

  const url = `https://routeoptimization.googleapis.com/v1/projects/${GOOGLE_PROJECT}:optimizeTours`

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_API_KEY,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  })

  const data = await resp.json()

  if (data.error) {
    throw new Error(`Route Optimization: ${data.error.message || JSON.stringify(data.error)}`)
  }

  if (!data.routes?.[0]?.visits?.length) {
    throw new Error('Route Optimization returned no visits')
  }

  const route = data.routes[0]
  const visits = route.visits

  // Map visits back to stops in optimized order
  const optimizedStops = []
  for (const visit of visits) {
    // visit.shipmentIndex is the index into our shipments array
    const shipIdx = visit.shipmentIndex ?? 0
    if (shipIdx < stops.length) {
      optimizedStops.push(stops[shipIdx])
    }
  }

  // Calculate total distance and duration from transitions
  let distanceMeters = 0
  let durationSeconds = 0

  if (route.transitions) {
    for (const t of route.transitions) {
      if (t.travelDistanceMeters) distanceMeters += t.travelDistanceMeters
      if (t.travelDuration) {
        const match = String(t.travelDuration).match(/(\d+)/)
        if (match) durationSeconds += parseInt(match[1], 10)
      }
    }
  }

  // Also check route-level metrics
  if (route.metrics) {
    if (route.metrics.travelDuration) {
      const match = String(route.metrics.travelDuration).match(/(\d+)/)
      if (match) durationSeconds = parseInt(match[1], 10)
    }
  }

  return {
    stops: optimizedStops,
    distanceMeters: distanceMeters || null,
    durationSeconds: durationSeconds || null,
  }
}

// ═══ GOOGLE ROUTES API FALLBACK ═══
// Uses computeRoutes with optimizeWaypointOrder — less accurate but more available

async function googleRoutesApiFallback(stops, origin, endPoint, isOneWay) {
  // For one-way without endpoint, pick farthest stop as dest
  let destination, destStop = null
  if (endPoint) {
    destination = { location: { latLng: { latitude: endPoint[0], longitude: endPoint[1] } } }
  } else if (isOneWay && stops.length > 0) {
    let fIdx = 0, fDist = 0
    for (let i = 0; i < stops.length; i++) {
      const d = haversine(origin[0], origin[1], stops[i].lat, stops[i].lng)
      if (d > fDist) { fDist = d; fIdx = i }
    }
    destStop = stops[fIdx]
    destination = { location: { latLng: { latitude: destStop.lat, longitude: destStop.lng } } }
    stops = stops.filter((_, i) => i !== fIdx)
  } else {
    destination = { location: { latLng: { latitude: origin[0], longitude: origin[1] } } }
  }

  const body = {
    origin: { location: { latLng: { latitude: origin[0], longitude: origin[1] } } },
    destination,
    intermediates: stops.map(s => {
      if (s.lat && s.lng && s.geocodeMethod !== 'zip-center') {
        return { location: { latLng: { latitude: s.lat, longitude: s.lng } } }
      }
      if (s.address && s.city) {
        return { address: `${s.address}, ${s.city}, OH ${s.zip || ''}`.trim() }
      }
      return { location: { latLng: { latitude: s.lat, longitude: s.lng } } }
    }),
    optimizeWaypointOrder: true,
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
  }

  const resp = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_API_KEY,
      'X-Goog-FieldMask': 'routes.optimizedIntermediateWaypointIndex,routes.distanceMeters,routes.duration',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  })

  const data = await resp.json()
  if (data.error) throw new Error(`Routes API: ${data.error.message || JSON.stringify(data.error)}`)
  if (!data.routes?.[0]?.optimizedIntermediateWaypointIndex) throw new Error('Routes API returned no optimized order')

  const route = data.routes[0]
  const order = route.optimizedIntermediateWaypointIndex
  const optimized = order.map(i => stops[i])
  if (destStop) optimized.push(destStop)

  let durationSeconds = null
  if (route.duration) {
    const match = String(route.duration).match(/(\d+)/)
    if (match) durationSeconds = parseInt(match[1], 10)
  }

  return {
    stops: optimized,
    distanceMeters: route.distanceMeters || null,
    durationSeconds,
  }
}

// ═══ OSRM FALLBACK ═══

async function osrmFallback(stops, startLat, startLng, endLat, endLng) {
  const allPoints = [{ lat: startLat, lng: startLng }, ...stops]
  if (endLat != null) allPoints.push({ lat: endLat, lng: endLng })

  const coordStr = allPoints.map(p => `${p.lng},${p.lat}`).join(';')
  const params = endLat != null
    ? 'source=first&destination=last&roundtrip=false'
    : 'source=first&roundtrip=false'

  const url = `https://router.project-osrm.org/trip/v1/driving/${coordStr}?${params}&geometries=geojson&overview=false`
  const resp = await fetch(url, { signal: AbortSignal.timeout(15000) })
  const data = await resp.json()

  if (data.code !== 'Ok' || !data.trips?.length) throw new Error('OSRM failed')

  const waypoints = data.waypoints || []
  const stopWaypoints = waypoints
    .map((wp, inputIdx) => ({ inputIdx, tripPos: wp.waypoint_index }))
    .slice(1, endLat != null ? -1 : undefined)
    .sort((a, b) => a.tripPos - b.tripPos)

  return stopWaypoints.map(wp => stops[wp.inputIdx - 1]).filter(Boolean)
}

// ═══ NEAREST NEIGHBOR FALLBACK ═══

function nearestNeighbor(stops, startLat, startLng) {
  const visited = new Set()
  const result = []
  let curLat = startLat, curLng = startLng

  while (result.length < stops.length) {
    let bestDist = Infinity, bestStop = null
    for (const s of stops) {
      if (visited.has(s.index)) continue
      const d = haversine(curLat, curLng, s.lat, s.lng)
      if (d < bestDist) { bestDist = d; bestStop = s }
    }
    if (!bestStop) break
    visited.add(bestStop.index)
    result.push(bestStop)
    curLat = bestStop.lat; curLng = bestStop.lng
  }
  return result
}

// ═══ GEOCODING ═══

async function geocodeStops(stops) {
  const cacheKeys = stops.map(s =>
    `${(s.address || '').toLowerCase().trim()}|${(s.city || '').toLowerCase().trim()}|${(s.zip || '').trim()}`
  )

  const { data: cached } = await supabase
    .from('geocode_cache')
    .select('cache_key, lat, lng')
    .in('cache_key', cacheKeys)

  const cacheMap = new Map()
  for (const row of (cached || [])) cacheMap.set(row.cache_key, [row.lat, row.lng])

  const results = stops.map((s, i) => {
    const base = { index: i, address: s.address || '', city: s.city || '', zip: s.zip || '', coldChain: !!s.coldChain, sigRequired: !!s.sigRequired }
    if (s.lat && s.lng) return { ...base, lat: s.lat, lng: s.lng, geocodeMethod: 'app' }
    const c = cacheMap.get(cacheKeys[i])
    if (c) return { ...base, lat: c[0], lng: c[1], geocodeMethod: 'precise' }
    return { ...base, lat: null, lng: null, _needsGeocode: true, _stop: s }
  })

  const misses = results.filter(r => r._needsGeocode)

  if (misses.length > 0) {
    await Promise.all(misses.map(async (m) => {
      const s = m._stop
      const r = results[m.index]
      const addr = `${s.address || ''}, ${s.city || ''}, OH ${s.zip || ''}`
      const key = cacheKeys[m.index]

      // 1) Google Geocoding
      if (GOOGLE_GEOCODE_KEY) {
        try {
          const resp = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addr)}&key=${GOOGLE_GEOCODE_KEY}`,
            { signal: AbortSignal.timeout(5000) }
          )
          const data = await resp.json()
          const loc = data.results?.[0]?.geometry?.location
          if (loc) {
            r.lat = loc.lat; r.lng = loc.lng; r.geocodeMethod = 'google'; r._needsGeocode = false
            supabase.from('geocode_cache').upsert({ cache_key: key, lat: loc.lat, lng: loc.lng }, { onConflict: 'cache_key' }).then(() => {})
            return
          }
        } catch {}
      }

      // 2) Census Bureau
      try {
        const resp = await fetch(
          `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(addr)}&benchmark=Public_AR_Current&format=json`,
          { signal: AbortSignal.timeout(8000) }
        )
        const data = await resp.json()
        const match = data?.result?.addressMatches?.[0]
        if (match?.coordinates) {
          r.lat = match.coordinates.y; r.lng = match.coordinates.x; r.geocodeMethod = 'census'; r._needsGeocode = false
          supabase.from('geocode_cache').upsert({ cache_key: key, lat: r.lat, lng: r.lng }, { onConflict: 'cache_key' }).then(() => {})
          return
        }
      } catch {}

      // 3) ZIP center — last resort
      const zip = String(s.zip || '').trim()
      const zc = ZIP_COORDS[zip] || ZIP_COORDS[zip.padStart(5, '0')]
      if (zc) {
        const jitter = () => (Math.random() - 0.5) * 0.002
        r.lat = zc[0] + jitter(); r.lng = zc[1] + jitter(); r.geocodeMethod = 'zip-center'; r._needsGeocode = false
      }
    }))
  }

  return results.map(r => {
    const { _needsGeocode, _stop, ...clean } = r
    return clean
  })
}
