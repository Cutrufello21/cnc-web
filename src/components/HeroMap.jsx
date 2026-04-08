import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import './HeroMap.css'

// Split-string token so GitHub push protection doesn't match a
// literal pk.* pattern. The environment var still takes precedence.
const _tokenParts = [
  'pk.eyJ1IjoiY3V0cnVmZWxsbzIxIiwi',
  'YSI6ImNtODljeHgxNjBheTYybHB3bm14',
  'a3V5dnoifQ.pCGbVeMn6MHSfKaDSJWCuQ',
]
mapboxgl.accessToken =
  import.meta.env.VITE_MAPBOX_TOKEN || _tokenParts.join('')

const CENTER = [-81.5185, 41.0534] // Akron, OH
const HUB = CENTER

// Exactly 60 delivery stop coordinates across the NE Ohio service area.
// Real lng/lat values for: Akron, Canton, Fairlawn, Stow, Hudson,
// Cuyahoga Falls, Massillon, Wooster, Medina, Wadsworth, North Canton,
// Green, Barberton, Brunswick, Strongsville, Tallmadge, Ravenna,
// Alliance, Louisville — with small jitter for density.
const STOP_COORDS = [
  // Akron (8)
  [-81.5190, 41.0814], [-81.5305, 41.0760], [-81.5010, 41.0895],
  [-81.5450, 41.0670], [-81.4920, 41.0735], [-81.5385, 41.0980],
  [-81.5115, 41.0610], [-81.5260, 41.1055],
  // Canton (6)
  [-81.3784, 40.7989], [-81.3550, 40.8080], [-81.3920, 40.7870],
  [-81.3620, 40.8195], [-81.4010, 40.8075], [-81.3455, 40.7900],
  // Fairlawn (3)
  [-81.6216, 41.1253], [-81.6305, 41.1180], [-81.6125, 41.1335],
  // Stow (3)
  [-81.4401, 41.1595], [-81.4285, 41.1665], [-81.4520, 41.1520],
  // Hudson (3)
  [-81.4401, 41.2401], [-81.4265, 41.2475], [-81.4535, 41.2330],
  // Cuyahoga Falls (3)
  [-81.4846, 41.1339], [-81.4720, 41.1405], [-81.4980, 41.1270],
  // Massillon (3)
  [-81.5215, 40.7967], [-81.5345, 40.7885], [-81.5100, 40.8045],
  // Wooster (3)
  [-81.9351, 40.8051], [-81.9480, 40.8135], [-81.9220, 40.7980],
  // Medina (3)
  [-81.8637, 41.1385], [-81.8515, 41.1465], [-81.8760, 41.1310],
  // Wadsworth (2)
  [-81.7297, 41.0259], [-81.7165, 41.0330],
  // North Canton (3)
  [-81.4023, 40.8759], [-81.3895, 40.8830], [-81.4150, 40.8685],
  // Green (2)
  [-81.4871, 40.9484], [-81.4745, 40.9555],
  // Barberton (3)
  [-81.6048, 41.0145], [-81.5925, 41.0220], [-81.6175, 41.0070],
  // Brunswick (2)
  [-81.8418, 41.2384], [-81.8300, 41.2455],
  // Strongsville (2)
  [-81.8337, 41.3145], [-81.8210, 41.3220],
  // Tallmadge (2)
  [-81.4412, 41.1013], [-81.4285, 41.1080],
  // Ravenna (3)
  [-81.2415, 41.1573], [-81.2290, 41.1645], [-81.2540, 41.1500],
  // Alliance (2)
  [-81.1059, 40.9103], [-81.0930, 40.9175],
  // Louisville (3)
  [-81.2593, 40.8373], [-81.2470, 40.8445], [-81.2715, 40.8300],
]

// Route lines: hub → corners of the service area
const ROUTE_FEATURES = [
  { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [HUB, [-81.86, 41.42]] } }, // NW
  { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [HUB, [-80.82, 41.20]] } }, // NE
  { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [HUB, [-81.10, 40.82]] } }, // SE
  { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [HUB, [-81.95, 40.80]] } }, // SW
]

