// Route optimization engine v3 — Google Routes API
// Uses Google's production-grade route optimizer for perfect stop ordering
// Handles up to 98 waypoints per request with real traffic data

import ZIP_COORDS from '../src/lib/zipCoords.js'
import { supabase } from './_lib/supabase.js'
import { requireAuth } from './_lib/auth.js'

const GOOGLE_API_KEY = process.env.GOOGLE_ROUTES_API_KEY

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

  const user = await requireAuth(req, res, { allowApiSecret: true })
  if (!user) return

  try {
    const { stops, pharmacy, startLat, startLng, endLat, endLng, driverName, deliveryDay } = req.body
    if (!stops?.length) return res.status(400).json({ error: 'stops array required' })

    const coords = await geocodeStops(stops)
    const withCoords = coords.filter(c => c.lat !== null)
    const withoutCoords = coords.filter(c => c.lat === null)

    if (withCoords.length === 0) {
      return res.json({ optimizedOrder: stops.map((_, i) => i), totalDistance: 0 })
    }

    // Fetch driver's historical ZIP ordering pattern
    let learnedPattern = null
    if (driverName) {
      try {
        const { data: patternStops } = await supabase
          .from('daily_stops')
          .select('zip, delivery_date, id, delivered_at')
          .eq('driver_name', driverName)
          .eq('status', 'delivered')
          .gte('delivery_date', new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0])
          .order('delivery_date', { ascending: false })
          .order('id', { ascending: true })
          .limit(2000)

        if (patternStops?.length > 20) {
          learnedPattern = buildZipOrder(patternStops)
        }
      } catch (e) { console.warn('Pattern fetch failed:', e.message) }
    }

    const phOrigin = PHARMACY_ORIGINS[pharmacy] || PHARMACY_ORIGINS.SHSP
    const origin = (startLat != null && startLng != null) ? [startLat, startLng] : phOrigin
    const hasEnd = endLat != null && endLng != null
    const endPoint = hasEnd ? [endLat, endLng] : origin // default round-trip back to origin

    // Pre-sort stops by learned ZIP pattern before sending to Google
    // This gives Google a better starting arrangement to optimize from
    let stopsToOptimize = withCoords
    if (learnedPattern?.length > 0) {
      const zipRank = {}
      learnedPattern.forEach((zip, i) => { zipRank[zip] = i })
      stopsToOptimize = [...withCoords].sort((a, b) => {
        const ra = zipRank[a.zip] ?? 999
        const rb = zipRank[b.zip] ?? 999
        if (ra !== rb) return ra - rb
        // Within same ZIP, sort by proximity to previous stop
        return 0
      })
    }

    // Use Google Routes API for optimization
    let optimizedAll, method

    try {
      optimizedAll = await googleOptimize(stopsToOptimize, origin, endPoint)
      method = 'google-routes'
      if (learnedPattern) method += '+learned'
    } catch (err) {
      console.warn('Google Routes failed:', err.message, '— falling back to OSRM')
      try {
        optimizedAll = await osrmFallback(stopsToOptimize, origin[0], origin[1], hasEnd ? endLat : null, hasEnd ? endLng : null)
        method = 'osrm-fallback'
      } catch {
        // Last resort: nearest neighbor by haversine
        optimizedAll = nearestNeighbor(stopsToOptimize, origin[0], origin[1], hasEnd ? endLat : null, hasEnd ? endLng : null)
        method = 'nearest-neighbor'
      }
    }

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
      if (s.coldChain) reason += ' · Cold chain'
      reasons.push(reason)
      curLat = s.lat; curLng = s.lng
    }
    for (const c of withoutCoords) reasons.push('No geocode — placed at end')
    if (hasEnd) totalDistance += haversine(curLat, curLng, endLat, endLng)

    return res.json({
      optimizedOrder,
      totalDistance: Math.round(totalDistance * 10) / 10,
      reasons,
      method,
      summary: `${optimizedAll.length} stops optimized via ${method}`,
    })
  } catch (err) {
    console.error('optimize-route error:', err)
    return res.status(500).json({ error: err.message })
  }
}

// ═══ GOOGLE ROUTES API OPTIMIZER ═══
// Google handles up to 98 intermediates per request
// For larger routes, we chunk into batches

async function googleOptimize(stops, origin, endPoint) {
  // Google Routes supports up to 98 intermediate waypoints
  if (stops.length <= 98) {
    return googleOptimizeBatch(stops, origin, endPoint)
  }

  // For routes > 98 stops, split geographically and chain
  const chunks = []
  for (let i = 0; i < stops.length; i += 98) {
    chunks.push(stops.slice(i, i + 98))
  }

  let allOptimized = []
  let currentOrigin = origin

  for (const chunk of chunks) {
    const isLast = chunk === chunks[chunks.length - 1]
    const chunkEnd = isLast ? endPoint : null

    const optimized = await googleOptimizeBatch(chunk, currentOrigin, chunkEnd)
    allOptimized.push(...optimized)

    // Next chunk starts from where this one ended
    if (optimized.length > 0) {
      const last = optimized[optimized.length - 1]
      currentOrigin = [last.lat, last.lng]
    }
  }

  return allOptimized
}

