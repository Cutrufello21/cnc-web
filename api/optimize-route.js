// Route optimization engine v6 — Google Route Optimization API
// Uses Google's logistics-grade TSP solver with OAuth service account auth
// Fallback chain: Route Optimization API → Routes API → OSRM → nearest-neighbor

import { createSign } from 'crypto'
import ZIP_COORDS from '../src/lib/zipCoords.js'
import { supabase } from './_lib/supabase.js'
import { requireAuth } from './_lib/auth.js'

const GOOGLE_API_KEY = process.env.GOOGLE_ROUTES_API_KEY
const GOOGLE_GEOCODE_KEY = process.env.GOOGLE_GEOCODE_API_KEY || GOOGLE_API_KEY
const GOOGLE_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'cnc-dispatch'
const TOKEN_URI = 'https://oauth2.googleapis.com/token'

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

// ═══ Service Account OAuth ═══

function getServiceAccountCreds() {
  // Try individual env vars first (most reliable on Vercel)
  if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    return {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }
  }
  // Try JSON blob
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
      let raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim()
      if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) raw = raw.slice(1, -1)
      raw = raw.replace(/\\"/g, '"')
      const creds = JSON.parse(raw)
      if (typeof creds.private_key === 'string') creds.private_key = creds.private_key.replace(/\\n/g, '\n')
      return creds
    } catch (e) {
      console.error('[optimize] Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON:', e.message)
    }
  }
  return null
}

let cachedToken = null, tokenExpiry = 0

