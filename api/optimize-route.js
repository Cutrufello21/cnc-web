// ZIP-code centroid nearest-neighbor route optimizer
// Cold chain stops are prioritized (delivered first) as time-sensitive

import ZIP_COORDS from '../src/lib/zipCoords.js'

function toRad(deg) { return deg * Math.PI / 180 }

function haversine(lat1, lon1, lat2, lon2) {
  const R = 3959 // miles
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function getCoords(stop) {
  const zip = String(stop.zip || '').trim()
  if (ZIP_COORDS[zip]) return ZIP_COORDS[zip]
  const padded = zip.padStart(5, '0')
  if (ZIP_COORDS[padded]) return ZIP_COORDS[padded]
  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  try {
    const { stops, mode = 'oneway', startAddress } = req.body
    if (!stops || !Array.isArray(stops) || stops.length === 0) {
      return res.status(400).json({ error: 'stops array required' })
    }

    // Geocode all stops via ZIP centroids
    const coords = stops.map((s, i) => {
      const c = getCoords(s)
      return {
        index: i,
        lat: c ? c[0] : null,
        lng: c ? c[1] : null,
        coldChain: !!s.coldChain,
      }
    })

    const withCoords = coords.filter(c => c.lat !== null)
    const withoutCoords = coords.filter(c => c.lat === null)

    if (withCoords.length === 0) {
      return res.json({ optimizedOrder: stops.map((_, i) => i), totalDistance: 0 })
    }

    // Determine start point
    let startLat, startLng
    if (startAddress) {
      const startCoord = getCoords(startAddress)
      if (startCoord) { startLat = startCoord[0]; startLng = startCoord[1] }
    }
    if (!startLat) {
      startLat = withCoords[0].lat
      startLng = withCoords[0].lng
    }

    // Split into cold chain (priority) and regular stops
    const coldStops = withCoords.filter(c => c.coldChain)
    const regularStops = withCoords.filter(c => !c.coldChain)

    // Nearest-neighbor within each group: cold chain first, then regular
    const order = []
    let totalDistance = 0
    let curLat = startLat
    let curLng = startLng

    // Phase 1: Route through all cold chain stops first (time-sensitive)
    const coldOrder = nearestNeighbor(coldStops, curLat, curLng)
    for (const { index, lat, lng, dist } of coldOrder) {
      order.push(index)
      totalDistance += dist
      curLat = lat
      curLng = lng
    }

    // Phase 2: Route through remaining regular stops
    const regOrder = nearestNeighbor(regularStops, curLat, curLng)
    for (const { index, lat, lng, dist } of regOrder) {
      order.push(index)
      totalDistance += dist
      curLat = lat
      curLng = lng
    }

    // Round trip: add return distance
    if (mode === 'roundtrip') {
      totalDistance += haversine(curLat, curLng, startLat, startLng)
    }

    // Append stops without coordinates at the end
    const optimizedOrder = [...order, ...withoutCoords.map(c => c.index)]

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