async function googleOptimizeBatch(stops, origin, endPoint) {
  const body = {
    origin: {
      location: { latLng: { latitude: origin[0], longitude: origin[1] } }
    },
    destination: {
      location: { latLng: { latitude: endPoint[0], longitude: endPoint[1] } }
    },
    intermediates: stops.map(s => {
      // Use precise coordinates when available (cache/app), address string only as fallback
      if (s.lat && s.lng && s.geocodeMethod !== 'zip-center') {
        return { location: { latLng: { latitude: s.lat, longitude: s.lng } } }
      }
      if (s.address && s.city) {
        return { address: `${s.address}, ${s.city}, OH ${s.zip || ''}`.trim() }
      }
      return { location: { latLng: { latitude: s.lat, longitude: s.lng } } }
    }),
    optimizeWaypointOrder: true,
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
  }

  const resp = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_API_KEY,
      'X-Goog-FieldMask': 'routes.optimizedIntermediateWaypointIndex,routes.distanceMeters,routes.duration',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  })

  const data = await resp.json()

  if (data.error) {
    throw new Error(`Google Routes: ${data.error.message || JSON.stringify(data.error)}`)
  }

  if (!data.routes?.[0]?.optimizedIntermediateWaypointIndex) {
    throw new Error('Google Routes returned no optimized order')
  }

  const order = data.routes[0].optimizedIntermediateWaypointIndex
  return order.map(i => stops[i])
}

// ═══ OSRM FALLBACK ═══

async function osrmFallback(stops, startLat, startLng, endLat, endLng) {
  const allPoints = [{ lat: startLat, lng: startLng }, ...stops]
  if (endLat != null) allPoints.push({ lat: endLat, lng: endLng })

  const coordStr = allPoints.map(p => `${p.lng},${p.lat}`).join(';')
  const params = endLat != null
    ? 'source=first&destination=last&roundtrip=false'
    : 'source=first&roundtrip=false'

  const url = `https://router.project-osrm.org/trip/v1/driving/${coordStr}?${params}&geometries=geojson&overview=false`
  const resp = await fetch(url, { signal: AbortSignal.timeout(15000) })
  const data = await resp.json()

  if (data.code !== 'Ok' || !data.trips?.length) throw new Error('OSRM failed')

  const waypoints = data.waypoints || []
  const stopWaypoints = waypoints
    .map((wp, inputIdx) => ({ inputIdx, tripPos: wp.waypoint_index }))
    .slice(1, endLat != null ? -1 : undefined)
    .sort((a, b) => a.tripPos - b.tripPos)

  return stopWaypoints.map(wp => stops[wp.inputIdx - 1]).filter(Boolean)
}

// ═══ NEAREST NEIGHBOR FALLBACK ═══

function nearestNeighbor(stops, startLat, startLng, endLat, endLng) {
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
    const base = { index: i, address: s.address || '', city: s.city || '', zip: s.zip || '', coldChain: !!s.coldChain, sigRequired: !!s.sigRequired }

    // Use pre-supplied coordinates from the app first
    if (s.lat && s.lng) return { ...base, lat: s.lat, lng: s.lng, geocodeMethod: 'app' }

    const c = cacheMap.get(cacheKeys[i])
    if (c) return { ...base, lat: c[0], lng: c[1], geocodeMethod: 'precise' }

    const zip = String(s.zip || '').trim()
    const zc = ZIP_COORDS[zip] || ZIP_COORDS[zip.padStart(5, '0')]
    if (zc) {
      const jitter = () => (Math.random() - 0.5) * 0.002
      return { ...base, lat: zc[0] + jitter(), lng: zc[1] + jitter(), geocodeMethod: 'zip-center' }
    }
    return { ...base, lat: null, lng: null, _needsGeocode: true, _stop: s }
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

// ═══ LEARNED PATTERN ENGINE ═══
// Builds a preferred ZIP ordering from historical delivery data

function buildZipOrder(stops) {
  const days = {}
  stops.forEach(s => {
    if (!days[s.delivery_date]) days[s.delivery_date] = []
    days[s.delivery_date].push(s)
  })

  // Sort each day by delivered_at or id
  Object.values(days).forEach(dayStops => {
    dayStops.sort((a, b) => {
      if (a.delivered_at && b.delivered_at) return a.delivered_at.localeCompare(b.delivered_at)
      return a.id - b.id
    })
  })

  const transitions = {}
  const zipFirst = {}
  const zipFreq = {}

  Object.values(days).forEach(dayStops => {
    if (dayStops.length < 2) return
    const zipSeq = []
    let prev = null
    for (const s of dayStops) {
      zipFreq[s.zip] = (zipFreq[s.zip] || 0) + 1
      if (s.zip !== prev) { zipSeq.push(s.zip); prev = s.zip }
    }
    if (zipSeq.length === 0) return
    zipFirst[zipSeq[0]] = (zipFirst[zipSeq[0]] || 0) + 1
    for (let i = 0; i < zipSeq.length - 1; i++) {
      const pair = `${zipSeq[i]}→${zipSeq[i + 1]}`
      transitions[pair] = (transitions[pair] || 0) + 1
    }
  })

  const startZip = Object.entries(zipFirst).sort((a, b) => b[1] - a[1])[0]?.[0]
  if (!startZip) return []

  const allZips = new Set(Object.keys(zipFreq))
  const order = [startZip]
  const visited = new Set([startZip])

  while (visited.size < allZips.size) {
    const current = order[order.length - 1]
    let bestNext = null, bestCount = 0
    for (const [pair, count] of Object.entries(transitions)) {
      const [from, to] = pair.split('→')
      if (from === current && !visited.has(to) && count > bestCount) {
        bestNext = to; bestCount = count
      }
    }
    if (bestNext) {
      order.push(bestNext); visited.add(bestNext)
    } else {
      const remaining = [...allZips].filter(z => !visited.has(z))
        .sort((a, b) => (zipFreq[b] || 0) - (zipFreq[a] || 0))
      if (remaining.length === 0) break
      order.push(remaining[0]); visited.add(remaining[0])
    }
  }

  return order
}
