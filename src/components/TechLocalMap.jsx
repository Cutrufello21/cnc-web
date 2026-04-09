import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import './TechLocalMap.css'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN

/* Dark dispatch-coverage map for the Dispatch Portal carousel slide.
   Heatmap layer over 20+ NE Ohio cities creates a "coverage blob"
   across Summit / Stark / Portage / Tuscarawas counties. Labeled
   pulsing markers at four key cities anchor the geography for
   visitors who may not know the area.

   Defer-mounted via IntersectionObserver — Mapbox only initializes
   when the Dispatch card is actually on screen, so it doesn't
   compete with the ServiceArea map above it on the homepage. */

// Heatmap source points — enough density to render as a blob at
// the target zoom level. Lat/lng from public records.
const HEAT_POINTS = [
  [-81.5190, 41.0814], // Akron
  [-81.3784, 40.7989], // Canton
  [-81.9351, 40.8051], // Wooster
  [-81.4457, 40.4898], // New Philadelphia
  [-81.5215, 40.7967], // Massillon
  [-81.3579, 41.1537], // Kent
  [-81.4404, 41.1595], // Stow
  [-81.4846, 41.1339], // Cuyahoga Falls
  [-81.6068, 41.0142], // Barberton
  [-81.4742, 40.5201], // Dover
  [-81.1057, 40.9123], // Alliance
  [-81.2412, 41.1573], // Ravenna
  [-81.4854, 40.9462], // Green
  [-81.4418, 41.1014], // Tallmadge
  [-81.7646, 40.8429], // Orrville
  [-81.4404, 41.2401], // Hudson
  [-81.3454, 41.3170], // Aurora
  [-81.2595, 40.8375], // Louisville
  [-81.5185, 40.9287], // Uniontown
  [-81.6068, 40.9567], // Norton
  [-81.3333, 40.7486], // Perry Heights
  [-81.1998, 40.9342], // Minerva
  [-81.6537, 40.8828], // Rittman
  [-81.3340, 40.6495], // East Sparta
  [-81.5215, 40.6584], // Beach City
  [-81.1798, 40.8923], // Paris
]

// Anchor markers with labels — the cities a visitor is most likely
// to recognize.
const MARKERS = [
  { lng: -81.5190, lat: 41.0814, label: 'Akron' },
  { lng: -81.3784, lat: 40.7989, label: 'Canton' },
  { lng: -81.9351, lat: 40.8051, label: 'Wooster' },
  { lng: -81.4457, lat: 40.4898, label: 'New Philadelphia' },
]

export default function TechLocalMap() {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const [ready, setReady] = useState(false)

  // Defer init until the slide's containing card is on screen.
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
      // Heatmap source
      map.addSource('coverage', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: HEAT_POINTS.map((coords) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: coords },
            properties: { weight: 1 },
          })),
        },
      })

      map.addLayer({
        id: 'coverage-heat',
        type: 'heatmap',
        source: 'coverage',
        paint: {
          'heatmap-weight': 1,
          'heatmap-intensity': 1.2,
          'heatmap-radius': [
            'interpolate', ['linear'], ['zoom'],
            6, 30,
            9, 70,
          ],
          'heatmap-opacity': 0.9,
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0,   'rgba(10, 36, 99, 0)',
            0.2, 'rgba(30, 64, 175, 0.45)',
            0.45,'rgba(59, 130, 246, 0.65)',
            0.7, 'rgba(96, 165, 250, 0.85)',
            1,   'rgba(147, 197, 253, 1)',
          ],
        },
      })

      // Labeled pulse markers on top of the heatmap
      for (const m of MARKERS) {
        const el = document.createElement('div')
        el.className = 'tech-map-marker'
        el.innerHTML = `
          <span class="tech-map-marker__pulse"></span>
          <span class="tech-map-marker__dot"></span>
          <span class="tech-map-marker__label">${m.label}</span>
        `
        new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([m.lng, m.lat])
          .addTo(map)
      }
    })

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
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
