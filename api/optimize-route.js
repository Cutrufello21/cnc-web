// Route optimization engine v4 — Clean Google Routes API
// Lets Google solve the full TSP with precise geocoding on every stop
// No pre-sorting, no ZIP-center approximations, real road distances

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
    const { stops, pharmacy, startLat, startLng, endLat, endLng } = req.body
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
    const endPoint = hasEnd ? [endLat, endLng] : origin

    // Send stops directly to Google — no pre-sorting, let Google solve the full TSP
    let optimizedAll, method, googleDistance = null, googleDuration = null

    try {
      const result = await googleOptimize(withCoords, origin, endPoint)
      optimizedAll = result.stops
      googleDistance = result.distanceMeters
      googleDuration = result.durationSeconds
      method = 'google-routes'
    } catch (err) {
      console.warn('Google Routes failed:', err.message, '— falling back to OSRM')
      try {
        optimizedAll = await osrmFallback(withCoords, origin[0], origin[1], hasEnd ? endLat : null, hasEnd ? endLng : null)
        method = 'osrm-fallback'
      } catch {
        optimizedAll = nearestNeighbor(withCoords, origin[0], origin[1], hasEnd ? endLat : null, hasEnd ? endLng : null)
        method = 'nearest-neighbor'
      }
    }

    const optimizedOrder = [...optimizedAll.map(s => s.index), ...withoutCoords.map(c => c.index)]

    // Use Google's real road distance if available, otherwise calculate haversine
    let totalDistance, totalDuration
    if (googleDistance != null) {
      totalDistance = Math.round((googleDistance / 1609.34) * 10) / 10 // meters → miles
      totalDuration = googleDuration ? Math.round(googleDuration / 60) : null // seconds → minutes
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

// ═══ GOOGLE ROUTES API OPTIMIZER ═══

async function googleOptimize(stops, origin, endPoint) {
  if (stops.length <= 98) {
    return googleOptimizeBatch(stops, origin, endPoint)
  }

  // For routes > 98 stops, split and chain
  const chunks = []
  for (let i = 0; i < stops.length; i += 98) {
    chunks.push(stops.slice(i, i + 98))
  }

  let allOptimized = []
  let currentOrigin = origin
  let totalDist = 0, totalDur = 0

  for (const chunk of chunks) {
    const isLast = chunk === chunks[chunks.length - 1]
    const chunkEnd = isLast ? endPoint : null

    const result = await googleOptimizeBatch(chunk, currentOrigin, chunkEnd)
    allOptimized.push(...result.stops)
    if (result.distanceMeters) totalDist += result.distanceMeters
    if (result.durationSeconds) totalDur += result.durationSeconds

    if (result.stops.length > 0) {
      const last = result.stops[result.stops.length - 1]
      currentOrigin = [last.lat, last.lng]
    }
  }

  return { stops: allOptimized, distanceMeters: totalDist, durationSeconds: totalDur }
}

async function googleOptimizeBatch(stops, origin, endPoint) {
  const body = {
    origin: {
      location: { latLng: { latitude: origin[0], longitude: origin[1] } }
    },
    destination: {
      location: { latLng: { latitude: endPoint[0], longitude: endPoint[1] } }
    },
    intermediates: stops.map(s => {
      // Always prefer precise coordinates
      if (s.lat && s.lng && s.geocodeMethod !== 'zip-center') {
        return { location: { latLng: { latitude: s.lat, longitude: s.lng } } }
      }
      // For ZIP-center fallbacks, send the address string so Google geocodes it precisely
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
  // duration comes as "123s" string
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

function nearestNeighbor(stops, startLat, startLng, endLat, endLng) {
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
    // Try Google Geocoding first (most accurate), then Census, then ZIP center
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

      // 2) Census Bureau (free fallback)
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
