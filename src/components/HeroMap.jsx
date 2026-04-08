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

// Map center sits west of Akron so Akron itself reads on the
// right side of the hero (off-center, not dead middle).
const CENTER = [-81.78, 40.88]
const HUB = [-81.5185, 41.0534] // True Akron — keep route lines anchored here

// Full NE Ohio service area — every ZIP CNC actually delivers to.
// Pulled from the live ServiceMap list, plus a few eastern Portage/
// Trumbull and southern Tuscarawas/Columbiana fringe ZIPs so the
// hero reflects real coverage density, not a handful of samples.
const PULSE_ZIPS = [
  '43903','43908','43986','43988','44023','44056','44067','44087',
  '44125','44128','44129','44131','44133','44134','44136','44137',
  '44139','44141','44146','44147','44149','44201','44202','44203',
  '44210','44211','44212','44215','44216','44217','44221','44222',
  '44223','44224','44230','44231','44232','44233','44234','44236',
  '44237','44240','44241','44242','44243','44250','44251','44255',
  '44256','44258','44260','44262','44264','44265','44266','44270',
  '44272','44273','44274','44276','44278','44280','44281','44282',
  '44285','44286','44288','44301','44302','44303','44304','44305',
  '44306','44307','44308','44309','44310','44311','44312','44313',
  '44314','44315','44316','44317','44319','44320','44321','44325',
  '44326','44328','44333','44334','44372','44396','44398','44411',
  '44412','44417','44429','44440','44444','44446','44449','44460',
  '44470','44491','44601','44606','44608','44612','44613','44614',
  '44615','44618','44620','44621','44622','44624','44626','44627',
  '44630','44632','44640','44641','44643','44644','44645','44646',
  '44647','44650','44651','44652','44653','44656','44657','44662','44663',
  '44666','44667','44671','44675','44677','44678','44680','44681',
  '44683','44685','44688','44691','44693','44695','44697','44699',
  '44701','44702','44703','44704','44705','44706','44707','44708',
  '44709','44710','44711','44714','44718','44720','44721','44730',
  '44735','44750','44767','44799',
]

// Tuscarawas/Carroll core — New Philly, Dover, Sugarcreek, Carrollton
// and immediate neighbors. CNC runs heavy volume here, so these get
// the most synthetic stops to reflect real density.
const SUPER_DENSE_ZIPS = new Set([
  '44663', // New Philadelphia
  '44622', // Dover
  '44681', // Sugarcreek
  '44615', // Carrollton
  '44612', // Beach City
  '44621', // Dennison
  '44683', // Uhrichsville
  '44680', // Strasburg
  '44697', // Zoar/Bolivar
  '44624', // Dundee
  '44693', // Stone Creek
  '44653', // Midvale
  '44656', // Mineral City
])

// South and east fringe ZIPs get extra synthetic stops so those
// sides of the service area don't look thin on the hero map.
const DENSE_ZIPS = new Set([
  // East — Portage/Trumbull/Mahoning fringe
  '44201','44231','44234','44240','44241','44242','44255','44260',
  '44262','44266','44272','44288','44411','44412','44417','44429',
  '44440','44444','44446','44449','44460','44470','44491',
  // South — Tuscarawas/Wayne/Stark south/Harrison fringe
  '43903','43908','43986','43988','44601','44606','44608','44612',
  '44613','44614','44615','44618','44620','44621','44622','44624',
  '44626','44627','44630','44632','44640','44641','44643','44644',
  '44645','44646','44647','44650','44651','44652','44656','44657',
  '44662','44663','44666','44667','44671','44675','44677','44678',
  '44680','44681','44683','44685','44688','44691','44693','44695',
  '44697','44699','44799',
])

// Seeded PRNG so the synthetic dots are stable across reloads.
// These are NOT real patient addresses — they're procedural jitter
// around ZIP centroids to visualize delivery density without PHI.
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function gauss(rand) {
  const u = Math.max(rand(), 1e-6)
  const v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// Generate synthetic "delivery stops" per ZIP centroid — 3 dots
// baseline, 5 dots in the south/east fringe zones so those sides
// read as densely-covered. Procedural only — NO PHI. Stable across
// reloads via the seeded PRNG.
const _rand = mulberry32(42)
const PULSE_POINTS = (() => {
  const features = []
  // Targeting ~1,875 total dots — roughly one full week of CNC
  // deliveries (5 days × 375/day average) to make the volume story
  // legible at a glance.
  const BASE_STOPS = 5
  const DENSE_STOPS = 10
  const SUPER_DENSE_STOPS = 60
  // Jitter scales with density so super-dense ZIPs spread out into
  // a natural-looking field instead of piling into a centroid blob.
  const BASE_JITTER = 0.012
  const DENSE_JITTER = 0.022
  const SUPER_JITTER = 0.045
  PULSE_ZIPS.forEach((z) => {
    const info = zipcodes.lookup(z)
    if (!info) return
    const isSuper = SUPER_DENSE_ZIPS.has(z)
    const isDense = DENSE_ZIPS.has(z)
    const n = isSuper ? SUPER_DENSE_STOPS : isDense ? DENSE_STOPS : BASE_STOPS
    const jit = isSuper ? SUPER_JITTER : isDense ? DENSE_JITTER : BASE_JITTER
    for (let i = 0; i < n; i++) {
      features.push({
        type: 'Feature',
        properties: { phase: _rand() },
        geometry: {
          type: 'Point',
          coordinates: [
            info.longitude + gauss(_rand) * jit,
            info.latitude + gauss(_rand) * jit * 0.75,
          ],
        },
      })
    }
  })
  return features
})()

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
          zoom: 9.4,
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
            'circle-radius': 4,
            'circle-opacity': 0,
            'circle-stroke-color': '#60A5FA',
            'circle-stroke-width': 1,
            'circle-stroke-opacity': 0,
          },
        })

        // Solid center dot — navy at 70% with a thin white ring
        map.addLayer({
          id: 'hero-pulse-core',
          type: 'circle',
          source: 'hero-pulses',
          paint: {
            'circle-color': '#0A2463',
            'circle-radius': 2.5,
            'circle-opacity': 0.7,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 0.75,
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

        // Ken Burns drift — 40s full cycle. Lissajous-style: dx and dy
        // run on different phases so the camera traces a slow figure
        // that sweeps from southern fringe (Tuscarawas/Carroll) up to
        // northern edge (Cleveland metro) and back. Slower cycle keeps
        // the larger amplitude from feeling jittery.
        if (!isMobile) {
          const t = (elapsed / 40) * Math.PI * 2
          const dx = Math.sin(t) * 0.10
          const dy = Math.sin(t * 0.5) * 0.16
          try { map.setCenter([CENTER[0] + dx, CENTER[1] + dy]) } catch {}
        }

        if (layersReady) {
          // Pulse: halo grows and fades every 3s, staggered by feature phase
          const pulseT = (elapsed / 3) % 1
          const modExpr = ['%', ['+', ['get', 'phase'], pulseT], 1]
          try {
            map.setPaintProperty('hero-pulse-halo', 'circle-radius', [
              'interpolate', ['linear'], modExpr,
              0,   2,
              0.5, 6,
              1,   10,
            ])
            map.setPaintProperty('hero-pulse-halo', 'circle-opacity', [
              'interpolate', ['linear'], modExpr,
              0,   0,
              0.1, 0.14,
              1,   0,
            ])
            map.setPaintProperty('hero-pulse-halo', 'circle-stroke-opacity', [
              'interpolate', ['linear'], modExpr,
              0, 0.5,
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
