// Route optimization engine v2
// Uses OSRM Table API for real driving distance matrix + simulated annealing TSP solver
// This matches Road Warrior / Circuit quality by using actual road network distances

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

    const { stops: optimizedAll, method, matrixUsed } = await optimizeWithMatrix(
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
      if (s.coldChain) reason += ' · ❄️ Cold chain'
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
      summary: `${optimizedAll.length} stops via ${method}${matrixUsed ? ' (real driving times)' : ''}${hasEnd ? ' → end address' : ''}`,
    })
  } catch (err) {
    console.error('optimize-route error:', err)
    return res.status(500).json({ error: err.message })
  }
}

// ═══ MAIN OPTIMIZER ═══
// Step 1: Get real driving time matrix from OSRM Table API
// Step 2: Solve TSP using simulated annealing on that matrix
// Step 3: Refine with 2-opt and or-opt using real times

async function optimizeWithMatrix(stops, startLat, startLng, endLat, endLng) {
  // Build all points: [origin, ...stops, optional end]
  const allPoints = [{ lat: startLat, lng: startLng }, ...stops]
  const hasEnd = endLat != null
  if (hasEnd) allPoints.push({ lat: endLat, lng: endLng })

  // Try to get real driving time matrix
  let matrix = null
  let matrixUsed = false

  try {
    matrix = await getOSRMMatrix(allPoints)
    if (matrix) matrixUsed = true
  } catch (err) {
    console.warn('OSRM Table failed:', err.message)
  }

  // Fallback to haversine matrix if OSRM fails
  if (!matrix) {
    matrix = buildHaversineMatrix(allPoints)
  }

  // Solve TSP with simulated annealing
  const n = stops.length
  const startIdx = 0 // origin is index 0 in matrix
  const endIdx = hasEnd ? allPoints.length - 1 : null

  // Generate initial solution with nearest-neighbor on the matrix
  let route = matrixNearestNeighbor(matrix, n, startIdx, endIdx)

  // Improve with simulated annealing
  route = simulatedAnnealing(matrix, route, startIdx, endIdx, n)

  // Final refinement passes
  route = matrixTwoOpt(matrix, route, startIdx, endIdx)
  route = matrixOrOpt(matrix, route, startIdx, endIdx)

  // Map back to stop objects
  const optimized = route.map(i => stops[i - 1]) // -1 because matrix index 0 is origin

  return { stops: optimized, method: 'matrix-sa', matrixUsed }
}

// ═══ OSRM TABLE API ═══
// Returns NxN matrix of driving durations (seconds) between all points

async function getOSRMMatrix(points) {
  if (points.length > 100) return null // OSRM limit

  const coordStr = points.map(p => `${p.lng},${p.lat}`).join(';')
  const url = `https://router.project-osrm.org/table/v1/driving/${coordStr}?annotations=duration`

  const resp = await fetch(url, { signal: AbortSignal.timeout(20000) })
  const data = await resp.json()

  if (data.code !== 'Ok' || !data.durations) return null

  // Validate matrix - check for null values
  const durations = data.durations
  for (let i = 0; i < durations.length; i++) {
    for (let j = 0; j < durations[i].length; j++) {
      if (durations[i][j] === null) durations[i][j] = Infinity
    }
  }

  return durations
}

function buildHaversineMatrix(points) {
  const n = points.length
  const matrix = Array.from({ length: n }, () => new Array(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      // Convert miles to approximate seconds (assume 30mph avg)
      matrix[i][j] = haversine(points[i].lat, points[i].lng, points[j].lat, points[j].lng) / 30 * 3600
    }
  }
  return matrix
}

// ═══ NEAREST NEIGHBOR (matrix-based) ═══

function matrixNearestNeighbor(matrix, numStops, startIdx, endIdx) {
  const visited = new Set()
  const route = []
  let current = startIdx

  for (let step = 0; step < numStops; step++) {
    let bestCost = Infinity, bestNext = -1

    for (let j = 1; j <= numStops; j++) { // indices 1..numStops are stops
      if (visited.has(j)) continue
      if (endIdx != null && j === endIdx) continue // don't visit end as a stop

      let cost = matrix[current][j]

      // If near the end of the route, factor in distance to endpoint
      if (endIdx != null) {
        const remaining = numStops - step
        if (remaining <= 3) cost = cost * 0.5 + matrix[j][endIdx] * 0.5
        else if (remaining <= 6) cost = cost * 0.8 + matrix[j][endIdx] * 0.2
      }

      if (cost < bestCost) { bestCost = cost; bestNext = j }
    }

    if (bestNext < 0) break
    visited.add(bestNext)
    route.push(bestNext)
    current = bestNext
  }

  return route
}

// ═══ SIMULATED ANNEALING ═══

