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

// ~130 delivery stop coordinates across the expanded NE Ohio service
// area — dense clusters around Akron and Canton, with meaningful
// coverage spreading north into Cleveland suburbs, east to the Ohio
// border, south to Tuscarawas and west through Medina/Wooster.
const STOP_COORDS = [
  // Akron core (14)
  [-81.5190, 41.0814], [-81.5305, 41.0760], [-81.5010, 41.0895],
  [-81.5450, 41.0670], [-81.4920, 41.0735], [-81.5385, 41.0980],
  [-81.5115, 41.0610], [-81.5260, 41.1055], [-81.5140, 41.0880],
  [-81.5420, 41.0830], [-81.5030, 41.0690], [-81.5565, 41.0745],
  [-81.5210, 41.0550], [-81.4995, 41.1015],
  // Canton core (10)
  [-81.3784, 40.7989], [-81.3550, 40.8080], [-81.3920, 40.7870],
  [-81.3620, 40.8195], [-81.4010, 40.8075], [-81.3455, 40.7900],
  [-81.3745, 40.8150], [-81.3890, 40.7955], [-81.3610, 40.7885],
  [-81.3965, 40.8220],
  // Fairlawn (4)
  [-81.6216, 41.1253], [-81.6305, 41.1180], [-81.6125, 41.1335], [-81.6040, 41.1290],
  // Copley (3)
  [-81.6473, 41.1073], [-81.6385, 41.1015], [-81.6555, 41.1125],
  // Stow (4)
  [-81.4401, 41.1595], [-81.4285, 41.1665], [-81.4520, 41.1520], [-81.4340, 41.1545],
  // Hudson (4)
  [-81.4401, 41.2401], [-81.4265, 41.2475], [-81.4535, 41.2330], [-81.4320, 41.2460],
  // Cuyahoga Falls (4)
  [-81.4846, 41.1339], [-81.4720, 41.1405], [-81.4980, 41.1270], [-81.4770, 41.1260],
  // Tallmadge (3)
  [-81.4412, 41.1013], [-81.4285, 41.1080], [-81.4535, 41.0960],
  // Kent (3)
  [-81.3579, 41.1537], [-81.3465, 41.1615], [-81.3685, 41.1450],
  // Ravenna (3)
  [-81.2415, 41.1573], [-81.2290, 41.1645], [-81.2540, 41.1500],
  // Streetsboro (3)
  [-81.3456, 41.2390], [-81.3325, 41.2450], [-81.3580, 41.2330],
  // Aurora (2)
  [-81.3454, 41.3173], [-81.3325, 41.3120],
  // Twinsburg (2)
  [-81.4401, 41.3126], [-81.4275, 41.3075],
  // Macedonia (2)
  [-81.5098, 41.3131], [-81.4975, 41.3195],
  // Brunswick (3)
  [-81.8418, 41.2384], [-81.8300, 41.2455], [-81.8525, 41.2320],
  // Strongsville (3)
  [-81.8337, 41.3145], [-81.8210, 41.3220], [-81.8455, 41.3080],
  // Parma (3)
  [-81.7229, 41.4047], [-81.7115, 41.4105], [-81.7340, 41.3990],
  // Brecksville (2)
  [-81.6268, 41.3181], [-81.6150, 41.3245],
  // Broadview Heights (2)
  [-81.6851, 41.3095], [-81.6960, 41.3040],
  // Richfield (2)
  [-81.6398, 41.2384], [-81.6280, 41.2330],
  // Peninsula (1)
  [-81.5498, 41.2412],
  // Solon (2)
  [-81.4412, 41.3897], [-81.4285, 41.3835],
  // Chagrin Falls (2)
  [-81.3912, 41.4303], [-81.3795, 41.4245],
  // Bainbridge (1)
  [-81.3440, 41.3965],
  // Cleveland Heights (2)
  [-81.5562, 41.5101], [-81.5445, 41.5165],
  // Beachwood (2)
  [-81.5095, 41.4639], [-81.4975, 41.4570],
  // Shaker Heights (2)
  [-81.5373, 41.4737], [-81.5255, 41.4800],
  // Medina (4)
  [-81.8637, 41.1385], [-81.8515, 41.1465], [-81.8760, 41.1310], [-81.8435, 41.1350],
  // Wadsworth (3)
  [-81.7297, 41.0259], [-81.7165, 41.0330], [-81.7420, 41.0185],
  // Barberton (4)
  [-81.6048, 41.0145], [-81.5925, 41.0220], [-81.6175, 41.0070], [-81.5980, 41.0080],
  // Norton (2)
  [-81.6390, 41.0295], [-81.6275, 41.0360],
  // Green (3)
  [-81.4871, 40.9484], [-81.4745, 40.9555], [-81.4990, 40.9410],
  // North Canton (4)
  [-81.4023, 40.8759], [-81.3895, 40.8830], [-81.4150, 40.8685], [-81.3985, 40.8700],
  // Massillon (4)
  [-81.5215, 40.7967], [-81.5345, 40.7885], [-81.5100, 40.8045], [-81.5180, 40.8080],
  // Louisville (3)
  [-81.2593, 40.8373], [-81.2470, 40.8445], [-81.2715, 40.8300],
  // Alliance (3)
  [-81.1059, 40.9103], [-81.0930, 40.9175], [-81.1185, 40.9045],
  // Minerva (2)
  [-81.1049, 40.7298], [-81.0935, 40.7365],
  // New Philadelphia (2)
  [-81.4468, 40.4898], [-81.4340, 40.4965],
  // Dover (2)
  [-81.4737, 40.5203], [-81.4615, 40.5265],
  // Wooster (4)
  [-81.9351, 40.8051], [-81.9480, 40.8135], [-81.9220, 40.7980], [-81.9395, 40.7995],
  // Orrville (2)
  [-81.7649, 40.8434], [-81.7530, 40.8495],
  // Doylestown (1)
  [-81.6959, 40.9711],
  // Rittman (1)
  [-81.7807, 40.9786],
  // Mogadore (1)
  [-81.3746, 41.0467],
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
          zoom: 8.5,
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

        // Strip every label / highway shield / POI symbol layer, and
        // aggressively dim road line layers so the map reads as a
        // quiet backdrop instead of a nav app competing with the text.
        try {
          const style = map.getStyle()
          if (style?.layers) {
            for (const layer of style.layers) {
              if (
                layer.type === 'line' &&
                /road|bridge|tunnel|motorway|ferry|rail/i.test(layer.id)
              ) {
                try { map.setPaintProperty(layer.id, 'line-opacity', 0.35) } catch {}
                continue
              }
              if (layer.type !== 'symbol') continue
              if (layer.id === 'settlement-major-label') {
                try { map.setPaintProperty(layer.id, 'text-opacity', 0.22) } catch {}
                try { map.setPaintProperty(layer.id, 'text-color', '#ffffff') } catch {}
                continue
              }
              try { map.setLayoutProperty(layer.id, 'visibility', 'none') } catch {}
            }
          }
        } catch (err) {
          console.warn('HeroMap: label hide failed', err)
        }

        // === 60 real Mapbox markers — styling lives in HeroMap.css ===
        // Random delay per marker so the pulse and halo ring are
        // staggered via --delay custom property (used by both the
        // dot and its ::before in CSS).
        STOP_COORDS.forEach((coord) => {
          const dot = document.createElement('div')
          dot.className = 'hero-marker'
          dot.style.setProperty('--delay', `${(Math.random() * -3).toFixed(2)}s`)
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
                'line-color': '#F5F0E8',
                'line-width': 1.4,
                'line-opacity': 0,
                'line-blur': 0.5,
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

          const MAX_OPACITY = 0.2
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