async function getOAuthToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken

  const creds = getServiceAccountCreds()
  if (!creds) throw new Error('No service account credentials — set GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY')

  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: TOKEN_URI,
    iat: now,
    exp: now + 3600,
  })).toString('base64url')

  const sign = createSign('RSA-SHA256')
  sign.update(`${header}.${payload}`)
  const signature = sign.sign(creds.private_key, 'base64url')

  const res = await fetch(TOKEN_URI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${header}.${payload}.${signature}`,
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`OAuth failed (${res.status}): ${txt}`)
  }

  const data = await res.json()
  cachedToken = data.access_token
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000
  return cachedToken
}

// ═══ MAIN HANDLER ═══

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const user = await requireAuth(req, res, { allowApiSecret: true })
  if (!user) return

  try {
    const { stops, pharmacy, startLat, startLng, endLat, endLng, oneWay } = req.body
    if (!stops?.length) return res.status(400).json({ error: 'stops array required' })

    const coords = await geocodeStops(stops)
    const withCoords = coords.filter(c => c.lat !== null)
    const withoutCoords = coords.filter(c => c.lat === null)

    if (withCoords.length === 0) {
      return res.json({ optimizedOrder: stops.map((_, i) => i), totalDistance: 0, totalDuration: 0 })
    }

    const phOrigin = PHARMACY_ORIGINS[pharmacy] || PHARMACY_ORIGINS.SHSP
    const origin = (startLat != null && startLng != null) ? [startLat, startLng] : phOrigin
    const hasEnd = endLat != null && endLng != null
    const isOneWay = !hasEnd && oneWay === true
    const endPoint = hasEnd ? [endLat, endLng] : null

    // Default: if no endPoint and not oneWay, it's round-trip
    const isRoundTrip = !hasEnd && !isOneWay

    console.log(`[optimize] ${withCoords.length} stops | pharmacy=${pharmacy} | oneWay=${isOneWay} | roundTrip=${isRoundTrip} | hasEnd=${hasEnd}`)

    let optimizedAll, method, totalDistMeters = null, totalDurSeconds = null

    // ── 1. Try Route Optimization API ──
    try {
      const result = await routeOptimizationSolve(withCoords, origin, endPoint, isOneWay, isRoundTrip)
      optimizedAll = result.stops
      totalDistMeters = result.distanceMeters
      totalDurSeconds = result.durationSeconds
      method = 'route-optimization-api'
      console.log(`[optimize] ✓ Route Optimization API: ${Math.round((totalDistMeters || 0) / 1609)} mi, ${Math.round((totalDurSeconds || 0) / 60)} min`)
    } catch (err) {
      console.error(`[optimize] ✗ Route Optimization API failed: ${err.message}`)

      // ── 2. Fallback: Routes API ──
      try {
        const dest = endPoint || (isRoundTrip ? origin : null)
        const result = await routesApiFallback(withCoords, origin, dest, isOneWay)
        optimizedAll = result.stops
        totalDistMeters = result.distanceMeters
        totalDurSeconds = result.durationSeconds
        method = 'google-routes-fallback'
        console.log(`[optimize] ✓ Routes API fallback: ${Math.round((totalDistMeters || 0) / 1609)} mi`)
      } catch (err2) {
        console.error(`[optimize] ✗ Routes API failed: ${err2.message}`)

        // ── 3. Fallback: OSRM ──
        try {
          optimizedAll = await osrmFallback(withCoords, origin[0], origin[1], hasEnd ? endLat : null, hasEnd ? endLng : null)
          method = 'osrm-fallback'
        } catch {
          // ── 4. Last resort: nearest neighbor ──
          optimizedAll = nearestNeighbor(withCoords, origin[0], origin[1])
          method = 'nearest-neighbor'
        }
      }
    }

    const optimizedOrder = [...optimizedAll.map(s => s.index), ...withoutCoords.map(c => c.index)]

    // Distance & duration
    let totalDistance, totalDuration
    if (totalDistMeters != null) {
      totalDistance = Math.round((totalDistMeters / 1609.34) * 10) / 10
      totalDuration = totalDurSeconds ? Math.round(totalDurSeconds / 60) : null
    } else {
      totalDistance = 0
      let cLat = origin[0], cLng = origin[1]
      for (const s of optimizedAll) {
        totalDistance += haversine(cLat, cLng, s.lat, s.lng)
        cLat = s.lat; cLng = s.lng
      }
      totalDistance = Math.round(totalDistance * 10) / 10
      totalDuration = null
    }

    // Per-stop reasons
    let cLat = origin[0], cLng = origin[1]
    const reasons = []
    for (const s of optimizedAll) {
      const d = haversine(cLat, cLng, s.lat, s.lng)
      let r = `${Math.round(d * 10) / 10} mi`
      if (s.geocodeMethod === 'zip-center') r += ' · ZIP est'
      reasons.push(r)
      cLat = s.lat; cLng = s.lng
    }

    return res.json({
      optimizedOrder,
      totalDistance,
      totalDuration,
      reasons,
      method,
      summary: `${optimizedAll.length} stops via ${method}`,
    })
  } catch (err) {
    console.error('[optimize] Fatal:', err)
    return res.status(500).json({ error: err.message })
  }
}

// ═══ ROUTE OPTIMIZATION API ═══

async function routeOptimizationSolve(stops, origin, endPoint, isOneWay, isRoundTrip) {
  const token = await getOAuthToken()

  const now = new Date()
  const globalStart = now.toISOString()
  const globalEnd = new Date(now.getTime() + 12 * 3600000).toISOString()

  const shipments = stops.map((s, i) => ({
    label: `s${s.index}`,
    deliveries: [{
      arrivalWaypoint: { location: { latLng: { latitude: s.lat, longitude: s.lng } } },
      duration: '60s',
    }],
  }))

  const vehicle = {
    label: 'driver',
    startWaypoint: { location: { latLng: { latitude: origin[0], longitude: origin[1] } } },
    travelMode: 'DRIVING',
    costPerHour: 30,
    costPerKilometer: 0.5,
  }

  if (endPoint) {
    vehicle.endWaypoint = { location: { latLng: { latitude: endPoint[0], longitude: endPoint[1] } } }
  } else if (isRoundTrip) {
    vehicle.endWaypoint = { location: { latLng: { latitude: origin[0], longitude: origin[1] } } }
  }
  // isOneWay: no endWaypoint = open-ended

  const body = {
    model: {
      shipments,
      vehicles: [vehicle],
      globalStartTime: globalStart,
      globalEndTime: globalEnd,
    },
    searchMode: 'CONSUME_ALL_AVAILABLE_TIME',
    considerRoadTraffic: true,
    timeout: '5s',
  }

  const resp = await fetch(
    `https://routeoptimization.googleapis.com/v1/projects/${GOOGLE_PROJECT}:optimizeTours`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    }
  )

  const data = await resp.json()

  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error))
  if (!data.routes?.[0]?.visits?.length) throw new Error('No visits in response')

  const visits = data.routes[0].visits
  const optimized = visits.map(v => stops[v.shipmentIndex ?? 0])

  let distMeters = 0, durSeconds = 0
  for (const t of (data.routes[0].transitions || [])) {
    distMeters += t.travelDistanceMeters || 0
    if (t.travelDuration) {
      const m = String(t.travelDuration).match(/(\d+)/)
      if (m) durSeconds += parseInt(m[1], 10)
    }
  }

  return { stops: optimized, distanceMeters: distMeters || null, durationSeconds: durSeconds || null }
}

// ═══ ROUTES API FALLBACK ═══

