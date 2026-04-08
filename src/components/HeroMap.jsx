import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

if (!mapboxgl.accessToken) {
  mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN
}

const CENTER = [-81.5185, 41.0534] // Akron, OH

// ---- Generate 90 delivery stops clustered on real NE Ohio cities ----
// [lng, lat, count, jitter] — more pins + tighter jitter = denser
const CLUSTERS = [
  [-81.5190, 41.0814, 16, 0.025], // Akron (heavy)
  [-81.3784, 40.7989, 12, 0.025], // Canton (heavy)
  [-81.6216, 41.1253, 8,  0.018], // Fairlawn
  [-81.4401, 41.1595, 7,  0.018], // Stow
  [-81.4846, 41.1339, 6,  0.018], // Cuyahoga Falls
  [-81.4401, 41.2401, 5,  0.020], // Hudson
  [-81.6048, 41.0145, 6,  0.018], // Barberton
  [-81.4871, 40.9484, 5,  0.020], // Green
  [-81.4023, 40.8759, 5,  0.020], // North Canton
  [-81.5215, 40.7967, 5,  0.020], // Massillon
  [-81.8637, 41.1385, 5,  0.025], // Medina
  [-81.7297, 41.0259, 4,  0.022], // Wadsworth
  [-81.9351, 40.8051, 4,  0.030], // Wooster
  [-81.6944, 41.4993, 5,  0.035], // Cleveland south suburbs
]

// Simple seeded PRNG so pin positions stay identical across renders
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(42)

// Box-Muller-ish gaussian for tighter center clustering
function gauss() {
  const u = Math.max(rand(), 1e-6)
  const v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

const STOPS = (() => {
  const features = []
  let id = 1
  for (const [lng, lat, count, jitter] of CLUSTERS) {
    for (let i = 0; i < count; i++) {
      features.push({
        type: 'Feature',
        id: id++,
        properties: { phase: rand() }, // random pulse phase 0-1
        geometry: {
          type: 'Point',
          coordinates: [lng + gauss() * jitter, lat + gauss() * jitter * 0.75],
        },
      })
    }
  }
  return features
})()

// ---- Two pharmacy origin points with routes fanning out ----
const ORIGIN_AKRON = [-81.5190, 41.0814]
const ORIGIN_CANTON = [-81.3784, 40.7989]

const ROUTE_FEATURES = [
  // From Akron origin
  { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [ORIGIN_AKRON, [-81.86, 41.42]] } }, // NW
  { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [ORIGIN_AKRON, [-81.24, 41.25]] } }, // NE
  // From Canton origin
  { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [ORIGIN_CANTON, [-80.95, 40.75]] } }, // E
  { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [ORIGIN_CANTON, [-81.93, 40.81]] } }, // W
]

