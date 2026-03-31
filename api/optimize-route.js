// Logistics optimization engine
// Minimizes total drive time while respecting delivery constraints:
// 1. Cold chain stops delivered first (temperature-sensitive)
// 2. Route flows from pharmacy → stops → driver's end destination
// 3. Uses OSRM Trip API for real-road TSP solving (not straight-line)
// 4. Falls back to haversine nearest-neighbor + 2-opt if OSRM fails

import ZIP_COORDS from '../src/lib/zipCoords.js'
import { supabase } from './_lib/supabase.js'

function toRad(deg) { return deg * Math.PI / 180 }
function haversine(lat1, lon1, lat2, lon2) {
  const R = 3959
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const PHARMACY_ORIGINS = {
  SHSP: [41.0758, -81.5193],
  Aultman: [40.7914, -81.3939],
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  try {
    const { stops, pharmacy, startLat, startLng, endLat, endLng } = req.body
    if (!stops?.length) return res.status(400).json({ error: 'stops array required' })

    // 1. Geocode all stops (Supabase cache → Census batch → ZIP fallback)
    const coords = await geocodeStops(stops)
    const withCoords = coords.filter(c => c.lat !== null)
    const withoutCoords = coords.filter(c => c.lat === null)

    if (withCoords.length === 0) {
      return res.json({ optimizedOrder: stops.map((_, i) => i), totalDistance: 0 })
    }

    // Use driver's GPS or custom start point if provided, otherwise pharmacy
    const phOrigin = PHARMACY_ORIGINS[pharmacy] || PHARMACY_ORIGINS.SHSP
    const origin = (startLat != null && startLng != null) ? [startLat, startLng] : phOrigin
    const hasEnd = endLat != null && endLng != null

    // Tag cold chain and sig required
    const coldCount = withCoords.filter(c => c.coldChain).length
    const sigCount = withCoords.length >= 40
      ? withCoords.filter(c => !c.coldChain && c.sigRequired).length
      : 0

    // 2. Optimize ALL stops together in one pass (not split by priority)
    // This produces a proper geographic sweep
    let optimizedAll = await optimizeGroup(
      withCoords, origin[0], origin[1],
      hasEnd ? endLat : null, hasEnd ? endLng : null
    )

    // 3. Post-process: bubble cold chain stops to front while keeping geographic order
    // Instead of separate optimization, we extract cold chain stops from the optimized
    // route and move them to the front, preserving their relative geographic order
    if (coldCount > 0) {
      const coldStops = optimizedAll.filter(s => s.coldChain)
      const otherStops = optimizedAll.filter(s => !s.coldChain)
      optimizedAll = [...coldStops, ...otherStops]
    }

    // Similarly for signature-required when 40+ stops
    if (sigCount > 0) {
      const cold = optimizedAll.filter(s => s.coldChain)
      const sig = optimizedAll.filter(s => !s.coldChain && s.sigRequired)
      const rest = optimizedAll.filter(s => !s.coldChain && !s.sigRequired)
      optimizedAll = [...cold, ...sig, ...rest]
    }

    // 4. Build final order
    const optimizedOrder = [...optimizedAll.map(s => s.index), ...withoutCoords.map(c => c.index)]

    // Calculate total distance + per-stop reasoning
    let totalDistance = 0
    let curLat = origin[0], curLng = origin[1]
    const reasons = []
    for (let i = 0; i < optimizedAll.length; i++) {
      const s = optimizedAll[i]
      const legDist = haversine(curLat, curLng, s.lat, s.lng)
      totalDistance += legDist
      let reason = ''
      if (s.coldChain) {
        reason = `Cold chain — delivered first`
      } else if (s.sigRequired && sigCount > 0) {
        reason = `Signature required — priority`
      } else {
        reason = `${Math.round(legDist * 10) / 10} mi from previous`
      }
      if (i === 0) reason += ` · ${Math.round(legDist * 10) / 10} mi from start`
      if (s.geocodeMethod) reason += ` · ${s.geocodeMethod}`
      reasons.push(reason)
      curLat = s.lat; curLng = s.lng
    }
    for (const c of withoutCoords) {
      reasons.push('No geocode — placed at end')
    }
    if (hasEnd) totalDistance += haversine(curLat, curLng, endLat, endLng)

    return res.json({
      optimizedOrder,
      totalDistance: Math.round(totalDistance * 10) / 10,
      coldChainFirst: coldCount,
      sigFirst: sigCount,
      reasons,
      summary: `${coldCount > 0 ? `${coldCount} cold chain first → ` : ''}${sigCount > 0 ? `${sigCount} signature next → ` : ''}${optimizedAll.length - coldCount - sigCount} stops by shortest driving route${hasEnd ? ' → end address' : ''}`,
    })
  } catch (err) {
    console.error('optimize-route error:', err)
    return res.status(500).json({ error: err.message })
  }
}

// Optimize a group of stops using OSRM Trip API (real-road TSP)
// Falls back to haversine nearest-neighbor + 2-opt
async function optimizeGroup(stops, startLat, startLng, endLat, endLng) {
  // Try OSRM Trip first (real driving distances, proper TSP)
  try {
    const result = await osrmTrip(stops, startLat, startLng, endLat, endLng)
    if (result) return result
  } catch (err) {
    console.warn('OSRM Trip failed, using haversine fallback:', err.message)
  }

  // Fallback: haversine nearest-neighbor + 2-opt
  let order = nearestNeighborWithEnd(stops, startLat, startLng, endLat, endLng)
  order = twoOpt(order, startLat, startLng, endLat, endLng)
  return order
}

// OSRM Trip API — solves TSP with real road network distances
async function osrmTrip(stops, startLat, startLng, endLat, endLng) {
  // OSRM has a limit of ~100 waypoints
  if (stops.length > 90) return null

  // Build coordinate string: start + stops + end (if present)
  const allPoints = [{ lat: startLat, lng: startLng }, ...stops]
  if (endLat != null) allPoints.push({ lat: endLat, lng: endLng })

  const coordStr = allPoints.map(p => `${p.lng},${p.lat}`).join(';')

  // source=first: start from origin
  // destination=last: end at driver's end point (if present)
  // roundtrip=false: one-way trip
  const params = endLat != null
    ? 'source=first&destination=last&roundtrip=false'
    : 'source=first&roundtrip=false'

  const url = `https://router.project-osrm.org/trip/v1/driving/${coordStr}?${params}&geometries=geojson&overview=false`

  const resp = await fetch(url, { signal: AbortSignal.timeout(15000) })
  const data = await resp.json()

  if (data.code !== 'Ok' || !data.trips?.length) return null

  const waypoints = data.waypoints || []

  // OSRM waypoints have:
  // - waypoint_index: position in the ORIGINAL input (which point this corresponds to)
  // - trips_index: which trip this belongs to
  // The waypoints array is in the OPTIMIZED trip order.
  //
  // We need to map: for each position in the trip, which original stop is it?
  // waypoints[0] = start (skip), waypoints[last] = end (skip if hasEnd)
  // The rest are stops in optimized order.

  // Build a mapping from trip position to original stop index
  // waypoints are returned IN TRIP ORDER, and waypoint_index tells us
  // which input coordinate each one corresponds to
  const stopWaypoints = waypoints.slice(1, endLat != null ? -1 : undefined)

  // Each waypoint's waypoint_index tells us which input point it is.
  // Input point 0 = start, so stop index = waypoint_index - 1
  // The array order IS the trip order.
  const tripOrder = stopWaypoints.map(wp => {
    const originalInputIdx = wp.waypoint_index
    const stopIdx = originalInputIdx - 1 // subtract 1 for the start point
    return stops[stopIdx]
  }).filter(Boolean)

  if (tripOrder.length !== stops.length) {
    console.warn(`OSRM returned ${tripOrder.length} stops but expected ${stops.length}, falling back`)
    return null
  }

  return tripOrder
}

// Geocode stops from Supabase cache with ZIP fallback
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

  return stops.map((s, i) => {
    const c = cacheMap.get(cacheKeys[i])
    if (c) return { index: i, lat: c[0], lng: c[1], coldChain: !!s.coldChain, sigRequired: !!s.sigRequired, geocodeMethod: 'precise' }

    // ZIP fallback — add small jitter so same-ZIP stops don't stack on exact same point
    const zip = String(s.zip || '').trim()
    const zc = ZIP_COORDS[zip] || ZIP_COORDS[zip.padStart(5, '0')]
    if (zc) {
      // Jitter by ~0.001 degrees (~100m) so OSRM treats them as separate points
      const jitter = () => (Math.random() - 0.5) * 0.002
      return { index: i, lat: zc[0] + jitter(), lng: zc[1] + jitter(), coldChain: !!s.coldChain, sigRequired: !!s.sigRequired, geocodeMethod: 'zip-center' }
    }
    return { index: i, lat: null, lng: null, coldChain: !!s.coldChain, sigRequired: !!s.sigRequired }
  })
}

