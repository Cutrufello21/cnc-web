import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN

export default function ServiceMap({ onMapReady }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const [hotspots, setHotspots] = useState(null)

  // Fetch real delivery data
  useEffect(() => {
    fetch('/api/coverage-data')
      .then(r => r.json())
      .then(d => { if (d.hotspots) setHotspots(d.hotspots) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !mapboxgl.accessToken || !hotspots) return

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [-81.40, 40.75],
      zoom: 8.3,
      maxBounds: [[-82.3, 40.0], [-80.8, 41.5]],
      scrollZoom: false,
      attributionControl: false,
      pitchWithRotate: false,
      dragRotate: false,
      interactive: false,
      antialias: true,
    })

    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left')

    map.on('load', () => {
      // Heat map from real data
      map.addSource('delivery-heat', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: hotspots.map(h => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: h.coords },
            properties: { intensity: h.intensity, count: h.count },
          })),
        },
      })

      map.addLayer({
        id: 'heat',
        type: 'heatmap',
        source: 'delivery-heat',
        paint: {
          'heatmap-weight': ['get', 'intensity'],
          'heatmap-intensity': 2,
          'heatmap-radius': 50,
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(10,36,99,0)',
            0.15, 'rgba(96,165,250,0.1)',
            0.3, 'rgba(96,165,250,0.2)',
            0.5, 'rgba(96,165,250,0.35)',
            0.7, 'rgba(10,36,99,0.4)',
            0.85, 'rgba(10,36,99,0.55)',
            1, 'rgba(10,36,99,0.65)',
          ],
          'heatmap-opacity': 0.85,
        },
      })

      // No city labels — county cards handle that

      mapRef.current = map
      onMapReady?.(map)

      // Slow drift animation
      let driftIdx = 0
      const driftPoints = [
        { center: [-81.40, 40.75], zoom: 8.3, duration: 12000 },
        { center: [-81.55, 41.15], zoom: 9.0, duration: 14000 },
        { center: [-81.38, 40.80], zoom: 9.0, duration: 13000 },
        { center: [-81.09, 40.57], zoom: 9.2, duration: 14000 },
        { center: [-81.50, 41.05], zoom: 9.0, duration: 13000 },
        { center: [-81.40, 40.75], zoom: 8.3, duration: 12000 },
      ]
      function drift() {
        driftIdx = (driftIdx + 1) % driftPoints.length
        const pt = driftPoints[driftIdx]
        map.flyTo({ center: pt.center, zoom: pt.zoom, duration: pt.duration, easing: t => t })
      }
      const driftTimer = setInterval(drift, 14000)
      drift()
      map._driftTimer = driftTimer
    })

    mapRef.current = map
    return () => {
      if (map._driftTimer) clearInterval(map._driftTimer)
      map.remove()
      mapRef.current = null
    }
  }, [hotspots])

  return <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
}