export default function HeroMap() {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const rafRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: CENTER,
      zoom: 9.5,
      interactive: false,
      attributionControl: false,
      pitchWithRotate: false,
      dragRotate: false,
    })
    mapRef.current = map

    let layersReady = false
    let flashTimer = null
    let currentFlashId = null

    map.on('load', () => {
      // Stops source — every feature has a numeric id so we can use feature-state
      map.addSource('hero-stops', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: STOPS },
      })

      // Origin pharmacy markers
      map.addSource('hero-origins', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [ORIGIN_AKRON, ORIGIN_CANTON].map((c) => ({
            type: 'Feature',
            properties: {},
            geometry: { type: 'Point', coordinates: c },
          })),
        },
      })

      // Subtle pulse halo — animated via per-frame paint property updates
      map.addLayer({
        id: 'hero-stop-halo',
        type: 'circle',
        source: 'hero-stops',
        paint: {
          'circle-color': '#5eead4',
          'circle-radius': 4,
          'circle-opacity': 0,
        },
      })

      // The delivery stop pin — 8px diameter navy with white border,
      // flashes emerald when the current flashing feature-state is true
      map.addLayer({
        id: 'hero-stop-pin',
        type: 'circle',
        source: 'hero-stops',
        paint: {
          'circle-color': [
            'case',
            ['boolean', ['feature-state', 'flashing'], false],
            '#10B981',
            '#0A2463',
          ],
          'circle-radius': 4,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1,
          'circle-stroke-opacity': 1,
          'circle-opacity': 1,
          'circle-color-transition': { duration: 250 },
        },
      })

      // Origin pharmacy pin — slightly larger, emerald ring
      map.addLayer({
        id: 'hero-origin-pin',
        type: 'circle',
        source: 'hero-origins',
        paint: {
          'circle-color': '#10B981',
          'circle-radius': 6,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
          'circle-opacity': 1,
        },
      })

      // Route lines — one layer per route so we can trim independently
      ROUTE_FEATURES.forEach((feat, i) => {
        const sid = `hero-route-${i}`
        map.addSource(sid, { type: 'geojson', data: feat })
        map.addLayer({
          id: sid,
          type: 'line',
          source: sid,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#5eead4',
            'line-width': 2,
            'line-opacity': 0,
            'line-blur': 0.5,
            'line-trim-offset': [0, 1],
          },
        })
      })

      layersReady = true

      // Fire a delivery flash every ~4 seconds on a random stop
      const triggerFlash = () => {
        if (currentFlashId != null) {
          map.setFeatureState({ source: 'hero-stops', id: currentFlashId }, { flashing: false })
        }
        const next = STOPS[Math.floor(Math.random() * STOPS.length)]
        currentFlashId = next.id
        map.setFeatureState({ source: 'hero-stops', id: currentFlashId }, { flashing: true })
        // return to navy after 700ms
        setTimeout(() => {
          if (currentFlashId != null) {
            map.setFeatureState({ source: 'hero-stops', id: currentFlashId }, { flashing: false })
          }
        }, 700)
      }
      flashTimer = setInterval(triggerFlash, 4000)
      // kick one off immediately so the effect is visible
      setTimeout(triggerFlash, 1500)
    })

    const start = performance.now()
    const isMobile = window.matchMedia('(max-width: 640px)').matches

    const loop = (now) => {
      const elapsed = (now - start) / 1000

      // Ken Burns drift — 30s cycle, disabled on mobile
      if (!isMobile) {
        const t = (elapsed / 30) * Math.PI * 2
        const dx = Math.sin(t) * 0.07
        const dy = (1 - Math.cos(t)) * 0.035
        map.setCenter([CENTER[0] + dx, CENTER[1] + dy])
      }

      if (layersReady) {
        // Per-pin halo pulse — 2s cycle, staggered by feature phase
        const pulseT = (elapsed / 2) % 1
        const modExpr = ['%', ['+', ['get', 'phase'], pulseT], 1]

        map.setPaintProperty('hero-stop-halo', 'circle-radius', [
          'interpolate', ['linear'], modExpr,
          0,   4,
          1,   9,
        ])
        map.setPaintProperty('hero-stop-halo', 'circle-opacity', [
          'interpolate', ['linear'], modExpr,
          0,   0.55,
          1,   0,
        ])

        // Routes: draw in → hold → fade → reset, 12s cycle, staggered
        ROUTE_FEATURES.forEach((_, i) => {
          const id = `hero-route-${i}`
          const phase = ((elapsed / 12) + i * 0.25) % 1
          let trimEnd, opacity
          if (phase < 0.5) {
            trimEnd = 1 - phase / 0.5
            opacity = 0.9
          } else if (phase < 0.7) {
            trimEnd = 0
            opacity = 0.9
          } else if (phase < 0.9) {
            trimEnd = 0
            opacity = 0.9 * (1 - (phase - 0.7) / 0.2)
          } else {
            trimEnd = 1
            opacity = 0
          }
          map.setPaintProperty(id, 'line-trim-offset', [0, trimEnd])
          map.setPaintProperty(id, 'line-opacity', opacity)
        })
      }

      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (flashTimer) clearInterval(flashTimer)
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [])

  return <div ref={containerRef} className="hero-map" aria-hidden="true" />
}