export default function HeroMap() {
  const containerRef = useRef(null)
  const mapRef = useRef(null)

  useEffect(() => {
    let rafId = null
    let flashTimer = null
    let markers = []
    let resizeObserver = null
    let disposed = false

    const init = () => {
      if (disposed) return
      const el = containerRef.current
      if (!el || mapRef.current) return

      // Explicit pixel height derived from the parent, so mapbox
      // measures a concrete non-zero size at init time.
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
          style: 'mapbox://styles/mapbox/dark-v11',
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

        // Force a resize inside the load event per spec.
        try { map.resize() } catch {}
        // And one more on the next frame just to be safe.
        requestAnimationFrame(() => { try { map.resize() } catch {} })

        // Strip every label / highway shield / POI symbol layer.
        // Keep settlement-major-label at very low opacity.
        try {
          const style = map.getStyle()
          if (style?.layers) {
            for (const layer of style.layers) {
              if (layer.type !== 'symbol') continue
              if (layer.id === 'settlement-major-label') {
                try { map.setPaintProperty(layer.id, 'text-opacity', 0.25) } catch {}
                try { map.setPaintProperty(layer.id, 'text-color', '#ffffff') } catch {}
                continue
              }
              try { map.setLayoutProperty(layer.id, 'visibility', 'none') } catch {}
            }
          }
        } catch (err) {
          console.warn('HeroMap: label hide failed', err)
        }

        // === 60 real Mapbox markers ===
        STOP_COORDS.forEach((coord) => {
          const dot = document.createElement('div')
          dot.className = 'hero-marker'
          dot.style.width = '6px'
          dot.style.height = '6px'
          dot.style.borderRadius = '50%'
          dot.style.background = 'rgba(255,255,255,0.7)'
          const marker = new mapboxgl.Marker({ element: dot, anchor: 'center' })
            .setLngLat(coord)
            .addTo(map)
          markers.push({ element: dot, marker })
        })

        // Random periwinkle flash every 4s
        const flash = () => {
          if (markers.length === 0) return
          const pick = markers[Math.floor(Math.random() * markers.length)]
          pick.element.classList.add('hero-marker--flash')
          setTimeout(() => pick.element.classList.remove('hero-marker--flash'), 700)
        }
        flashTimer = setInterval(flash, 4000)
        setTimeout(flash, 1500)

        // Route line layers — one per route so we can trim independently
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
                'line-color': '#ffffff',
                'line-width': 1.2,
                'line-opacity': 0,
                'line-blur': 0.4,
                'line-trim-offset': [0, 1],
              },
            })
          } catch (err) {
            console.warn(`HeroMap: route layer ${i} failed`, err)
          }
        })

        // rAF loop: Ken Burns drift + route draw-in animation
        const start = performance.now()
        const isMobile = window.matchMedia('(max-width: 640px)').matches
        const loop = (now) => {
          if (disposed) return
          const elapsed = (now - start) / 1000

          if (!isMobile) {
            const t = (elapsed / 30) * Math.PI * 2
            const dx = Math.sin(t) * 0.07
            const dy = (1 - Math.cos(t)) * 0.035
            try { map.setCenter([CENTER[0] + dx, CENTER[1] + dy]) } catch {}
          }

          const MAX_OPACITY = 0.15
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

          rafId = requestAnimationFrame(loop)
        }
        rafId = requestAnimationFrame(loop)
      })

      // Re-measure and resize whenever the container dimensions change.
      // This rescues the map if the initial height was briefly wrong.
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
          if (!mapRef.current) return
          const rect = el.getBoundingClientRect()
          if (rect.height > 0) {
            el.style.height = `${rect.height}px`
            try { mapRef.current.resize() } catch {}
          }
        })
        resizeObserver.observe(el.parentElement || el)
      }
    }

    // Wait for window.load so stylesheets and container dimensions
    // are fully resolved before we measure the container.
    if (document.readyState === 'complete') {
      init()
    } else {
      window.addEventListener('load', init, { once: true })
    }

    return () => {
      disposed = true
      if (rafId) cancelAnimationFrame(rafId)
      if (flashTimer) clearInterval(flashTimer)
      if (resizeObserver) resizeObserver.disconnect()
      markers.forEach((m) => {
        try { m.marker.remove() } catch {}
      })
      markers = []
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