function routeCost(matrix, route, startIdx, endIdx) {
  if (route.length === 0) return Infinity
  let cost = matrix[startIdx][route[0]]
  for (let i = 1; i < route.length; i++) cost += matrix[route[i - 1]][route[i]]
  if (endIdx != null) cost += matrix[route[route.length - 1]][endIdx]
  return cost
}

function simulatedAnnealing(matrix, initialRoute, startIdx, endIdx, numStops) {
  const route = [...initialRoute]
  let bestRoute = [...route]
  let currentCost = routeCost(matrix, route, startIdx, endIdx)
  let bestCost = currentCost

  const n = route.length
  if (n < 3) return route

  // SA parameters — tuned for delivery routes
  let temp = currentCost * 0.3
  const coolingRate = 0.9995
  const minTemp = 0.01
  const maxIterations = Math.min(n * n * 500, 200000)

  for (let iter = 0; iter < maxIterations && temp > minTemp; iter++) {
    // Pick a random move: 2-opt swap, or-opt move, or swap two stops
    const moveType = Math.random()
    const newRoute = [...route]

    if (moveType < 0.5) {
      // 2-opt: reverse a segment
      const i = Math.floor(Math.random() * n)
      const j = Math.floor(Math.random() * n)
      const lo = Math.min(i, j), hi = Math.max(i, j)
      if (lo === hi) continue
      newRoute.splice(lo, hi - lo + 1, ...newRoute.slice(lo, hi + 1).reverse())
    } else if (moveType < 0.8) {
      // Or-opt: move one stop to a new position
      const i = Math.floor(Math.random() * n)
      const stop = newRoute.splice(i, 1)[0]
      const j = Math.floor(Math.random() * newRoute.length)
      newRoute.splice(j, 0, stop)
    } else {
      // Swap: exchange two stops
      const i = Math.floor(Math.random() * n)
      let j = Math.floor(Math.random() * n)
      if (i === j) continue
      ;[newRoute[i], newRoute[j]] = [newRoute[j], newRoute[i]]
    }

    const newCost = routeCost(matrix, newRoute, startIdx, endIdx)
    const delta = newCost - currentCost

    // Accept if better, or with probability based on temperature
    if (delta < 0 || Math.random() < Math.exp(-delta / temp)) {
      route.splice(0, route.length, ...newRoute)
      currentCost = newCost

      if (currentCost < bestCost) {
        bestCost = currentCost
        bestRoute = [...route]
      }
    }

    temp *= coolingRate
  }

  return bestRoute
}

// ═══ 2-OPT (matrix-based) ═══

function matrixTwoOpt(matrix, route, startIdx, endIdx) {
  if (route.length < 4) return route
  const r = [...route]
  let improved = true, iterations = 0

  while (improved && iterations < 2000) {
    improved = false; iterations++
    for (let i = 0; i < r.length - 1; i++) {
      for (let j = i + 2; j < r.length; j++) {
        const prevI = i === 0 ? startIdx : r[i - 1]
        const nextJ = j === r.length - 1 ? (endIdx ?? null) : r[j + 1]

        const curr = matrix[prevI][r[i]] + (nextJ != null ? matrix[r[j]][nextJ] : 0)
        const swap = matrix[prevI][r[j]] + (nextJ != null ? matrix[r[i]][nextJ] : 0)

        if (swap < curr - 0.1) {
          r.splice(i, j - i + 1, ...r.slice(i, j + 1).reverse())
          improved = true
        }
      }
    }
  }
  return r
}

// ═══ OR-OPT (matrix-based) ═══

function matrixOrOpt(matrix, route, startIdx, endIdx) {
  const r = [...route]
  let improved = true, iterations = 0

  while (improved && iterations < 1000) {
    improved = false; iterations++
    for (let i = 0; i < r.length; i++) {
      const stop = r[i]
      const before = i === 0 ? startIdx : r[i - 1]
      const after = i === r.length - 1 ? (endIdx ?? null) : r[i + 1]

      const removeSaving = matrix[before][stop] +
        (after != null ? matrix[stop][after] : 0) -
        (after != null ? matrix[before][after] : 0)

      let bestJ = -1, bestSaving = 0
      for (let j = 0; j < r.length; j++) {
        if (j === i || j === i + 1) continue
        const pJ = j === 0 ? startIdx : r[j - 1]
        const nJ = r[j]
        const insertCost = matrix[pJ][stop] + matrix[stop][nJ] - matrix[pJ][nJ]
        const saving = removeSaving - insertCost
        if (saving > bestSaving + 0.1) { bestSaving = saving; bestJ = j }
      }
      if (bestJ >= 0) {
        r.splice(i, 1)
        const insertAt = bestJ > i ? bestJ - 1 : bestJ
        r.splice(insertAt, 0, stop)
        improved = true
      }
    }
  }
  return r
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
