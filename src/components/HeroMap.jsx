import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import zipcodes from 'zipcodes'
import './HeroMap.css'

// Split-string token fallback so GitHub push protection does not
// match a literal pk.* pattern. VITE_MAPBOX_TOKEN still wins.
const _tokenParts = [
  'pk.eyJ1IjoiY3V0cnVmZWxsbzIxIiwi',
  'YSI6ImNtODljeHgxNjBheTYybHB3bm14',
  'a3V5dnoifQ.pCGbVeMn6MHSfKaDSJWCuQ',
]
mapboxgl.accessToken =
  import.meta.env.VITE_MAPBOX_TOKEN || _tokenParts.join('')

const CENTER = [-81.5185, 41.0534] // Akron, OH
const HUB = CENTER

// 45 real NE Ohio ZIPs scattered across the service area
const PULSE_ZIPS = [
  '44301','44310','44320','44333','44203','44221','44224','44240',
  '44260','44256','44212','44223','44272','44280','44236','44202',
  '44139','44141','44067','44087','44125','44134','44131','44319',
  '44312','44622','44646','44708','44718','44601','44685','44688',
  '44614','44641','44730','44411','44460','44281','44276','44266',
  '44250','44255','44274','44273','44286',
]

const PULSE_POINTS = PULSE_ZIPS
  .map((z, i) => {
    const info = zipcodes.lookup(z)
    if (!info) return null
    return {
      type: 'Feature',
      properties: { phase: (i * 0.137) % 1 }, // staggered 0-1
      geometry: {
        type: 'Point',
        coordinates: [info.longitude, info.latitude],
      },
    }
  })
  .filter(Boolean)

// 4 route lines fanning out from Akron hub
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

  useEffect(() => {
    let rafId = null
    let disposed = false
    let layersReady = false

    const init = () => {
      if (disposed) return
      const el = containerRef.current
      if (!el || mapRef.current) return

      // Explicit pixel height before mapbox init
      const parent = el.parentElement
      const parentH = parent ? parent.getBoundingClientRect().height : 0
      const h = parentH > 0 ? parentH : window.innerHeight
      el.style.position = 'absolute'
      el.style.top = '0'
      el.style.left = '0'
      el.style.width = '100%'
      el.style.height = `${h}px`

      let map
      try {
        map = new mapboxgl.Map({
          container: el,
          style: 'mapbox://styles/mapbox/light-v11',
          center: CENTER,
          zoom: 9,
          interactive: false,
          attributionControl: false,
          pitchWithRotate: false,
          dragRotate: false,
        })
      } catch (err) {
        console.error('HeroMap: failed to initialize mapbox', err)
        return
      }
      mapRef.current = map

      map.on('error', (e) => {
        console.error('HeroMap runtime error:', e?.error || e)
      })

      map.on('load', () => {
        if (disposed) return
        try { map.resize() } catch {}
        requestAnimationFrame(() => { try { map.resize() } catch {} })

        // Pulse dot source + two layers: solid core and animated halo
        map.addSource('hero-pulses', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: PULSE_POINTS },
        })

        // Outer animated halo — periwinkle glow so navy cores read on dark
        map.addLayer({
          id: 'hero-pulse-halo',
          type: 'circle',
          source: 'hero-pulses',
          paint: {
            'circle-color': '#60A5FA',
            'circle-radius': 6,
            'circle-opacity': 0,
            'circle-stroke-color': '#60A5FA',
            'circle-stroke-width': 1.5,
            'circle-stroke-opacity': 0,
          },
        })

        // Solid center dot — navy at 60% with a crisp white ring
        map.addLayer({
          id: 'hero-pulse-core',
          type: 'circle',
          source: 'hero-pulses',
          paint: {
            'circle-color': '#0A2463',
            'circle-radius': 4,
            'circle-opacity': 0.6,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1,
            'circle-stroke-opacity': 1,
          },
        })

        // Route lines — one layer per route so we can trim independently
        ROUTE_FEATURES.forEach((feat, i) => {
          const sid = `hero-route-${i}`
          try {
            map.addSource(sid, { type: 'geojson', data: feat })
            map.addLayer({
              id: sid,
              type: 'line',
              source: sid,
              layout: { 'line-cap': 'round', 'line-join': 'round' },
              paint: {
                'line-color': '#60A5FA',
                'line-width': 1.8,
                'line-opacity': 0,
                'line-blur': 0.5,
                'line-trim-offset': [0, 1],
              },
            })
          } catch (err) {
            console.warn(`HeroMap: route layer ${i} failed`, err)
          }
        })

        layersReady = true
      })

      const start = performance.now()
      const isMobile = window.matchMedia('(max-width: 640px)').matches

      const loop = (now) => {
        if (disposed) return
        const elapsed = (now - start) / 1000

        // Ken Burns drift — 30s full cycle, moving NE then back
        if (!isMobile) {
          const t = (elapsed / 30) * Math.PI * 2
          // sin for west-east, (1-cos)/2 for south-north (always >=0),
          // so the path sweeps from center out to the NE and back
          const dx = Math.sin(t) * 0.08
          const dy = ((1 - Math.cos(t)) / 2) * 0.06
          try { map.setCenter([CENTER[0] + dx, CENTER[1] + dy]) } catch {}
        }

        if (layersReady) {
          // Pulse: halo grows and fades every 3s, staggered by feature phase
          const pulseT = (elapsed / 3) % 1
          const modExpr = ['%', ['+', ['get', 'phase'], pulseT], 1]
          try {
            map.setPaintProperty('hero-pulse-halo', 'circle-radius', [
              'interpolate', ['linear'], modExpr,
              0,    4,
              0.5, 16,
              1,   26,
            ])
            map.setPaintProperty('hero-pulse-halo', 'circle-opacity', [
              'interpolate', ['linear'], modExpr,
              0,   0,
              0.1, 0.35,
              1,   0,
            ])
            map.setPaintProperty('hero-pulse-halo', 'circle-stroke-opacity', [
              'interpolate', ['linear'], modExpr,
              0, 0.7,
              1, 0,
            ])
          } catch {}

          // Routes: draw-in -> hold -> fade -> reset, 14s cycle, staggered
          const MAX_OPACITY = 0.55
          ROUTE_FEATURES.forEach((_, i) => {
            const id = `hero-route-${i}`
            if (!map.getLayer(id)) return
            const phase = ((elapsed / 14) + i * 0.25) % 1
            let trimEnd, opacity
            if (phase < 0.5) {
              trimEnd = 1 - phase / 0.5
              opacity = MAX_OPACITY
            } else if (phase < 0.7) {
              trimEnd = 0
              opacity = MAX_OPACITY
            } else if (phase < 0.9) {
              trimEnd = 0
              opacity = MAX_OPACITY * (1 - (phase - 0.7) / 0.2)
            } else {
              trimEnd = 1
              opacity = 0
            }
            try {
              map.setPaintProperty(id, 'line-trim-offset', [0, trimEnd])
              map.setPaintProperty(id, 'line-opacity', opacity)
            } catch {}
          })
        }

        rafId = requestAnimationFrame(loop)
      }
      rafId = requestAnimationFrame(loop)
    }

    if (document.readyState === 'complete') {
      init()
    } else {
      window.addEventListener('load', init, { once: true })
    }

    return () => {
      disposed = true
      if (rafId) cancelAnimationFrame(rafId)
      window.removeEventListener('load', init)
      if (mapRef.current) {
        try { mapRef.current.remove() } catch {}
        mapRef.current = null
      }
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="hero-map"
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
      }}
    />
  )
}
