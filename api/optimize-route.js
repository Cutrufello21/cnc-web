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
  // For small routes (≤11 stops), try Mapbox Optimization first, then OSRM
  if (stops.length <= 11) {
    try {
      const result = await osrmTrip(stops, startLat, startLng, endLat, endLng)
      if (result) return { stops: result, method: 'mapbox-optimized' }
    } catch (err) {
      console.warn('Optimize failed:', err.message)
    }
  }

  // For larger routes, use cluster-then-optimize approach
  if (stops.length > 11) {
    try {
      const result = await clusterOptimize(stops, startLat, startLng, endLat, endLng)
      if (result) return { stops: result, method: 'cluster-optimized' }
    } catch (err) {
      console.warn('Cluster optimize failed:', err.message)
    }
  }

  // Try OSRM for medium routes
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

// Cluster stops geographically, optimize within each cluster, then order clusters
async function clusterOptimize(stops, startLat, startLng, endLat, endLng) {
  const CLUSTER_SIZE = 10

  // Use nearest-neighbor to get a rough order first
  let rough = nearestNeighborWithEnd(stops, startLat, startLng, endLat, endLng)
  rough = twoOpt(rough, startLat, startLng, endLat, endLng)

  // Split into sequential clusters of CLUSTER_SIZE
  const clusters = []
  for (let i = 0; i < rough.length; i += CLUSTER_SIZE) {
    clusters.push(rough.slice(i, i + CLUSTER_SIZE))
  }

  // Optimize each cluster individually
  const optimizedClusters = await Promise.all(clusters.map(async (cluster, ci) => {
    const clusterStart = ci === 0
      ? [startLat, startLng]
      : [clusters[ci - 1][clusters[ci - 1].length - 1].lat, clusters[ci - 1][clusters[ci - 1].length - 1].lng]
    const isLast = ci === clusters.length - 1
    const clusterEnd = isLast && endLat != null ? [endLat, endLng] : null

    try {
      const result = await osrmTrip(
        cluster,
        clusterStart[0], clusterStart[1],
        clusterEnd ? clusterEnd[0] : null,
        clusterEnd ? clusterEnd[1] : null
      )
      return result || cluster
    } catch {
      return cluster
    }
  }))

  return optimizedClusters.flat()
}

async function osrmTrip(stops, startLat, startLng, endLat, endLng) {
  if (stops.length > 90) return null

  const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN || process.env.RNMAPBOX_MAPS_DOWNLOAD_TOKEN

  // Try Mapbox Optimization API first (better results, 12 waypoint limit per request)
  if (MAPBOX_TOKEN && stops.length <= 11) {
    try {
      const result = await mapboxOptimize(stops, startLat, startLng, endLat, endLng, MAPBOX_TOKEN)
      if (result) return result
    } catch (err) {
      console.warn('Mapbox Optimize failed:', err.message)
    }
  }

  // For larger routes or if Mapbox fails, use OSRM
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

  const stopWaypoints = waypoints
    .map((wp, inputIdx) => ({ inputIdx, tripPos: wp.waypoint_index }))
    .slice(1, endLat != null ? -1 : undefined)
    .sort((a, b) => a.tripPos - b.tripPos)

  const tripOrder = stopWaypoints.map(wp => {
    const stopIdx = wp.inputIdx - 1
    return stops[stopIdx]
  }).filter(Boolean)

  if (tripOrder.length !== stops.length) {
    console.warn(`OSRM: got ${tripOrder.length} stops, expected ${stops.length}`)
    return null
  }

  return tripOrder
}

