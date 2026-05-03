import { supabase } from './_lib/supabase.js'
import { requireAuth } from './_lib/auth.js'

// POST /api/geocode
// Body: { addresses: [{ address, city, zip }, ...] }
// Returns: { results: [{ address, city, zip, lat, lng, source }, ...] }

export default async function handler(req, res) {
  if (req.method === 'HEAD') return res.status(200).end() // Health check for offline detection
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const user = await requireAuth(req, res, { allowApiSecret: true })
  if (!user) return

  let body
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' })
  }

  const { addresses, force } = body
  if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
    return res.status(400).json({ error: 'addresses array required' })
  }

  // Cap at 100 to prevent abuse
  const batch = addresses.slice(0, 100)
  const results = []
  const toGeocode = []

  // Step 1: Check Supabase cache (skip if force=true to re-geocode with Google)
  const cacheKeys = batch.map(a => buildCacheKey(a.address, a.city, a.zip))

  const cacheMap = new Map()
  if (!force) {
    const { data: cached } = await supabase
      .from('geocode_cache')
      .select('cache_key, lat, lng')
      .in('cache_key', cacheKeys)

    for (const row of (cached || [])) {
      cacheMap.set(row.cache_key, { lat: row.lat, lng: row.lng })
    }
  }

  // Sort into cached vs uncached
  for (let i = 0; i < batch.length; i++) {
    const a = batch[i]
    const key = cacheKeys[i]
    const hit = cacheMap.get(key)
    if (hit) {
      results.push({ ...a, lat: hit.lat, lng: hit.lng, source: 'cache' })
    } else {
      toGeocode.push({ ...a, _idx: i, _key: key })
      results.push(null) // placeholder
    }
  }

  // Step 2: Batch geocode uncached — Google first, Census fallback
  if (toGeocode.length > 0) {
    const googleResults = await batchGeocodeGoogle(toGeocode)

    // Collect any that Google missed for Census fallback
    const googleMissed = toGeocode.filter(a => !googleResults.has(a._key))
    const censusResults = googleMissed.length > 0 ? await batchGeocodeCensus(googleMissed) : new Map()

    // Step 3: Save new results to Supabase cache
    const toInsert = []
    for (const g of toGeocode) {
      const result = googleResults.get(g._key) || censusResults.get(g._key)
      const source = googleResults.has(g._key) ? 'google' : censusResults.has(g._key) ? 'census' : 'none'
      if (result) {
        results[g._idx] = { address: g.address, city: g.city, zip: g.zip, lat: result.lat, lng: result.lng, source }
        toInsert.push({
          cache_key: g._key,
          address: g.address,
          city: g.city,
          zip: g.zip,
          lat: result.lat,
          lng: result.lng,
        })
      } else {
        results[g._idx] = { address: g.address, city: g.city, zip: g.zip, lat: null, lng: null, source: 'none' }
      }
    }

    if (toInsert.length > 0) {
      await supabase
        .from('geocode_cache')
        .upsert(toInsert, { onConflict: 'cache_key' })
    }
  }

  // Return full array preserving indices — nulls become {lat:null,lng:null} so client index mapping stays correct
  return res.status(200).json({ results: results.map(r => r || { lat: null, lng: null, source: 'none' }) })
}

function buildCacheKey(address, city, zip) {
  return `${(address || '').toLowerCase().trim()}|${(city || '').toLowerCase().trim()}|${(zip || '').trim()}`
}

async function batchGeocodeGoogle(addresses) {
  const results = new Map()
  const apiKey = process.env.GOOGLE_ROUTES_API_KEY
  if (!apiKey) return results

  const CONCURRENCY = 10
  const chunks = []
  for (let i = 0; i < addresses.length; i += CONCURRENCY) {
    chunks.push(addresses.slice(i, i + CONCURRENCY))
  }

  for (const chunk of chunks) {
    const promises = chunk.map(async (a) => {
      try {
        const addr = `${a.address}, ${a.city}, OH ${a.zip}`
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addr)}&key=${apiKey}`
        const resp = await fetch(url, { signal: AbortSignal.timeout(5000) })
        const data = await resp.json()
        const match = data?.results?.[0]
        if (match?.geometry?.location) {
          results.set(a._key, {
            lat: match.geometry.location.lat,
            lng: match.geometry.location.lng,
          })
        }
      } catch (err) {
        console.warn('Google geocode failed for:', a.address, err.message)
      }
    })
    await Promise.all(promises)
  }

  return results
}

async function batchGeocodeCensus(addresses) {
  const results = new Map()

  // Census Bureau single-address endpoint (their batch endpoint requires CSV upload)
  // Process in parallel with concurrency limit
  const CONCURRENCY = 5
  const chunks = []
  for (let i = 0; i < addresses.length; i += CONCURRENCY) {
    chunks.push(addresses.slice(i, i + CONCURRENCY))
  }

  for (const chunk of chunks) {
    const promises = chunk.map(async (a) => {
      try {
        const addr = `${a.address}, ${a.city}, OH ${a.zip}`
        const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(addr)}&benchmark=Public_AR_Current&format=json`
        const resp = await fetch(url, { signal: AbortSignal.timeout(8000) })
        const data = await resp.json()
        const match = data?.result?.addressMatches?.[0]
        if (match) {
          results.set(a._key, {
            lat: match.coordinates.y,
            lng: match.coordinates.x,
          })
        }
      } catch (err) {
        console.warn('Census geocode failed for:', a.address, err.message)
      }
    })
    await Promise.all(promises)
  }

  return results
}
