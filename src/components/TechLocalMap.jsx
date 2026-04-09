import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import routesData from './techLocalRoutes.json'
import './TechLocalMap.css'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN

/* Dispatch Portal "Local Expertise" slide.
   Dark NE Ohio map with 12 cars driving real road-snapped loops across
   every major city we serve — Akron, Canton, Wooster, New Philadelphia,
   Massillon, Kent, Hudson, Stow, Dover, Alliance, Cuyahoga Falls,
   Barberton. Cars rotate to heading, animate at ~60fps via
   requestAnimationFrame, and loop independently so the scene reads as a
   live snapshot of the fleet rather than a synchronized loop.

   Routes are pre-generated once via scripts/generate-tech-local-routes.mjs
   (Mapbox Directions API) and committed as techLocalRoutes.json, so this
   component makes zero runtime API calls.

   Deferred mount via IntersectionObserver — Mapbox only initializes once
   the Dispatch card is actually on screen, and the animation pauses when
   the tab is hidden or the slide scrolls off. */

// --- Geometry helpers ------------------------------------------------------
// Haversine distance in meters between two [lng, lat] points.
function haversine(a, b) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLng = toRad(b[0] - a[0])
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
}

// Precompute cumulative segment lengths so we can look up a point along
// the polyline in O(log n) per frame.
function prepRoute(coords) {
  const segs = []
  let total = 0
  for (let i = 0; i < coords.length - 1; i++) {
    const len = haversine(coords[i], coords[i + 1])
    segs.push({ from: coords[i], to: coords[i + 1], len, cumStart: total })
    total += len
  }
  return { segs, total }
}

// Given a distance along the route, return interpolated [lng, lat] + bearing.
function pointAt(route, dist) {
  const { segs, total } = route
  let d = ((dist % total) + total) % total
  // Binary search for the segment containing d.
  let lo = 0
  let hi = segs.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (segs[mid].cumStart + segs[mid].len <= d) lo = mid + 1
    else hi = mid
  }
  const s = segs[lo]
  const t = s.len === 0 ? 0 : (d - s.cumStart) / s.len
  const lng = s.from[0] + (s.to[0] - s.from[0]) * t
  const lat = s.from[1] + (s.to[1] - s.from[1]) * t
  // Bearing in degrees, 0 = north, clockwise.
  const dx = s.to[0] - s.from[0]
  const dy = s.to[1] - s.from[1]
  const bearing = (Math.atan2(dx, dy) * 180) / Math.PI
  return { lng, lat, bearing }
}

// --- Component -------------------------------------------------------------
export default function TechLocalMap() {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const rafRef = useRef(null)
  const carsRef = useRef([])
  const runningRef = useRef(false)
  const [ready, setReady] = useState(false)

  // Defer map init until the slide's card is on screen.
  useEffect(() => {
    if (!containerRef.current) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setReady(true)
          obs.disconnect()
        }
      },
      { threshold: 0.1 }
    )
    obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!ready || mapRef.current || !mapboxgl.accessToken) return
    if (!containerRef.current) return

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-81.55, 40.88],
      zoom: 7.6,
      interactive: false,
      attributionControl: false,
    })

    map.on('load', () => {
      // One car per city. Each car drives its own road-snapped loop
      // around the city it belongs to, so no two cars ever come close.
      const cars = routesData.map((r) => {
        const route = prepRoute(r.coordinates)
        const el = document.createElement('div')
        el.className = 'tech-car'
        // Mapbox owns the outer element's transform for positioning,
        // so SVG rotation lives on an inner wrapper.
        const inner = document.createElement('div')
        inner.className = 'tech-car__inner'
        inner.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M7 1 L12.2 12 L7 9.2 L1.8 12 Z"
                  fill="#60A5FA"
                  stroke="#F5F8FF"
                  stroke-width="0.9"
                  stroke-linejoin="round"/>
          </svg>
        `
        el.appendChild(inner)
        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat(r.coordinates[0])
          .addTo(map)

        // Lap time 20–32s across all routes — apparent pixel speed
        // stays consistent even though route lengths vary slightly.
        const loopSeconds = 20 + Math.random() * 12
        return {
          route,
          marker,
          el,
          inner,
          speed: route.total / loopSeconds,
          dist: Math.random() * route.total, // desync start positions
        }
      })
      carsRef.current = cars

      // Animation loop.
      let last = performance.now()
      const tick = (now) => {
        if (!runningRef.current) {
          rafRef.current = null
          return
        }
        const dt = Math.min(0.05, (now - last) / 1000)
        last = now
        for (const car of carsRef.current) {
          car.dist += car.speed * dt
          const p = pointAt(car.route, car.dist)
          car.marker.setLngLat([p.lng, p.lat])
          car.inner.style.transform = `rotate(${p.bearing}deg)`
        }
        rafRef.current = requestAnimationFrame(tick)
      }

      // Start the loop when the slide is visible, pause when it isn't.
      const start = () => {
        if (runningRef.current) return
        runningRef.current = true
        last = performance.now()
        rafRef.current = requestAnimationFrame(tick)
      }
      const stop = () => {
        runningRef.current = false
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }

      // Pause when the tab is hidden.
      const onVis = () => {
        if (document.visibilityState === 'hidden') stop()
        else start()
      }
      document.addEventListener('visibilitychange', onVis)

      // Pause when the map itself scrolls off screen.
      const runObs = new IntersectionObserver(
        ([entry]) => (entry.isIntersecting ? start() : stop()),
        { threshold: 0 }
      )
      runObs.observe(containerRef.current)

      start()

      // Stash cleanup on the map so the outer effect can reach it.
      map.__techLocalCleanup = () => {
        stop()
        document.removeEventListener('visibilitychange', onVis)
        runObs.disconnect()
      }
    })

    mapRef.current = map
    return () => {
      if (map.__techLocalCleanup) map.__techLocalCleanup()
      map.remove()
      mapRef.current = null
      carsRef.current = []
    }
  }, [ready])

  return (
    <div className="tech-map">
      <div className="tech-map__canvas" ref={containerRef} />
      <div className="tech-map__legend">
        <span className="tech-map__legend-dot" />
        <span>Every ZIP, every day · since 2007</span>
      </div>
    </div>
  )
}
