// Route optimization engine — OSRM Trip API
// Solves TSP using real driving distances on actual road network
// Falls back to nearest-neighbor + 2-opt if OSRM fails

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

    const coords = await geocodeStops(stops)
    const withCoords = coords.filter(c => c.lat !== null)
    const withoutCoords = coords.filter(c => c.lat === null)

    if (withCoords.length === 0) {
      return res.json({ optimizedOrder: stops.map((_, i) => i), totalDistance: 0 })
    }

    const phOrigin = PHARMACY_ORIGINS[pharmacy] || PHARMACY_ORIGINS.SHSP
    const origin = (startLat != null && startLng != null) ? [startLat, startLng] : phOrigin
    const hasEnd = endLat != null && endLng != null

    // Optimize all stops in one pass
    const { stops: optimizedAll, method } = await optimizeGroup(
      withCoords, origin[0], origin[1],
      hasEnd ? endLat : null, hasEnd ? endLng : null
    )

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
      reasons,
      method,
      summary: `${optimizedAll.length} stops via ${method}${hasEnd ? ' → end address' : ''}`,
    })
  } catch (err) {
    console.error('optimize-route error:', err)
    return res.status(500).json({ error: err.message })
  }
}

async function optimizeGroup(stops, startLat, startLng, endLat, endLng) {
  // Try OSRM Trip API
  try {
    const result = await osrmTrip(stops, startLat, startLng, endLat, endLng)
    if (result) return { stops: result, method: 'osrm' }
  } catch (err) {
    console.warn('OSRM failed:', err.message)
  }

  // Fallback
  let order = nearestNeighborWithEnd(stops, startLat, startLng, endLat, endLng)
  order = twoOpt(order, startLat, startLng, endLat, endLng)
  return { stops: order, method: 'nearest-neighbor' }
}

async function osrmTrip(stops, startLat, startLng, endLat, endLng) {
  if (stops.length > 90) return null

  // Build points: start + all stops + optional end
  const allPoints = [{ lat: startLat, lng: startLng }, ...stops]
  if (endLat != null) allPoints.push({ lat: endLat, lng: endLng })

  const coordStr = allPoints.map(p => `${p.lng},${p.lat}`).join(';')
  const params = endLat != null
    ? 'source=first&destination=last&roundtrip=false'
    : 'source=first&roundtrip=false'

  const url = `https://router.project-osrm.org/trip/v1/driving/${coordStr}?${params}&geometries=geojson&overview=false`
  const resp = await fetch(url, { signal: AbortSignal.timeout(15000) })
  const data = await resp.json()

  if (data.code !== 'Ok' || !data.trips?.length) return null

  const waypoints = data.waypoints || []

  // OSRM waypoints are returned in INPUT order.
  // Each waypoint has waypoint_index = its position in the OPTIMIZED trip.
  //
  // Example: 5 input points [start, A, B, C, D]
  //   waypoints[0].waypoint_index = 0 (start is trip position 0)
  //   waypoints[1].waypoint_index = 3 (A is trip position 3)
  //   waypoints[2].waypoint_index = 1 (B is trip position 1)
  //   waypoints[3].waypoint_index = 2 (C is trip position 2)
  //   waypoints[4].waypoint_index = 4 (D is trip position 4)
  // Trip order: start → B → C → A → D
  //
  // To get stops in trip order:
  // 1. Skip start (index 0) and end (last, if hasEnd)
  // 2. Sort remaining by waypoint_index
  // 3. Map back to original stop objects

  const stopWaypoints = waypoints
    .map((wp, inputIdx) => ({ inputIdx, tripPos: wp.waypoint_index }))
    .slice(1, endLat != null ? -1 : undefined) // skip start and optional end
    .sort((a, b) => a.tripPos - b.tripPos)      // sort by trip position

  const tripOrder = stopWaypoints.map(wp => {
    const stopIdx = wp.inputIdx - 1 // subtract 1 because input[0] is start
    return stops[stopIdx]
  }).filter(Boolean)

  if (tripOrder.length !== stops.length) {
    console.warn(`OSRM: got ${tripOrder.length} stops, expected ${stops.length}`)
    return null
  }

  return tripOrder
}

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

    const zip = String(s.zip || '').trim()
    const zc = ZIP_COORDS[zip] || ZIP_COORDS[zip.padStart(5, '0')]
    if (zc) {
      const jitter = () => (Math.random() - 0.5) * 0.002
      return { index: i, lat: zc[0] + jitter(), lng: zc[1] + jitter(), coldChain: !!s.coldChain, sigRequired: !!s.sigRequired, geocodeMethod: 'zip-center' }
    }
    return { index: i, lat: null, lng: null, coldChain: !!s.coldChain, sigRequired: !!s.sigRequired }
  })
}

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
