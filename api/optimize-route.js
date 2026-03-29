// ZIP-code centroid nearest-neighbor route optimizer
// No external API calls — uses static ZIP→lat/lng lookup + Haversine distance

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
  // Try with leading zeros
  const padded = zip.padStart(5, '0')
  if (ZIP_COORDS[padded]) return ZIP_COORDS[padded]
  return null
}

// CNC HQ approximate location (used as default start for round trip)
const CNC_HQ = [41.3995, -81.6954]

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
      return { index: i, lat: c ? c[0] : null, lng: c ? c[1] : null }
    })

    // Filter out stops without coordinates (keep them at the end)
    const withCoords = coords.filter(c => c.lat !== null)
    const withoutCoords = coords.filter(c => c.lat === null)

    if (withCoords.length === 0) {
      // Can't optimize — return original order
      return res.json({ optimizedOrder: stops.map((_, i) => i), totalDistance: 0 })
    }

    // Determine start point
    let startLat, startLng
    if (startAddress) {
      const startCoord = getCoords(startAddress)
      if (startCoord) { startLat = startCoord[0]; startLng = startCoord[1] }
    }
    if (!startLat) {
      // Default: start from the first stop
      startLat = withCoords[0].lat
      startLng = withCoords[0].lng
    }

    // Nearest-neighbor TSP
    const visited = new Set()
    const order = []
    let totalDistance = 0
    let curLat = startLat
    let curLng = startLng

    // If using startAddress as origin, don't pre-visit any stop
    // Otherwise first stop is the starting point
    if (!startAddress) {
      visited.add(withCoords[0].index)
      order.push(withCoords[0].index)
    }

    while (order.length < withCoords.length) {
      let bestDist = Infinity
      let bestIdx = -1

      for (const c of withCoords) {
        if (visited.has(c.index)) continue
        const d = haversine(curLat, curLng, c.lat, c.lng)
        if (d < bestDist) {
          bestDist = d
          bestIdx = c.index
        }
      }

      if (bestIdx === -1) break
      visited.add(bestIdx)
      order.push(bestIdx)
      totalDistance += bestDist
      const picked = withCoords.find(c => c.index === bestIdx)
      curLat = picked.lat
      curLng = picked.lng
    }

    // Round trip: add return distance to start
    if (mode === 'roundtrip') {
      const returnDist = haversine(curLat, curLng, startLat, startLng)
      totalDistance += returnDist
    }

    // Append any stops without coordinates at the end (original order)
    const optimizedOrder = [...order, ...withoutCoords.map(c => c.index)]

    return res.json({
      optimizedOrder,
      totalDistance: Math.round(totalDistance * 10) / 10,
      mode,
    })
  } catch (err) {
    console.error('optimize-route error:', err)
    return res.status(500).json({ error: err.message })
  }
}
