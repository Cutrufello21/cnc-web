import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import zipcodes from 'zipcodes'

if (!mapboxgl.accessToken) {
  mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN
}

const CENTER = [-81.5185, 41.0534] // Akron, OH
const HUB = CENTER

// Real NE Ohio ZIPs scattered across the service area
const PULSE_ZIPS = [
  '44301','44310','44320','44333','44203','44221','44224','44240',
  '44260','44256','44212','44223','44272','44280','44236','44202',
  '44139','44141','44067','44087','44125','44134','44131','44319',
  '44312','44622','44646','44708','44718','44601','44685','44688',
  '44614','44641','44730','44411','44460','44281','44276','44266',
  '44250','44255','44274','44273','44286','44232','44233','44215',
]

const PULSE_POINTS = PULSE_ZIPS
  .map((z, i) => {
    const info = zipcodes.lookup(z)
    if (!info) return null
    return {
      type: 'Feature',
      properties: { phase: (i * 0.137) % 1 },
      geometry: { type: 'Point', coordinates: [info.longitude, info.latitude] },
    }
  })
  .filter(Boolean)

// 4 route lines: hub → outer corners of the service area
const ROUTE_ENDS = [
  [-81.86, 41.42], // NW — Medina/Cleveland
  [-80.82, 41.20], // NE — Youngstown
  [-81.10, 40.82], // SE — Alliance/Canton
  [-81.95, 40.80], // SW — Wooster
]

const ROUTE_FEATURES = ROUTE_ENDS.map((end) => ({
  type: 'Feature',
  properties: {},
  geometry: { type: 'LineString', coordinates: [HUB, end] },
}))

export default function HeroMap() {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const rafRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: CENTER,
      zoom: 9.5,
      interactive: false,
      attributionControl: false,
      pitchWithRotate: false,
      dragRotate: false,
    })
    mapRef.current = map

    let layersReady = false

    map.on('load', () => {
      // Pulse dots
      map.addSource('hero-pulses', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: PULSE_POINTS },
      })

      // Outer animated halo
      map.addLayer({
        id: 'hero-pulse-halo',
        type: 'circle',
        source: 'hero-pulses',
        paint: {
          'circle-color': '#0a2463',
          'circle-radius': 6,
          'circle-opacity': 0,
          'circle-stroke-color': '#0a2463',
          'circle-stroke-width': 1.5,
          'circle-stroke-opacity': 0,
        },
      })

      // Solid center dot
      map.addLayer({
        id: 'hero-pulse-core',
        type: 'circle',
        source: 'hero-pulses',
        paint: {
          'circle-color': '#0a2463',
          'circle-radius': 3.2,
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
            'line-width': 2.2,
            'line-opacity': 0,
            'line-blur': 0.5,
            'line-trim-offset': [0, 1],
          },
        })
      })

      layersReady = true
    })

    const start = performance.now()
    const isMobile = window.matchMedia('(max-width: 640px)').matches

    const loop = (now) => {
      const elapsed = (now - start) / 1000

      // Ken Burns drift — 30s full cycle, disabled on mobile
      if (!isMobile) {
        const t = (elapsed / 30) * Math.PI * 2
        const dx = Math.sin(t) * 0.07
        const dy = (1 - Math.cos(t)) * 0.035
        map.setCenter([CENTER[0] + dx, CENTER[1] + dy])
      }

      if (layersReady) {
        // Pulse: halo grows and fades every 3s, staggered by feature phase
        const pulseT = (elapsed / 3) % 1
        const modExpr = ['%', ['+', ['get', 'phase'], pulseT], 1]

        map.setPaintProperty('hero-pulse-halo', 'circle-radius', [
          'interpolate', ['linear'], modExpr,
          0,    4,
          0.5, 18,
          1,   28,
        ])
        map.setPaintProperty('hero-pulse-halo', 'circle-opacity', [
          'interpolate', ['linear'], modExpr,
          0,   0.0,
          0.1, 0.5,
          1,   0.0,
        ])
        map.setPaintProperty('hero-pulse-halo', 'circle-stroke-opacity', [
          'interpolate', ['linear'], modExpr,
          0,   0.9,
          1,   0.0,
        ])

        // Routes: draw in → hold → fade → reset, 12s cycle, staggered
        ROUTE_FEATURES.forEach((_, i) => {
          const id = `hero-route-${i}`
          const phase = ((elapsed / 12) + i * 0.25) % 1
          let trimEnd, opacity
          if (phase < 0.5) {
            trimEnd = 1 - phase / 0.5
            opacity = 0.95
          } else if (phase < 0.7) {
            trimEnd = 0
            opacity = 0.95
          } else if (phase < 0.9) {
            trimEnd = 0
            opacity = 0.95 * (1 - (phase - 0.7) / 0.2)
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
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [])

  return <div ref={containerRef} className="hero-map" aria-hidden="true" />
}
