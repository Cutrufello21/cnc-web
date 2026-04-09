// One-time route generator for the Dispatch Portal "Local Expertise" slide.
// Queries Mapbox Directions for a set of inter-city delivery circuits
// across NE Ohio and writes the snapped polylines to techLocalRoutes.json
// for the TechLocalMap animation to consume at runtime (no runtime API
// cost).
//
// Each "circuit" is a multi-waypoint round trip — the car drives from
// city A to city B (and sometimes to a third city) and back. This gives
// us big, regional motion on the map instead of tight loops around a
// single label.
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

// Inter-city delivery circuits. Waypoints are real city centers; Mapbox
// Directions snaps the connections onto the actual highway network so
// every route follows real roads (I-77, US-30, US-62, SR-59, etc.).
const CIRCUITS = [
  {
    name: 'Akron ↔ Kent',
    waypoints: [
      [-81.5190, 41.0814], // Akron
      [-81.3579, 41.1537], // Kent
      [-81.5190, 41.0814],
    ],
  },
  {
    name: 'Akron ↔ Canton (I-77)',
    waypoints: [
      [-81.5190, 41.0814],
      [-81.3784, 40.7989], // Canton
      [-81.5190, 41.0814],
    ],
  },
  {
    name: 'Akron → Wooster → Massillon → Akron',
    waypoints: [
      [-81.5190, 41.0814],
      [-81.9351, 40.8051], // Wooster
      [-81.5215, 40.7967], // Massillon
      [-81.5190, 41.0814],
    ],
  },
  {
    name: 'Canton → New Philadelphia → Dover → Canton',
    waypoints: [
      [-81.3784, 40.7989],
      [-81.4457, 40.4898], // New Philadelphia
      [-81.4742, 40.5201], // Dover
      [-81.3784, 40.7989],
    ],
  },
  {
    name: 'Canton ↔ Alliance',
    waypoints: [
      [-81.3784, 40.7989],
      [-81.1057, 40.9123], // Alliance
      [-81.3784, 40.7989],
    ],
  },
  {
    name: 'Massillon ↔ Wooster',
    waypoints: [
      [-81.5215, 40.7967],
      [-81.9351, 40.8051],
      [-81.5215, 40.7967],
    ],
  },
]

async function fetchCircuit({ name, waypoints }) {
  const coordStr = waypoints.map(([x, y]) => `${x},${y}`).join(';')
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
for (const circuit of CIRCUITS) {
  try {
    const r = await fetchCircuit(circuit)
    console.log(
      `✓ ${circuit.name.padEnd(40)} ${r.coordinates.length.toString().padStart(5)} pts  ${(r.distance / 1000).toFixed(1)}km`
    )
    out.push(r)
  } catch (e) {
    console.error(`✗ ${circuit.name}: ${e.message}`)
  }
  await new Promise((r) => setTimeout(r, 200))
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outPath = path.resolve(__dirname, '../src/components/techLocalRoutes.json')
await fs.writeFile(outPath, JSON.stringify(out, null, 2))
console.log(`\nWrote ${out.length} circuits → ${path.relative(process.cwd(), outPath)}`)