// Nearest-neighbor biased toward end destination
function nearestNeighborWithEnd(stops, startLat, startLng, endLat, endLng) {
  const visited = new Set()
  const result = []
  let curLat = startLat, curLng = startLng
  const total = stops.length
  const hasEnd = endLat != null

  while (result.length < total) {
    const remaining = total - result.length
    const endWeight = hasEnd ? (remaining <= 3 ? 0.5 : remaining <= 6 ? 0.2 : 0) : 0

    let bestScore = Infinity, bestStop = null
    for (const s of stops) {
      if (visited.has(s.index)) continue
      const d = haversine(curLat, curLng, s.lat, s.lng)
      const score = hasEnd && endWeight > 0
        ? d * (1 - endWeight) + haversine(s.lat, s.lng, endLat, endLng) * endWeight
        : d
      if (score < bestScore) { bestScore = score; bestStop = s }
    }
    if (!bestStop) break
    visited.add(bestStop.index)
    result.push(bestStop)
    curLat = bestStop.lat; curLng = bestStop.lng
  }
  return result
}

// 2-opt: reverse segments to eliminate crossings
function twoOpt(order, startLat, startLng, endLat, endLng) {
  if (order.length < 4) return order
  const route = [...order]
  let improved = true, iterations = 0

  while (improved && iterations < 500) {
    improved = false; iterations++
    for (let i = 0; i < route.length - 1; i++) {
      for (let j = i + 2; j < route.length; j++) {
        const prevI = i === 0 ? { lat: startLat, lng: startLng } : route[i - 1]
        const nextJ = j === route.length - 1 && endLat != null
          ? { lat: endLat, lng: endLng }
          : j < route.length - 1 ? route[j + 1] : null

        const curr = haversine(prevI.lat, prevI.lng, route[i].lat, route[i].lng) +
          (nextJ ? haversine(route[j].lat, route[j].lng, nextJ.lat, nextJ.lng) : 0)
        const swap = haversine(prevI.lat, prevI.lng, route[j].lat, route[j].lng) +
          (nextJ ? haversine(route[i].lat, route[i].lng, nextJ.lat, nextJ.lng) : 0)

        if (swap < curr - 0.01) {
          route.splice(i, j - i + 1, ...route.slice(i, j + 1).reverse())
          improved = true
        }
      }
    }
  }
  return route
}
