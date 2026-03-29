// Route optimizer using precise geocoded addresses from Supabase cache
// Falls back to ZIP centroids only when address isn't in cache

import ZIP_COORDS from '../src/lib/zipCoords.js'
import { supabase } from './_lib/supabase.js'

function toRad(deg) { return deg * Math.PI / 180 }

function haversine(lat1, lon1, lat2, lon2) {
  const R = 3959 // miles
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Pharmacy start locations
const PHARMACY_ORIGINS = {
  SHSP: [41.0758, -81.5193],
  Aultman: [40.7914, -81.3939],
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  try {
    const { stops, mode = 'oneway', pharmacy } = req.body
    if (!stops || !Array.isArray(stops) || stops.length === 0) {
      return res.status(400).json({ error: 'stops array required' })
    }

    // Build cache keys for all stops
    const cacheKeys = stops.map(s => {
      const addr = (s.address || '').toLowerCase().trim()
      const city = (s.city || '').toLowerCase().trim()
      const zip = (s.zip || '').trim()
      return `${addr}|${city}|${zip}`
    })

    // Fetch precise coordinates from Supabase geocode cache
    const { data: cached } = await supabase
      .from('geocode_cache')
      .select('cache_key, lat, lng')
      .in('cache_key', cacheKeys)

    const cacheMap = new Map()
    for (const row of (cached || [])) {
      cacheMap.set(row.cache_key, [row.lat, row.lng])
    }

    // Build coordinates: geocode cache → ZIP centroid fallback
    const coords = stops.map((s, i) => {
      const cached = cacheMap.get(cacheKeys[i])
      if (cached) return { index: i, lat: cached[0], lng: cached[1], coldChain: !!s.coldChain, source: 'address' }

      // ZIP fallback
      const zip = String(s.zip || '').trim()
      const zipCoord = ZIP_COORDS[zip] || ZIP_COORDS[zip.padStart(5, '0')]
      if (zipCoord) return { index: i, lat: zipCoord[0], lng: zipCoord[1], coldChain: !!s.coldChain, source: 'zip' }

      return { index: i, lat: null, lng: null, coldChain: !!s.coldChain, source: 'none' }
    })

    const withCoords = coords.filter(c => c.lat !== null)
    const withoutCoords = coords.filter(c => c.lat === null)

    if (withCoords.length === 0) {
      return res.json({ optimizedOrder: stops.map((_, i) => i), totalDistance: 0 })
    }

    // Start from pharmacy
    const origin = PHARMACY_ORIGINS[pharmacy] || PHARMACY_ORIGINS.SHSP
    let startLat = origin[0]
    let startLng = origin[1]

    // Split into cold chain (priority) and regular stops
    const coldStops = withCoords.filter(c => c.coldChain)
    const regularStops = withCoords.filter(c => !c.coldChain)

    // Nearest-neighbor within each group: cold chain first, then regular
    const order = []
    let totalDistance = 0
    let curLat = startLat
    let curLng = startLng

    // Phase 1: Cold chain stops first
    const coldOrder = nearestNeighbor(coldStops, curLat, curLng)
    for (const { index, lat, lng, dist } of coldOrder) {
      order.push(index)
      totalDistance += dist
      curLat = lat
      curLng = lng
    }

    // Phase 2: Regular stops
    const regOrder = nearestNeighbor(regularStops, curLat, curLng)
    for (const { index, lat, lng, dist } of regOrder) {
      order.push(index)
      totalDistance += dist
      curLat = lat
      curLng = lng
    }

    if (mode === 'roundtrip') {
      totalDistance += haversine(curLat, curLng, startLat, startLng)
    }

    const optimizedOrder = [...order, ...withoutCoords.map(c => c.index)]

    const addressHits = withCoords.filter(c => c.source === 'address').length
    const zipFallbacks = withCoords.filter(c => c.source === 'zip').length

    return res.json({
      optimizedOrder,
      totalDistance: Math.round(totalDistance * 10) / 10,
      mode,
      coldChainFirst: coldStops.length,
      geocodeStats: { addressHits, zipFallbacks, noCoords: withoutCoords.length },
    })
  } catch (err) {
    console.error('optimize-route error:', err)
    return res.status(500).json({ error: err.message })
  }
}

function nearestNeighbor(stops, startLat, startLng) {
  const visited = new Set()
  const result = []
  let curLat = startLat
  let curLng = startLng

  while (result.length < stops.length) {
    let bestDist = Infinity
    let bestStop = null

    for (const s of stops) {
      if (visited.has(s.index)) continue
      const d = haversine(curLat, curLng, s.lat, s.lng)
      if (d < bestDist) {
        bestDist = d
        bestStop = s
      }
    }

    if (!bestStop) break
    visited.add(bestStop.index)
    result.push({ index: bestStop.index, lat: bestStop.lat, lng: bestStop.lng, dist: bestDist })
    curLat = bestStop.lat
    curLng = bestStop.lng
  }

  return result
}
