// Route optimizer: nearest-neighbor + 2-opt improvement
// Uses precise geocoded addresses, factors in end destination

import ZIP_COORDS from '../src/lib/zipCoords.js'
import { supabase } from './_lib/supabase.js'

function toRad(deg) { return deg * Math.PI / 180 }

function haversine(lat1, lon1, lat2, lon2) {
  const R = 3959
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
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
    const { stops, mode = 'oneway', pharmacy, endLat, endLng } = req.body
    if (!stops || !Array.isArray(stops) || stops.length === 0) {
      return res.status(400).json({ error: 'stops array required' })
    }

    // Build cache keys
    const cacheKeys = stops.map(s => {
      return `${(s.address || '').toLowerCase().trim()}|${(s.city || '').toLowerCase().trim()}|${(s.zip || '').trim()}`
    })

    // Fetch precise coordinates from Supabase
    const { data: cached } = await supabase
      .from('geocode_cache')
      .select('cache_key, lat, lng')
      .in('cache_key', cacheKeys)

    const cacheMap = new Map()
    for (const row of (cached || [])) {
      cacheMap.set(row.cache_key, [row.lat, row.lng])
    }

    // Build coordinates
    const coords = stops.map((s, i) => {
      const c = cacheMap.get(cacheKeys[i])
      if (c) return { index: i, lat: c[0], lng: c[1], coldChain: !!s.coldChain }
      const zip = String(s.zip || '').trim()
      const zc = ZIP_COORDS[zip] || ZIP_COORDS[zip.padStart(5, '0')]
      if (zc) return { index: i, lat: zc[0], lng: zc[1], coldChain: !!s.coldChain }
      return { index: i, lat: null, lng: null, coldChain: !!s.coldChain }
    })

    const withCoords = coords.filter(c => c.lat !== null)
    const withoutCoords = coords.filter(c => c.lat === null)

    if (withCoords.length === 0) {
      return res.json({ optimizedOrder: stops.map((_, i) => i), totalDistance: 0 })
    }

    const origin = PHARMACY_ORIGINS[pharmacy] || PHARMACY_ORIGINS.SHSP
    const startLat = origin[0], startLng = origin[1]

    // End point (driver's destination)
    const hasEnd = endLat != null && endLng != null

    // Split cold chain vs regular
    const coldStops = withCoords.filter(c => c.coldChain)
    const regularStops = withCoords.filter(c => !c.coldChain)

    let order = []
    let curLat = startLat, curLng = startLng

    // Phase 1: Cold chain stops (nearest-neighbor)
    const coldOrder = nearestNeighbor(coldStops, curLat, curLng)
    for (const s of coldOrder) {
      order.push(s)
      curLat = s.lat; curLng = s.lng
    }

    // Phase 2: Regular stops (nearest-neighbor, biased toward end point)
    if (hasEnd && regularStops.length > 3) {
      // Modified nearest-neighbor: as we get closer to the last few stops,
      // factor in proximity to end point to avoid backtracking
      const regOrder = nearestNeighborWithEnd(regularStops, curLat, curLng, endLat, endLng)
      order.push(...regOrder)
    } else {
      const regOrder = nearestNeighbor(regularStops, curLat, curLng)
      order.push(...regOrder)
    }

    // Phase 3: 2-opt improvement to eliminate crossings
    order = twoOpt(order, startLat, startLng, hasEnd ? endLat : null, hasEnd ? endLng : null)

    // Calculate total distance
    let totalDistance = 0
    curLat = startLat; curLng = startLng
    for (const s of order) {
      totalDistance += haversine(curLat, curLng, s.lat, s.lng)
      curLat = s.lat; curLng = s.lng
    }
    if (hasEnd) {
      totalDistance += haversine(curLat, curLng, endLat, endLng)
    }

    const optimizedOrder = [...order.map(s => s.index), ...withoutCoords.map(c => c.index)]

    return res.json({
      optimizedOrder,
      totalDistance: Math.round(totalDistance * 10) / 10,
      mode,
      coldChainFirst: coldStops.length,
    })
  } catch (err) {
    console.error('optimize-route error:', err)
    return res.status(500).json({ error: err.message })
  }
}

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

// Nearest-neighbor that factors in the end destination
// Blends "closest to current" with "closest to end" as we approach the last stops
function nearestNeighborWithEnd(stops, startLat, startLng, endLat, endLng) {
  const visited = new Set()
  const result = []
  let curLat = startLat, curLng = startLng
  const total = stops.length

  while (result.length < total) {
    const remaining = total - result.length
    // How much to weight proximity to end (0 at start, 0.5 near the end)
    const endWeight = remaining <= 3 ? 0.5 : remaining <= 6 ? 0.2 : 0

    let bestScore = Infinity, bestStop = null
    for (const s of stops) {
      if (visited.has(s.index)) continue
      const distFromCurrent = haversine(curLat, curLng, s.lat, s.lng)
      const distToEnd = haversine(s.lat, s.lng, endLat, endLng)
      const score = distFromCurrent * (1 - endWeight) + distToEnd * endWeight
      if (score < bestScore) { bestScore = score; bestStop = s }
    }
    if (!bestStop) break
    visited.add(bestStop.index)
    result.push(bestStop)
    curLat = bestStop.lat; curLng = bestStop.lng
  }
  return result
}

// 2-opt: repeatedly reverse segments to eliminate crossings
function twoOpt(order, startLat, startLng, endLat, endLng) {
  if (order.length < 4) return order

  const route = [...order]
  let improved = true
  let iterations = 0
  const maxIterations = 500

  while (improved && iterations < maxIterations) {
    improved = false
    iterations++

    for (let i = 0; i < route.length - 1; i++) {
      for (let j = i + 2; j < route.length; j++) {
        // Calculate current distance for this segment
        const prevI = i === 0 ? { lat: startLat, lng: startLng } : route[i - 1]
        const nextJ = j === route.length - 1
          ? (endLat != null ? { lat: endLat, lng: endLng } : null)
          : route[j + 1]

        const currentDist =
          haversine(prevI.lat, prevI.lng, route[i].lat, route[i].lng) +
          (nextJ ? haversine(route[j].lat, route[j].lng, nextJ.lat, nextJ.lng) : 0)

        // Calculate distance if we reverse the segment [i..j]
        const newDist =
          haversine(prevI.lat, prevI.lng, route[j].lat, route[j].lng) +
          (nextJ ? haversine(route[i].lat, route[i].lng, nextJ.lat, nextJ.lng) : 0)

        if (newDist < currentDist - 0.01) {
          // Reverse segment [i..j]
          const reversed = route.slice(i, j + 1).reverse()
          route.splice(i, j - i + 1, ...reversed)
          improved = true
        }
      }
    }
  }

  return route
}
