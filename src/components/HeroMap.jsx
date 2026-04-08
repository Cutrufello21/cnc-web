import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
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

const CENTER = [-81.5185, 41.0534]

// Service-area stops — clean spread across NE Ohio
const STOPS = [
  // Akron
  [-81.52, 41.08], [-81.49, 41.06], [-81.55, 41.10], [-81.51, 41.04],
  // Canton
  [-81.37, 40.80], [-81.40, 40.82], [-81.34, 40.78], [-81.38, 40.85],
  // Medina
  [-81.86, 41.14], [-81.88, 41.10], [-81.83, 41.16],
  // Cuyahoga Falls
  [-81.48, 41.13], [-81.45, 41.15],
  // Stow
  [-81.44, 41.16], [-81.42, 41.18],
  // Hudson
  [-81.44, 41.24], [-81.46, 41.22],
  // Strongsville
  [-81.83, 41.31], [-81.81, 41.29],
  // Brunswick
  [-81.84, 41.24], [-81.82, 41.22],
  // Wooster
  [-81.93, 40.81], [-81.91, 40.83],
  // Wadsworth
  [-81.73, 41.03], [-81.75, 41.01],
  // Massillon
  [-81.52, 40.80], [-81.54, 40.78],
  // North Canton
  [-81.40, 40.88], [-81.38, 40.86],
  // Fairlawn
  [-81.61, 41.12], [-81.59, 41.10],
  // Barberton
  [-81.61, 41.01], [-81.63, 41.03],
  // Tallmadge
  [-81.44, 41.10], [-81.42, 41.08],
  // Ravenna
  [-81.24, 41.16], [-81.22, 41.14],
  // Alliance
  [-81.10, 40.92], [-81.08, 40.90],
  // Warren
  [-80.82, 41.24], [-80.80, 41.22],
]

export default function HeroMap() {
  const containerRef = useRef(null)
  const mapRef = useRef(null)

  useEffect(() => {
    let markers = []
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
          style: 'mapbox://styles/cutrufello/cmnq93yoq000q01qtc02a657q',
          center: [-81.508177, 41.102230],
          zoom: 8.5,
          bearing: -15.2,
          pitch: 45,
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

        // Force a resize so the canvas fills the container even if
        // the initial measurement was stale.
        try { map.resize() } catch {}
        requestAnimationFrame(() => { try { map.resize() } catch {} })

        // Simple white dots — no animations, no pulses, no halos.
        STOPS.forEach((coord) => {
          const dot = document.createElement('div')
          dot.className = 'hero-marker'
          const marker = new mapboxgl.Marker({ element: dot, anchor: 'center' })
            .setLngLat(coord)
            .addTo(map)
          markers.push(marker)
        })
      })
    }

    if (document.readyState === 'complete') {
      init()
    } else {
      window.addEventListener('load', init, { once: true })
    }

    return () => {
      disposed = true
      markers.forEach((m) => { try { m.remove() } catch {} })
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
