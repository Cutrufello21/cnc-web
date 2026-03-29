// POST /api/directions
// Body: { waypoints: [{lat, lng}, ...] }
// Uses Google Directions API (with traffic) if GOOGLE_MAPS_API_KEY is set, else OSRM

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  let body
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' })
  }

  const { waypoints } = body
  if (!waypoints || waypoints.length < 2) {
    return res.status(400).json({ error: 'Need at least 2 waypoints' })
  }

  const googleKey = process.env.GOOGLE_MAPS_API_KEY

  // Try Google Directions first (traffic-aware)
  if (googleKey) {
    try {
      const result = await fetchGoogleDirections(waypoints, googleKey)
      if (result) return res.status(200).json(result)
    } catch (err) {
      console.warn('Google Directions failed, falling back to OSRM:', err.message)
    }
  }

  // Fallback: OSRM
  try {
    const result = await fetchOSRM(waypoints)
    return res.status(200).json(result)
  } catch (err) {
    return res.status(500).json({ error: 'Routing failed: ' + err.message })
  }
}

async function fetchGoogleDirections(waypoints, apiKey) {
  const origin = `${waypoints[0].lat},${waypoints[0].lng}`
  const destination = `${waypoints[waypoints.length - 1].lat},${waypoints[waypoints.length - 1].lng}`
  const intermediates = waypoints.slice(1, -1)

  // Google limits to 25 waypoints (origin + dest + 23 intermediate)
  const waypointStr = intermediates.length > 0
    ? `&waypoints=${intermediates.map(w => `${w.lat},${w.lng}`).join('|')}`
    : ''

  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}${waypointStr}&departure_time=now&traffic_model=best_guess&key=${apiKey}`

  const resp = await fetch(url)
  const data = await resp.json()

  if (data.status !== 'OK' || !data.routes?.length) return null

  const route = data.routes[0]
  const legs = route.legs.map(leg => ({
    distance: parseFloat((leg.distance.value / 1609.344).toFixed(1)),
    // Use duration_in_traffic if available (traffic-aware)
    duration: Math.round((leg.duration_in_traffic?.value || leg.duration.value) / 60),
  }))

  // Decode Google's encoded polyline
  const geometry = decodePolyline(route.overview_polyline.points)

  const totalDistance = legs.reduce((s, l) => s + l.distance, 0).toFixed(1)
  const totalDuration = legs.reduce((s, l) => s + l.duration, 0)

  return {
    source: 'google',
    distance: parseFloat(totalDistance),
    duration: totalDuration,
    geometry,
    legs,
  }
}

async function fetchOSRM(waypoints) {
  const coordStr = waypoints.map(p => `${p.lng},${p.lat}`).join(';')
  const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson&steps=false`

  const resp = await fetch(url, { signal: AbortSignal.timeout(10000) })
  const data = await resp.json()

  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error('OSRM returned no routes')
  }

  const route = data.routes[0]
  const geometry = route.geometry.coordinates.map(c => [c[1], c[0]])
  const legs = (route.legs || []).map(leg => ({
    distance: parseFloat((leg.distance / 1609.344).toFixed(1)),
    duration: Math.round(leg.duration / 60),
  }))

  return {
    source: 'osrm',
    distance: parseFloat((route.distance / 1609.344).toFixed(1)),
    duration: Math.round(route.duration / 60),
    geometry,
    legs,
  }
}

// Decode Google's encoded polyline format
function decodePolyline(encoded) {
  const points = []
  let index = 0, lat = 0, lng = 0

  while (index < encoded.length) {
    let shift = 0, result = 0, b
    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    lat += (result & 1) ? ~(result >> 1) : (result >> 1)

    shift = 0; result = 0
    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    lng += (result & 1) ? ~(result >> 1) : (result >> 1)

    points.push([lat / 1e5, lng / 1e5])
  }
  return points
}
