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
    const { stops, pharmacy, endLat, endLng } = req.body
    if (!stops?.length) return res.status(400).json({ error: 'stops array required' })

    // 1. Geocode all stops (Supabase cache → ZIP fallback)
    const coords = await geocodeStops(stops)
    const withCoords = coords.filter(c => c.lat !== null)
    const withoutCoords = coords.filter(c => c.lat === null)

    if (withCoords.length === 0) {
      return res.json({ optimizedOrder: stops.map((_, i) => i), totalDistance: 0 })
    }

    const origin = PHARMACY_ORIGINS[pharmacy] || PHARMACY_ORIGINS.SHSP
    const hasEnd = endLat != null && endLng != null

    // 2. Split cold chain (priority) vs regular
    const coldStops = withCoords.filter(c => c.coldChain)
    const regularStops = withCoords.filter(c => !c.coldChain)

    // 3. Optimize each group separately
    let coldOrder = []
    let regularOrder = []

    // Cold chain: pharmacy → cold stops (ordered by real road distance)
    if (coldStops.length > 0) {
      coldOrder = await optimizeGroup(coldStops, origin[0], origin[1], null, null)
    }

    // Regular: last cold stop (or pharmacy) → regular stops → end destination
    const regStart = coldOrder.length > 0
      ? [coldOrder[coldOrder.length - 1].lat, coldOrder[coldOrder.length - 1].lng]
      : origin

    if (regularStops.length > 0) {
      regularOrder = await optimizeGroup(
        regularStops, regStart[0], regStart[1],
        hasEnd ? endLat : null, hasEnd ? endLng : null
      )
    }

    // 4. Combine: cold chain first → regular → ungeocoded at end
    const finalOrder = [...coldOrder, ...regularOrder]
    const optimizedOrder = [...finalOrder.map(s => s.index), ...withoutCoords.map(c => c.index)]

    // Calculate total distance
    let totalDistance = 0
    let curLat = origin[0], curLng = origin[1]
    for (const s of finalOrder) {
      totalDistance += haversine(curLat, curLng, s.lat, s.lng)
      curLat = s.lat; curLng = s.lng
    }
    if (hasEnd) totalDistance += haversine(curLat, curLng, endLat, endLng)

    return res.json({
      optimizedOrder,
      totalDistance: Math.round(totalDistance * 10) / 10,
      coldChainFirst: coldStops.length,
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
  // Build coordinate string: start + stops + end (if present)
  const allPoints = [{ lat: startLat, lng: startLng }, ...stops]
  if (endLat != null) allPoints.push({ lat: endLat, lng: endLng })

  const coordStr = allPoints.map(p => `${p.lng},${p.lat}`).join(';')

  // source=first: start from pharmacy
  // destination=last: end at driver's end point (if present)
  // roundtrip=false: one-way trip
  const params = endLat != null
    ? 'source=first&destination=last&roundtrip=false'
    : 'source=first&roundtrip=false'

  const url = `https://router.project-osrm.org/trip/v1/driving/${coordStr}?${params}&geometries=geojson&overview=false`

  const resp = await fetch(url, { signal: AbortSignal.timeout(10000) })
  const data = await resp.json()

  if (data.code !== 'Ok' || !data.trips?.length) return null

  const trip = data.trips[0]
  const waypoints = data.waypoints || []

  // OSRM returns waypoint_index for each input point
  // Skip the first (pharmacy) and last (end destination) indices
  // Map remaining indices back to our stops
  const stopWaypoints = waypoints.slice(1, endLat != null ? -1 : undefined)

  // Sort stops by their position in the optimized trip
  const orderedIndices = stopWaypoints
    .map((wp, i) => ({ stopIdx: i, tripIdx: wp.waypoint_index }))
    .sort((a, b) => a.tripIdx - b.tripIdx)
    .map(w => w.stopIdx)

  return orderedIndices.map(i => stops[i])
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
    if (c) return { index: i, lat: c[0], lng: c[1], coldChain: !!s.coldChain }
    const zip = String(s.zip || '').trim()
    const zc = ZIP_COORDS[zip] || ZIP_COORDS[zip.padStart(5, '0')]
    if (zc) return { index: i, lat: zc[0], lng: zc[1], coldChain: !!s.coldChain }
    return { index: i, lat: null, lng: null, coldChain: !!s.coldChain }
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
