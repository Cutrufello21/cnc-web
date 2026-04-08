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
      id: i + 1, // required for setFeatureState
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
    let flashInterval = null
    let currentFlashId = null

    map.on('load', () => {
      // Strip all label / road-label / highway-shield / POI symbol layers
      // so the map reads as an abstract silhouette instead of a nav app.
      // Keep settlement-major-label only, but dim it heavily.
      const style = map.getStyle()
      if (style && style.layers) {
        for (const layer of style.layers) {
          if (layer.type !== 'symbol') continue
          if (layer.id === 'settlement-major-label') {
            map.setPaintProperty(layer.id, 'text-opacity', 0.25)
            map.setPaintProperty(layer.id, 'text-color', '#ffffff')
            map.setPaintProperty(layer.id, 'text-halo-color', 'rgba(0,0,0,0)')
            continue
          }
          map.setLayoutProperty(layer.id, 'visibility', 'none')
        }
      }

      // Pulse stops
      map.addSource('hero-pulses', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: PULSE_POINTS },
      })

      // Case expression: flashing pin → periwinkle, otherwise white.
      const flashColor = [
        'case',
        ['boolean', ['feature-state', 'flashing'], false],
        '#60A5FA',
        '#ffffff',
      ]

      // Solid 5px white dot — no halo, no pulse rings
      map.addLayer({
        id: 'hero-pulse-core',
        type: 'circle',
        source: 'hero-pulses',
        paint: {
          'circle-color': flashColor,
          'circle-radius': 2.5,
          'circle-opacity': 0.9,
          'circle-color-transition': { duration: 250 },
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
            'line-color': '#ffffff',
            'line-width': 1.2,
            'line-opacity': 0,
            'line-blur': 0.4,
            'line-trim-offset': [0, 1],
          },
        })
      })

      layersReady = true

      // Flash a random pin periwinkle every 4s — the one accent thread
      const triggerFlash = () => {
        if (currentFlashId != null) {
          map.setFeatureState({ source: 'hero-pulses', id: currentFlashId }, { flashing: false })
        }
        const next = PULSE_POINTS[Math.floor(Math.random() * PULSE_POINTS.length)]
        currentFlashId = next.id
        map.setFeatureState({ source: 'hero-pulses', id: currentFlashId }, { flashing: true })
        setTimeout(() => {
          if (currentFlashId != null) {
            map.setFeatureState({ source: 'hero-pulses', id: currentFlashId }, { flashing: false })
          }
        }, 700)
      }
      flashInterval = setInterval(triggerFlash, 4000)
      setTimeout(triggerFlash, 1500)
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
        // Routes: draw in → hold → fade → reset, 14s cycle, staggered.
        // Max opacity capped low — almost invisible, just movement hint.
        const MAX_LINE_OPACITY = 0.15
        ROUTE_FEATURES.forEach((_, i) => {
          const id = `hero-route-${i}`
          const phase = ((elapsed / 14) + i * 0.25) % 1
          let trimEnd, opacity
          if (phase < 0.5) {
            trimEnd = 1 - phase / 0.5
            opacity = MAX_LINE_OPACITY
          } else if (phase < 0.7) {
            trimEnd = 0
            opacity = MAX_LINE_OPACITY
          } else if (phase < 0.9) {
            trimEnd = 0
            opacity = MAX_LINE_OPACITY * (1 - (phase - 0.7) / 0.2)
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
      if (flashInterval) clearInterval(flashInterval)
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [])

  return <div ref={containerRef} className="hero-map" aria-hidden="true" />
}
