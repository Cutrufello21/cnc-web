import { fetchRange, MASTER_SHEET_ID } from './sheets.js'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import https from 'https'

// Load geocode cache
let geocodeCache = {}
const LOCAL_CACHE_PATH = join(process.env.HOME || '/tmp', 'Desktop', 'cnc-dispatch', '.geocode_cache.json')

function loadCache() {
  try {
    if (existsSync(LOCAL_CACHE_PATH)) {
      geocodeCache = JSON.parse(readFileSync(LOCAL_CACHE_PATH, 'utf8'))
    }
  } catch {
    // On Vercel, use in-memory cache only
  }
  // Also check env var for Vercel deployment
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
    const rows = await fetchRange(MASTER_SHEET_ID, 'Orders!A1:K25000')
    if (rows.length < 2) return res.status(200).json({ locations: [] })

    const headers = rows[0].map(h => h.trim())
    const addrIdx = headers.indexOf('Address')
    const cityIdx = headers.indexOf('City')
    const zipIdx = headers.indexOf('ZIP')
    const pharmaIdx = headers.indexOf('Pharmacy')
    const ccIdx = headers.indexOf('Cold Chain')
    const dateIdx = headers.indexOf('Date Delivered')
    const driverIdx = headers.indexOf('Driver Name')
    const nameIdx = headers.indexOf('Name')
    const orderIdx = headers.indexOf('Order ID')

    // Aggregate by normalized address
    const locationMap = {}

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      if (!row[addrIdx]) continue

      const address = (row[addrIdx] || '').trim()
      const city = (row[cityIdx] || '').trim()
      const zip = (row[zipIdx] || '').trim()
      const key = `${address}|${city}|${zip}`

      if (!locationMap[key]) {
        locationMap[key] = {
          address,
          city,
          zip,
          pharmacy: row[pharmaIdx] || '',
          totalDeliveries: 0,
          coldChainCount: 0,
          lastDate: '',
          orders: [],
          coords: null,
        }
      }

      const loc = locationMap[key]
      loc.totalDeliveries++

      const cc = (row[ccIdx] || '').trim().toLowerCase()
      if (cc && cc !== 'no' && cc !== 'n') loc.coldChainCount++

      const date = row[dateIdx] || ''
      if (date > loc.lastDate) loc.lastDate = date

      // Keep last 20 orders for the detail panel
      if (loc.orders.length < 20) {
        loc.orders.push({
          orderId: row[orderIdx] || '',
          name: row[nameIdx] || '',
          date: date,
          driver: row[driverIdx] || '',
          pharmacy: row[pharmaIdx] || '',
          coldChain: cc && cc !== 'no' && cc !== 'n',
        })
      }
    }

    // Geocode locations using cache
    const locations = []
    let geocoded = 0
    const MAX_GEOCODE = 50 // Limit new geocodes per request

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
          lat: coords[0],
          lng: coords[1],
          address: loc.address,
          city: loc.city,
          zip: loc.zip,
          pharmacy: loc.pharmacy,
          totalDeliveries: loc.totalDeliveries,
          coldChainCount: loc.coldChainCount,
          coldChainPct: loc.totalDeliveries ? Math.round((loc.coldChainCount / loc.totalDeliveries) * 100) : 0,
          lastDate: loc.lastDate,
          orders: loc.orders,
        })
      }
    }

    // Save updated cache locally
    if (geocoded > 0) {
      try { writeFileSync(LOCAL_CACHE_PATH, JSON.stringify(geocodeCache)) } catch {}
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