async function routesApiFallback(stops, origin, dest, isOneWay) {
  let destination, destStop = null, intermediates = stops

  if (dest) {
    destination = { location: { latLng: { latitude: dest[0], longitude: dest[1] } } }
  } else if (isOneWay) {
    // Pick farthest stop as destination
    let fi = 0, fd = 0
    for (let i = 0; i < stops.length; i++) {
      const d = haversine(origin[0], origin[1], stops[i].lat, stops[i].lng)
      if (d > fd) { fd = d; fi = i }
    }
    destStop = stops[fi]
    destination = { location: { latLng: { latitude: destStop.lat, longitude: destStop.lng } } }
    intermediates = stops.filter((_, i) => i !== fi)
  } else {
    destination = { location: { latLng: { latitude: origin[0], longitude: origin[1] } } }
  }

  const body = {
    origin: { location: { latLng: { latitude: origin[0], longitude: origin[1] } } },
    destination,
    intermediates: intermediates.map(s => {
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
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error))
  if (!data.routes?.[0]?.optimizedIntermediateWaypointIndex) throw new Error('No optimized order')

  const route = data.routes[0]
  const optimized = route.optimizedIntermediateWaypointIndex.map(i => intermediates[i])
  if (destStop) optimized.push(destStop)

  let durSec = null
  if (route.duration) {
    const m = String(route.duration).match(/(\d+)/)
    if (m) durSec = parseInt(m[1], 10)
  }

  return { stops: optimized, distanceMeters: route.distanceMeters || null, durationSeconds: durSec }
}

// ═══ OSRM FALLBACK ═══

async function osrmFallback(stops, startLat, startLng, endLat, endLng) {
  const pts = [{ lat: startLat, lng: startLng }, ...stops]
  if (endLat != null) pts.push({ lat: endLat, lng: endLng })

  const coords = pts.map(p => `${p.lng},${p.lat}`).join(';')
  const params = endLat != null ? 'source=first&destination=last&roundtrip=false' : 'source=first&roundtrip=false'

  const resp = await fetch(`https://router.project-osrm.org/trip/v1/driving/${coords}?${params}&overview=false`, { signal: AbortSignal.timeout(15000) })
  const data = await resp.json()
  if (data.code !== 'Ok' || !data.trips?.length) throw new Error('OSRM failed')

  return data.waypoints
    .map((wp, i) => ({ i, pos: wp.waypoint_index }))
    .slice(1, endLat != null ? -1 : undefined)
    .sort((a, b) => a.pos - b.pos)
    .map(wp => stops[wp.i - 1])
    .filter(Boolean)
}

// ═══ NEAREST NEIGHBOR ═══

function nearestNeighbor(stops, startLat, startLng) {
  const visited = new Set(), result = []
  let cLat = startLat, cLng = startLng
  while (result.length < stops.length) {
    let best = null, bestD = Infinity
    for (const s of stops) {
      if (visited.has(s.index)) continue
      const d = haversine(cLat, cLng, s.lat, s.lng)
      if (d < bestD) { bestD = d; best = s }
    }
    if (!best) break
    visited.add(best.index); result.push(best)
    cLat = best.lat; cLng = best.lng
  }
  return result
}

// ═══ GEOCODING ═══

async function geocodeStops(stops) {
  const keys = stops.map(s => `${(s.address || '').toLowerCase().trim()}|${(s.city || '').toLowerCase().trim()}|${(s.zip || '').trim()}`)

  const { data: cached } = await supabase.from('geocode_cache').select('cache_key, lat, lng').in('cache_key', keys)
  const cache = new Map()
  for (const r of (cached || [])) cache.set(r.cache_key, [r.lat, r.lng])

  const results = stops.map((s, i) => {
    const base = { index: i, address: s.address || '', city: s.city || '', zip: s.zip || '', coldChain: !!s.coldChain }
    if (s.lat && s.lng) return { ...base, lat: s.lat, lng: s.lng, geocodeMethod: 'app' }
    const c = cache.get(keys[i])
    if (c) return { ...base, lat: c[0], lng: c[1], geocodeMethod: 'cache' }
    return { ...base, lat: null, lng: null, _geo: true, _s: s }
  })

  const misses = results.filter(r => r._geo)
  if (misses.length > 0) {
    await Promise.all(misses.map(async (m) => {
      const s = m._s, r = results[m.index]
      const addr = `${s.address || ''}, ${s.city || ''}, OH ${s.zip || ''}`
      const key = keys[m.index]

      // Google Geocoding
      if (GOOGLE_GEOCODE_KEY) {
        try {
          const resp = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addr)}&key=${GOOGLE_GEOCODE_KEY}`, { signal: AbortSignal.timeout(5000) })
          const data = await resp.json()
          const loc = data.results?.[0]?.geometry?.location
          if (loc) {
            r.lat = loc.lat; r.lng = loc.lng; r.geocodeMethod = 'google'; r._geo = false
            supabase.from('geocode_cache').upsert({ cache_key: key, lat: loc.lat, lng: loc.lng }, { onConflict: 'cache_key' }).then(() => {})
            return
          }
        } catch {}
      }

      // Census
      try {
        const resp = await fetch(`https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(addr)}&benchmark=Public_AR_Current&format=json`, { signal: AbortSignal.timeout(8000) })
        const data = await resp.json()
        const match = data?.result?.addressMatches?.[0]
        if (match?.coordinates) {
          r.lat = match.coordinates.y; r.lng = match.coordinates.x; r.geocodeMethod = 'census'; r._geo = false
          supabase.from('geocode_cache').upsert({ cache_key: key, lat: r.lat, lng: r.lng }, { onConflict: 'cache_key' }).then(() => {})
          return
        }
      } catch {}

      // ZIP center
      const zip = String(s.zip || '').trim()
      const zc = ZIP_COORDS[zip] || ZIP_COORDS[zip.padStart(5, '0')]
      if (zc) {
        r.lat = zc[0] + (Math.random() - 0.5) * 0.002
        r.lng = zc[1] + (Math.random() - 0.5) * 0.002
        r.geocodeMethod = 'zip-center'; r._geo = false
      }
    }))
  }

  return results.map(r => { const { _geo, _s, ...c } = r; return c })
}
