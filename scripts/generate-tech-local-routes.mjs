// One-time route generator for the Dispatch Portal "Local Expertise" slide.
// Queries Mapbox Directions for a small drivable loop in each NE Ohio city
// we serve, and writes the snapped polylines to techLocalRoutes.json for
// the TechLocalMap animation to consume at runtime (no runtime API cost).
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

// Centers picked inside each city's street grid (not in parks/lakes) so
// the Directions snap has real road to work with.
const CITIES = [
  { name: 'Akron',           lat: 41.0814, lng: -81.5190 },
  { name: 'Canton',          lat: 40.7989, lng: -81.3784 },
  { name: 'Wooster',         lat: 40.8051, lng: -81.9351 },
  { name: 'New Philadelphia',lat: 40.4898, lng: -81.4457 },
  { name: 'Massillon',       lat: 40.7967, lng: -81.5215 },
  { name: 'Kent',            lat: 41.1537, lng: -81.3579 },
  { name: 'Hudson',          lat: 41.2401, lng: -81.4404 },
  { name: 'Stow',            lat: 41.1595, lng: -81.4404 },
  { name: 'Dover',           lat: 40.5201, lng: -81.4742 },
  { name: 'Alliance',        lat: 40.9123, lng: -81.1057 },
  { name: 'Cuyahoga Falls',  lat: 41.1339, lng: -81.4846 },
  { name: 'Barberton',       lat: 41.0142, lng: -81.6068 },
]

// Build a ~1.5km rectangular loop around each center and let Directions
// snap the corners to real streets.
async function fetchLoop({ name, lat, lng }) {
  const dLat = 0.006 // ~670m
  const dLng = 0.008 // ~680m at 41°N
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
    coordinates: route.geometry.coordinates, // [[lng, lat], ...]
    distance: route.distance,
  }
}

const out = []
for (const city of CITIES) {
  try {
    const r = await fetchLoop(city)
    console.log(`✓ ${city.name.padEnd(18)} ${r.coordinates.length.toString().padStart(4)} pts  ${Math.round(r.distance)}m`)
    out.push(r)
  } catch (e) {
    console.error(`✗ ${city.name}: ${e.message}`)
  }
  // Gentle pacing so we don't burst the free-tier Directions limit.
  await new Promise((r) => setTimeout(r, 200))
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outPath = path.resolve(__dirname, '../src/components/techLocalRoutes.json')
await fs.writeFile(outPath, JSON.stringify(out, null, 2))
console.log(`\nWrote ${out.length} routes → ${path.relative(process.cwd(), outPath)}`)