async function mapboxOptimize(stops, startLat, startLng, endLat, endLng, token) {
  // Mapbox Optimization API handles up to 12 coordinates (including start/end)
  const allPoints = [{ lat: startLat, lng: startLng }, ...stops]
  if (endLat != null) allPoints.push({ lat: endLat, lng: endLng })
  if (allPoints.length > 12) return null

  const coordStr = allPoints.map(p => `${p.lng},${p.lat}`).join(';')

  // distributions: all stop indices are pickups (no dropoffs needed)
  const stopIndices = stops.map((_, i) => i + 1) // +1 because index 0 is start
  const distributions = stopIndices.map(i => `${i},${i}`).join(';')

  const params = new URLSearchParams({
    access_token: token,
    geometries: 'geojson',
    overview: 'false',
    source: 'first',
    roundtrip: 'false',
  })
  if (endLat != null) params.set('destination', 'last')

  const url = `https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${coordStr}?${params}`
  const resp = await fetch(url, { signal: AbortSignal.timeout(15000) })
  const data = await resp.json()

  if (data.code !== 'Ok' || !data.trips?.length) return null

  const waypoints = data.waypoints || []
  const stopWaypoints = waypoints
    .map((wp, inputIdx) => ({ inputIdx, tripPos: wp.waypoint_index }))
    .slice(1, endLat != null ? -1 : undefined)
    .sort((a, b) => a.tripPos - b.tripPos)

  const tripOrder = stopWaypoints.map(wp => {
    const stopIdx = wp.inputIdx - 1
    return stops[stopIdx]
  }).filter(Boolean)

  if (tripOrder.length !== stops.length) return null
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

  // First pass: use cache and ZIP fallback
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

  // Second pass: geocode misses via Census Bureau single-address API (parallel)
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
          // Cache for next time
          const key = `${(s.address || '').toLowerCase().trim()}|${(s.city || '').toLowerCase().trim()}|${(s.zip || '').trim()}`
          supabase.from('geocode_cache').upsert({ cache_key: key, lat, lng }, { onConflict: 'cache_key' }).then(() => {})
        }
      } catch {}
    }
    await Promise.all(misses.map(geocodeOne))
  }

  // Clean up internal fields
  return results.map(r => {
    const { _needsGeocode, _stop, ...clean } = r
    return clean
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

function totalDist(route, startLat, startLng, endLat, endLng) {
  let d = haversine(startLat, startLng, route[0].lat, route[0].lng)
  for (let i = 1; i < route.length; i++) d += haversine(route[i-1].lat, route[i-1].lng, route[i].lat, route[i].lng)
  if (endLat != null) d += haversine(route[route.length-1].lat, route[route.length-1].lng, endLat, endLng)
  return d
}

function twoOpt(order, startLat, startLng, endLat, endLng) {
  if (order.length < 4) return order
  const route = [...order]
  let improved = true, iterations = 0

  while (improved && iterations < 1000) {
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

  // Or-opt: try moving each stop to a better position
  let orImproved = true, orIter = 0
  while (orImproved && orIter < 500) {
    orImproved = false; orIter++
    for (let i = 0; i < route.length; i++) {
      const stop = route[i]
      const before = i === 0 ? { lat: startLat, lng: startLng } : route[i - 1]
      const after = i === route.length - 1
        ? (endLat != null ? { lat: endLat, lng: endLng } : null)
        : route[i + 1]

      // Cost of removing stop from current position
      const removeCost = haversine(before.lat, before.lng, stop.lat, stop.lng) +
        (after ? haversine(stop.lat, stop.lng, after.lat, after.lng) : 0) -
        (after ? haversine(before.lat, before.lng, after.lat, after.lng) : 0)

      let bestJ = -1, bestSaving = 0
      for (let j = 0; j < route.length; j++) {
        if (j === i || j === i - 1) continue
        const pJ = j === 0 ? { lat: startLat, lng: startLng } : route[j - 1]
        const nJ = route[j]
        const insertCost = haversine(pJ.lat, pJ.lng, stop.lat, stop.lng) +
          haversine(stop.lat, stop.lng, nJ.lat, nJ.lng) -
          haversine(pJ.lat, pJ.lng, nJ.lat, nJ.lng)
        const saving = removeCost - insertCost
        if (saving > bestSaving + 0.01) { bestSaving = saving; bestJ = j }
      }
      if (bestJ >= 0) {
        route.splice(i, 1)
        const insertAt = bestJ > i ? bestJ - 1 : bestJ
        route.splice(insertAt, 0, stop)
        orImproved = true
      }
    }
  }

  return route
}
