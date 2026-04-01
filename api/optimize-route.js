// Route optimization engine v3 — Google Routes API
// Uses Google's production-grade route optimizer for perfect stop ordering
// Handles up to 98 waypoints per request with real traffic data

import ZIP_COORDS from '../src/lib/zipCoords.js'
import { supabase } from './_lib/supabase.js'

const GOOGLE_API_KEY = process.env.GOOGLE_ROUTES_API_KEY || 'AIzaSyBiQLZq4iSLhq8qR3D_TzGAgSqZwLh5k_M'

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

  try {
    const { stops, pharmacy, startLat, startLng, endLat, endLng } = req.body
    if (!stops?.length) return res.status(400).json({ error: 'stops array required' })

    const coords = await geocodeStops(stops)
    const withCoords = coords.filter(c => c.lat !== null)
    const withoutCoords = coords.filter(c => c.lat === null)

    if (withCoords.length === 0) {
      return res.json({ optimizedOrder: stops.map((_, i) => i), totalDistance: 0 })
    }

    const phOrigin = PHARMACY_ORIGINS[pharmacy] || PHARMACY_ORIGINS.SHSP
    const origin = (startLat != null && startLng != null) ? [startLat, startLng] : phOrigin
    const hasEnd = endLat != null && endLng != null
    const endPoint = hasEnd ? [endLat, endLng] : origin // default round-trip back to origin

    // Use Google Routes API for optimization
    let optimizedAll, method

    try {
      optimizedAll = await googleOptimize(withCoords, origin, endPoint)
      method = 'google-routes'
    } catch (err) {
      console.warn('Google Routes failed:', err.message, '— falling back to OSRM')
      try {
        optimizedAll = await osrmFallback(withCoords, origin[0], origin[1], hasEnd ? endLat : null, hasEnd ? endLng : null)
        method = 'osrm-fallback'
      } catch {
        // Last resort: nearest neighbor by haversine
        optimizedAll = nearestNeighbor(withCoords, origin[0], origin[1], hasEnd ? endLat : null, hasEnd ? endLng : null)
        method = 'nearest-neighbor'
      }
    }

    const optimizedOrder = [...optimizedAll.map(s => s.index), ...withoutCoords.map(c => c.index)]

    let totalDistance = 0
    let curLat = origin[0], curLng = origin[1]
    const reasons = []
    for (let i = 0; i < optimizedAll.length; i++) {
      const s = optimizedAll[i]
      const legDist = haversine(curLat, curLng, s.lat, s.lng)
      totalDistance += legDist
      let reason = `${Math.round(legDist * 10) / 10} mi from ${i === 0 ? 'start' : 'previous'}`
      if (s.geocodeMethod === 'zip-center') reason += ' · ZIP estimate'
      if (s.coldChain) reason += ' · Cold chain'
      reasons.push(reason)
      curLat = s.lat; curLng = s.lng
    }
    for (const c of withoutCoords) reasons.push('No geocode — placed at end')
    if (hasEnd) totalDistance += haversine(curLat, curLng, endLat, endLng)

    return res.json({
      optimizedOrder,
      totalDistance: Math.round(totalDistance * 10) / 10,
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
// Google handles up to 98 intermediates per request
// For larger routes, we chunk into batches

async function googleOptimize(stops, origin, endPoint) {
  // Google Routes supports up to 98 intermediate waypoints
  if (stops.length <= 98) {
    return googleOptimizeBatch(stops, origin, endPoint)
  }

  // For routes > 98 stops, split geographically and chain
  const chunks = []
  for (let i = 0; i < stops.length; i += 98) {
    chunks.push(stops.slice(i, i + 98))
  }

  let allOptimized = []
  let currentOrigin = origin

  for (const chunk of chunks) {
    const isLast = chunk === chunks[chunks.length - 1]
    const chunkEnd = isLast ? endPoint : null

    const optimized = await googleOptimizeBatch(chunk, currentOrigin, chunkEnd)
    allOptimized.push(...optimized)

    // Next chunk starts from where this one ended
    if (optimized.length > 0) {
      const last = optimized[optimized.length - 1]
      currentOrigin = [last.lat, last.lng]
    }
  }

  return allOptimized
}

async function googleOptimizeBatch(stops, origin, endPoint) {
  const body = {
    origin: {
      location: { latLng: { latitude: origin[0], longitude: origin[1] } }
    },
    destination: {
      location: { latLng: { latitude: endPoint[0], longitude: endPoint[1] } }
    },
    intermediates: stops.map(s => ({
      location: { latLng: { latitude: s.lat, longitude: s.lng } }
    })),
    optimizeWaypointOrder: true,
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE',
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

  const order = data.routes[0].optimizedIntermediateWaypointIndex
  return order.map(i => stops[i])
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
    const c = cacheMap.get(cacheKeys[i])
    if (c) return { index: i, lat: c[0], lng: c[1], coldChain: !!s.coldChain, sigRequired: !!s.sigRequired, geocodeMethod: 'precise' }

    const zip = String(s.zip || '').trim()
    const zc = ZIP_COORDS[zip] || ZIP_COORDS[zip.padStart(5, '0')]
    if (zc) {
      const jitter = () => (Math.random() - 0.5) * 0.002
      return { index: i, lat: zc[0] + jitter(), lng: zc[1] + jitter(), coldChain: !!s.coldChain, sigRequired: !!s.sigRequired, geocodeMethod: 'zip-center' }
    }
    return { index: i, lat: null, lng: null, coldChain: !!s.coldChain, sigRequired: !!s.sigRequired, _needsGeocode: true, _stop: s }
  })

  const misses = results.filter(r => r._needsGeocode)
  if (misses.length > 0) {
    const geocodeOne = async (m) => {
      const s = m._stop
      const addr = encodeURIComponent(`${s.address || ''}, ${s.city || ''}, OH ${s.zip || ''}`)
      try {
        const resp = await fetch(
          `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${addr}&benchmark=Public_AR_Current&format=json`,
          { signal: AbortSignal.timeout(10000) }
        )
        const data = await resp.json()
        const match = data?.result?.addressMatches?.[0]
        if (match?.coordinates) {
          const lat = match.coordinates.y
          const lng = match.coordinates.x
          const r = results[m.index]
          r.lat = lat; r.lng = lng; r.geocodeMethod = 'census'; r._needsGeocode = false
          const key = `${(s.address || '').toLowerCase().trim()}|${(s.city || '').toLowerCase().trim()}|${(s.zip || '').trim()}`
          supabase.from('geocode_cache').upsert({ cache_key: key, lat, lng }, { onConflict: 'cache_key' }).then(() => {})
        }
      } catch {}
    }
    await Promise.all(misses.map(geocodeOne))
  }

  return results.map(r => {
    const { _needsGeocode, _stop, ...clean } = r
    return clean
  })
}
