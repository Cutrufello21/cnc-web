// Route optimization engine v5 — Best-of-N endpoint selection
// For one-way routes: tries multiple endpoint candidates, picks shortest
// Clean Google TSP with precise geocoding, real road distances

import ZIP_COORDS from '../src/lib/zipCoords.js'
import { supabase } from './_lib/supabase.js'
import { requireAuth } from './_lib/auth.js'

const GOOGLE_API_KEY = process.env.GOOGLE_ROUTES_API_KEY
const GOOGLE_GEOCODE_KEY = process.env.GOOGLE_GEOCODE_API_KEY || GOOGLE_API_KEY

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

    let optimizedAll, method, googleDistance = null, googleDuration = null

    try {
      if (isOneWay && withCoords.length > 2) {
        // Best-of-N: try multiple endpoint candidates, pick shortest route
        const result = await googleOptimizeBestEndpoint(withCoords, origin)
        optimizedAll = result.stops
        googleDistance = result.distanceMeters
        googleDuration = result.durationSeconds
        method = `google-routes-best-of-${result.candidatesTried}`
      } else {
        const dest = endPoint || origin // round trip if not one-way and no endpoint
        const result = await googleOptimizeBatch(withCoords, origin, dest)
        optimizedAll = result.stops
        googleDistance = result.distanceMeters
        googleDuration = result.durationSeconds
        method = 'google-routes'
      }
    } catch (err) {
      console.warn('Google Routes failed:', err.message, '— falling back to OSRM')
      try {
        optimizedAll = await osrmFallback(withCoords, origin[0], origin[1], hasEnd ? endLat : null, hasEnd ? endLng : null)
        method = 'osrm-fallback'
      } catch {
        optimizedAll = nearestNeighbor(withCoords, origin[0], origin[1])
        method = 'nearest-neighbor'
      }
    }

    const optimizedOrder = [...optimizedAll.map(s => s.index), ...withoutCoords.map(c => c.index)]

    // Use Google's real road distance if available
    let totalDistance, totalDuration
    if (googleDistance != null) {
      totalDistance = Math.round((googleDistance / 1609.34) * 10) / 10
      totalDuration = googleDuration ? Math.round(googleDuration / 60) : null
    } else {
      totalDistance = 0
      let curLat = origin[0], curLng = origin[1]
      for (const s of optimizedAll) {
        totalDistance += haversine(curLat, curLng, s.lat, s.lng)
        curLat = s.lat; curLng = s.lng
      }
      if (hasEnd) totalDistance += haversine(curLat, curLng, endLat, endLng)
      totalDistance = Math.round(totalDistance * 10) / 10
      totalDuration = null
    }

    // Build per-stop reasons
    let curLat = origin[0], curLng = origin[1]
    const reasons = []
    for (let i = 0; i < optimizedAll.length; i++) {
      const s = optimizedAll[i]
      const legDist = haversine(curLat, curLng, s.lat, s.lng)
      let reason = `${Math.round(legDist * 10) / 10} mi from ${i === 0 ? 'start' : 'previous'}`
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

// ═══ BEST-OF-N ENDPOINT SELECTION ═══
// For one-way routes, the choice of destination stop heavily affects the TSP solution.
// We pick 3-4 geographic extreme candidates, run Google on each in parallel,
// and return the shortest route.

function pickEndpointCandidates(stops, origin) {
  if (stops.length <= 3) return [0] // too few to bother

  const candidates = new Set()

  // 1) Farthest from origin
  let farthestIdx = 0, farthestDist = 0
  for (let i = 0; i < stops.length; i++) {
    const d = haversine(origin[0], origin[1], stops[i].lat, stops[i].lng)
    if (d > farthestDist) { farthestDist = d; farthestIdx = i }
  }
  candidates.add(farthestIdx)

  // 2) Farthest from centroid (most isolated stop)
  const cLat = stops.reduce((a, s) => a + s.lat, 0) / stops.length
  const cLng = stops.reduce((a, s) => a + s.lng, 0) / stops.length
  let isolatedIdx = 0, isolatedDist = 0
  for (let i = 0; i < stops.length; i++) {
    const d = haversine(cLat, cLng, stops[i].lat, stops[i].lng)
    if (d > isolatedDist) { isolatedDist = d; isolatedIdx = i }
  }
  candidates.add(isolatedIdx)

  // 3) Geographic extremes: most north, most south, most east, most west
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity
  let southIdx = 0, northIdx = 0, westIdx = 0, eastIdx = 0
  for (let i = 0; i < stops.length; i++) {
    if (stops[i].lat < minLat) { minLat = stops[i].lat; southIdx = i }
    if (stops[i].lat > maxLat) { maxLat = stops[i].lat; northIdx = i }
    if (stops[i].lng < minLng) { minLng = stops[i].lng; westIdx = i }
    if (stops[i].lng > maxLng) { maxLng = stops[i].lng; eastIdx = i }
  }

  // Pick the 2 extremes farthest from origin (avoid redundant candidates near origin)
  const extremes = [
    { idx: southIdx, dist: haversine(origin[0], origin[1], stops[southIdx].lat, stops[southIdx].lng) },
    { idx: northIdx, dist: haversine(origin[0], origin[1], stops[northIdx].lat, stops[northIdx].lng) },
    { idx: westIdx, dist: haversine(origin[0], origin[1], stops[westIdx].lat, stops[westIdx].lng) },
    { idx: eastIdx, dist: haversine(origin[0], origin[1], stops[eastIdx].lat, stops[eastIdx].lng) },
  ].sort((a, b) => b.dist - a.dist)

  candidates.add(extremes[0].idx)
  if (extremes[1].idx !== extremes[0].idx) candidates.add(extremes[1].idx)

  return [...candidates].slice(0, 4) // max 4 candidates
}

async function googleOptimizeBestEndpoint(stops, origin) {
  const candidateIdxs = pickEndpointCandidates(stops, origin)

  // Run Google Routes in parallel for each candidate endpoint
  const results = await Promise.allSettled(
    candidateIdxs.map(async (destIdx) => {
      const destStop = stops[destIdx]
      const intermediates = stops.filter((_, i) => i !== destIdx)
      const dest = [destStop.lat, destStop.lng]

      const result = await googleOptimizeBatch(intermediates, origin, dest)
      // Append destination stop at the end
      result.stops.push(destStop)
      return result
    })
  )

  // Pick the result with the shortest distance
  let best = null
  for (const r of results) {
    if (r.status !== 'fulfilled') continue
    const result = r.value
    if (!best || (result.distanceMeters && result.distanceMeters < best.distanceMeters)) {
      best = result
    }
  }

  if (!best) throw new Error('All endpoint candidates failed')

  best.candidatesTried = candidateIdxs.length
  return best
}

// ═══ GOOGLE ROUTES API ═══

async function googleOptimizeBatch(stops, origin, endPoint) {
  const body = {
    origin: {
      location: { latLng: { latitude: origin[0], longitude: origin[1] } }
    },
    destination: {
      location: { latLng: { latitude: endPoint[0], longitude: endPoint[1] } }
    },
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

  if (data.error) {
    throw new Error(`Google Routes: ${data.error.message || JSON.stringify(data.error)}`)
  }

  if (!data.routes?.[0]?.optimizedIntermediateWaypointIndex) {
    throw new Error('Google Routes returned no optimized order')
  }

  const route = data.routes[0]
  const order = route.optimizedIntermediateWaypointIndex
  const distanceMeters = route.distanceMeters || null
  let durationSeconds = null
  if (route.duration) {
    const match = String(route.duration).match(/(\d+)/)
    if (match) durationSeconds = parseInt(match[1], 10)
  }

  return {
    stops: order.map(i => stops[i]),
    distanceMeters,
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
// Priority: app-supplied coords → cache → Google Geocoding → Census → ZIP center (last resort)

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

      // 1) Google Geocoding API
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
