// Route optimization engine — Mapbox Optimization API
// Solves TSP using real driving distances on actual road network
// Falls back to nearest-neighbor + 2-opt if Mapbox fails

import ZIP_COORDS from '../src/lib/zipCoords.js'
import { supabase } from './_lib/supabase.js'

const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN

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

    // 1. Geocode all stops
    const coords = await geocodeStops(stops)
    const withCoords = coords.filter(c => c.lat !== null)
    const withoutCoords = coords.filter(c => c.lat === null)

    if (withCoords.length === 0) {
      return res.json({ optimizedOrder: stops.map((_, i) => i), totalDistance: 0 })
    }

    // Use driver's GPS or custom start, otherwise pharmacy
    const phOrigin = PHARMACY_ORIGINS[pharmacy] || PHARMACY_ORIGINS.SHSP
    const origin = (startLat != null && startLng != null) ? [startLat, startLng] : phOrigin
    const hasEnd = endLat != null && endLng != null

    // 2. Optimize — Mapbox first, then fallback
    let optimizedAll = await optimizeGroup(
      withCoords, origin[0], origin[1],
      hasEnd ? endLat : null, hasEnd ? endLng : null
    )

    // 3. Build response
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
      summary: `${optimizedAll.length} stops optimized by shortest driving route${hasEnd ? ' → end address' : ''}`,
    })
  } catch (err) {
    console.error('optimize-route error:', err)
    return res.status(500).json({ error: err.message })
  }
}

async function optimizeGroup(stops, startLat, startLng, endLat, endLng) {
  // Try Mapbox Optimization API first
  try {
    const result = await mapboxOptimize(stops, startLat, startLng, endLat, endLng)
    if (result) return result
  } catch (err) {
    console.warn('Mapbox Optimization failed:', err.message)
  }

  // Fallback: nearest-neighbor + 2-opt
  let order = nearestNeighborWithEnd(stops, startLat, startLng, endLat, endLng)
  order = twoOpt(order, startLat, startLng, endLat, endLng)
  return order
}

// Mapbox Optimization API v1 — proper TSP with real road network
// https://docs.mapbox.com/api/navigation/optimization-v1/
async function mapboxOptimize(stops, startLat, startLng, endLat, endLng) {
  // Mapbox limit: 12 coordinates (including start/end) on free tier
  // If more than 10 stops, batch into chunks and chain them
  const MAX_WAYPOINTS = 10 // 12 total minus start and possible end

  if (stops.length <= MAX_WAYPOINTS) {
    return await mapboxOptimizeBatch(stops, startLat, startLng, endLat, endLng)
  }

  // For large routes: split into geographic clusters, optimize each, chain them
  const clusters = clusterStops(stops, MAX_WAYPOINTS)
  const result = []
  let curLat = startLat, curLng = startLng

  for (let c = 0; c < clusters.length; c++) {
    const isLast = c === clusters.length - 1
    const batchEnd = isLast && endLat != null ? { lat: endLat, lng: endLng } : null

    let optimized
    try {
      optimized = await mapboxOptimizeBatch(
        clusters[c], curLat, curLng,
        batchEnd ? batchEnd.lat : null, batchEnd ? batchEnd.lng : null
      )
    } catch {
      // Fallback for this batch
      optimized = nearestNeighborWithEnd(
        clusters[c], curLat, curLng,
        batchEnd ? batchEnd.lat : null, batchEnd ? batchEnd.lng : null
      )
      optimized = twoOpt(optimized, curLat, curLng,
        batchEnd ? batchEnd.lat : null, batchEnd ? batchEnd.lng : null
      )
    }

    result.push(...optimized)
    if (optimized.length > 0) {
      const last = optimized[optimized.length - 1]
      curLat = last.lat; curLng = last.lng
    }
  }

  return result
}

// Single Mapbox Optimization API call (max 12 coordinates)
async function mapboxOptimizeBatch(stops, startLat, startLng, endLat, endLng) {
  const allPoints = [{ lat: startLat, lng: startLng }, ...stops]
  if (endLat != null) allPoints.push({ lat: endLat, lng: endLng })

  const coordStr = allPoints.map(p => `${p.lng},${p.lat}`).join(';')

  // source=first: start from origin
  // destination=last: end at driver's end point (if present)
  // roundtrip=false: one-way optimized trip
  const params = endLat != null
    ? 'source=first&destination=last&roundtrip=false'
    : 'source=first&roundtrip=false'

  const url = `https://api.mapbox.com/optimized-trips/v1/driving/${coordStr}?${params}&geometries=geojson&overview=false&access_token=${MAPBOX_TOKEN}`

  const resp = await fetch(url, { signal: AbortSignal.timeout(15000) })
  const data = await resp.json()

  if (data.code !== 'Ok' || !data.trips?.length) {
    console.warn('Mapbox Optimization response:', data.code, data.message)
    return null
  }

  const waypoints = data.waypoints || []

  // Mapbox returns waypoints in INPUT order, each with a waypoint_index
  // that indicates its position in the OPTIMIZED trip.
  // We need to sort by waypoint_index to get trip order.
  const stopWaypoints = endLat != null
    ? waypoints.slice(1, -1) // skip start and end
    : waypoints.slice(1)     // skip start only

  // Create pairs of (original stop, trip position) and sort by trip position
  const tripOrder = stopWaypoints
    .map((wp, i) => ({ stop: stops[i], tripPos: wp.waypoint_index }))
    .sort((a, b) => a.tripPos - b.tripPos)
    .map(item => item.stop)

  if (tripOrder.length !== stops.length) {
    console.warn(`Mapbox returned ${tripOrder.length} stops, expected ${stops.length}`)
    return null
  }

  return tripOrder
}

// Split stops into geographic clusters for batching
function clusterStops(stops, maxPerCluster) {
  // Simple geographic clustering: sort by angle from centroid, then split
  const centLat = stops.reduce((s, p) => s + p.lat, 0) / stops.length
  const centLng = stops.reduce((s, p) => s + p.lng, 0) / stops.length

  // Sort by angle from centroid (geographic sweep)
  const sorted = [...stops].sort((a, b) => {
    const angleA = Math.atan2(a.lat - centLat, a.lng - centLng)
    const angleB = Math.atan2(b.lat - centLat, b.lng - centLng)
    return angleA - angleB
  })

  // Split into chunks
  const clusters = []
  for (let i = 0; i < sorted.length; i += maxPerCluster) {
    clusters.push(sorted.slice(i, i + maxPerCluster))
  }
  return clusters
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

    const zip = String(s.zip || '').trim()
    const zc = ZIP_COORDS[zip] || ZIP_COORDS[zip.padStart(5, '0')]
    if (zc) {
      const jitter = () => (Math.random() - 0.5) * 0.002
      return { index: i, lat: zc[0] + jitter(), lng: zc[1] + jitter(), coldChain: !!s.coldChain, sigRequired: !!s.sigRequired, geocodeMethod: 'zip-center' }
    }
    return { index: i, lat: null, lng: null, coldChain: !!s.coldChain, sigRequired: !!s.sigRequired }
  })
}

// Nearest-neighbor fallback
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
