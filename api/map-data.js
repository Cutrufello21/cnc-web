import { supabase } from './_lib/supabase.js'
import https from 'https'

// In-memory geocode cache (persists across warm invocations)
let geocodeCache = {}

function loadCache() {
  if (Object.keys(geocodeCache).length === 0 && process.env.GEOCODE_CACHE) {
    try { geocodeCache = JSON.parse(process.env.GEOCODE_CACHE) } catch {}
  }
}

loadCache()

function makeCacheKey(address, city, zip) {
  return `${address}, ${city}, OH ${zip}`
}

// US Census Geocoder — free, no key
function geocodeAddress(address, city, state, zip) {
  return new Promise((resolve) => {
    const query = encodeURIComponent(`${address}, ${city}, ${state} ${zip}`)
    const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${query}&benchmark=Public_AR_Current&format=json`

    const req = https.get(url, { timeout: 5000 }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          const match = json.result?.addressMatches?.[0]
          if (match) {
            resolve([match.coordinates.y, match.coordinates.x])
          } else {
            resolve(null)
          }
        } catch { resolve(null) }
      })
    })
    req.on('error', () => resolve(null))
    req.on('timeout', () => { req.destroy(); resolve(null) })
  })
}

// GET /api/map-data — returns aggregated delivery locations with coordinates

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { data: orders, error } = await supabase.from('daily_stops')
      .select('order_id, patient_name, address, city, zip, pharmacy, driver_name, delivery_date, cold_chain')
      .not('address', 'is', null)
      .not('address', 'eq', '')

    if (error) throw error

    // Aggregate by normalized address
    const locationMap = {}

    for (const row of (orders || [])) {
      const key = `${row.address}|${row.city}|${row.zip}`

      if (!locationMap[key]) {
        locationMap[key] = {
          address: row.address,
          city: row.city,
          zip: row.zip,
          pharmacy: row.pharmacy,
          totalDeliveries: 0,
          coldChainCount: 0,
          lastDate: '',
          orders: [],
          coords: null,
        }
      }

      const loc = locationMap[key]
      loc.totalDeliveries++
      if (row.cold_chain) loc.coldChainCount++

      const date = row.delivery_date || ''
      if (date > loc.lastDate) loc.lastDate = date

      if (loc.orders.length < 20) {
        loc.orders.push({
          orderId: row.order_id,
          name: row.patient_name,
          date, driver: row.driver_name,
          pharmacy: row.pharmacy,
          coldChain: row.cold_chain,
        })
      }
    }

    // Geocode locations using cache
    const locations = []
    let geocoded = 0
    const MAX_GEOCODE = 50

    for (const loc of Object.values(locationMap)) {
      const cacheKey = makeCacheKey(loc.address, loc.city, loc.zip)
      let coords = geocodeCache[cacheKey]

      if (!coords && geocoded < MAX_GEOCODE) {
        coords = await geocodeAddress(loc.address, loc.city, 'OH', loc.zip)
        if (coords) {
          geocodeCache[cacheKey] = coords
          geocoded++
        }
      }

      if (coords) {
        locations.push({
          lat: coords[0], lng: coords[1],
          address: loc.address, city: loc.city, zip: loc.zip,
          pharmacy: loc.pharmacy,
          totalDeliveries: loc.totalDeliveries,
          coldChainCount: loc.coldChainCount,
          coldChainPct: loc.totalDeliveries ? Math.round((loc.coldChainCount / loc.totalDeliveries) * 100) : 0,
          lastDate: loc.lastDate,
          orders: loc.orders,
        })
      }
    }

    return res.status(200).json({
      locations,
      totalLocations: Object.keys(locationMap).length,
      geocodedLocations: locations.length,
      newGeocoded: geocoded,
      cachedAddresses: Object.keys(geocodeCache).length,
    })
  } catch (err) {
    console.error('[map-data API]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
