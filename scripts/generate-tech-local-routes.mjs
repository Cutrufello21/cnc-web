// One-time route generator for the Dispatch Portal "Local Expertise" slide.
// For each city, request a road-snapped loop from Mapbox Directions. One
// car per city, so the loops have to be large enough to read as motion
// at zoom 7.6 but not so large that neighboring cities' loops overlap.
// ~4km square works: snapped polylines come back ~10–18km long.
//
// Run:  node scripts/generate-tech-local-routes.mjs
// Needs VITE_MAPBOX_TOKEN in .env

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import 'dotenv/config'

const TOKEN = process.env.VITE_MAPBOX_TOKEN
if (!TOKEN) {
  console.error('VITE_MAPBOX_TOKEN missing from .env')
  process.exit(1)
}

// 8 cities chosen so that every pair is at least ~10 miles apart —
// larger than our loop radius, so no two cars can visually collide.
const CITIES = [
  { name: 'Akron',           lat: 41.0814, lng: -81.5190 },
  { name: 'Kent',            lat: 41.1537, lng: -81.3579 },
  { name: 'Medina',          lat: 41.1383, lng: -81.8637 },
  { name: 'Wooster',         lat: 40.8051, lng: -81.9351 },
  { name: 'Canton',          lat: 40.7989, lng: -81.3784 },
  { name: 'Alliance',        lat: 40.9123, lng: -81.1057 },
  { name: 'New Philadelphia',lat: 40.4898, lng: -81.4457 },
  { name: 'Massillon',       lat: 40.7967, lng: -81.5215 },
]

// Build a ~4km rectangular loop around each center and let Directions
// snap the corners to real streets. Bigger than v1's 1.5km loops so the
// motion is actually visible at regional zoom.
async function fetchLoop({ name, lat, lng }) {
  const dLat = 0.018 // ~2km
  const dLng = 0.024 // ~2km at 41°N
  const corners = [
    [lng - dLng, lat - dLat],
    [lng + dLng, lat - dLat],
    [lng + dLng, lat + dLat],
    [lng - dLng, lat + dLat],
    [lng - dLng, lat - dLat], // close the loop
  ]
  const coordStr = corners.map(([x, y]) => `${x},${y}`).join(';')
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${coordStr}` +
    `?geometries=geojson&overview=full&access_token=${TOKEN}`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  const route = json.routes?.[0]
  if (!route) throw new Error(json.message || 'no route returned')
  return {
    name,
    coordinates: route.geometry.coordinates,
    distance: route.distance,
  }
}

const out = []
for (const city of CITIES) {
  try {
    const r = await fetchLoop(city)
    console.log(`✓ ${city.name.padEnd(18)} ${r.coordinates.length.toString().padStart(4)} pts  ${(r.distance / 1000).toFixed(1)}km`)
    out.push(r)
  } catch (e) {
    console.error(`✗ ${city.name}: ${e.message}`)
  }
  await new Promise((r) => setTimeout(r, 200))
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outPath = path.resolve(__dirname, '../src/components/techLocalRoutes.json')
await fs.writeFile(outPath, JSON.stringify(out, null, 2))
console.log(`\nWrote ${out.length} routes → ${path.relative(process.cwd(), outPath)}`)
