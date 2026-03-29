import { useEffect, useState, useRef, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import ZIP_COORDS from '../../lib/zipCoords.js'
import './RouteMap.css'

// Fix default marker icon issue in leaflet
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

function createNumberedIcon(number, isFirst, isLast, mode) {
  const bg = isFirst ? '#0A2463' : (isLast && mode === 'oneway') ? '#dc4a4a' : '#3b82f6'
  const size = isFirst || isLast ? 30 : 26
  return L.divIcon({
    className: 'route-map__marker-icon',
    html: `<div class="route-map__marker-circle" style="background:${bg};width:${size}px;height:${size}px;font-size:${isFirst || isLast ? 13 : 11}px">${number}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  })
}

function createCurrentPosIcon() {
  return L.divIcon({
    className: 'route-map__current-pos',
    html: '<div class="route-map__pulse-dot"><div class="route-map__pulse-ring"></div></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })
}

// Component to auto-fit map bounds
function FitBounds({ points }) {
  const map = useMap()
  useEffect(() => {
    if (points.length > 0) {
      const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]))
      map.fitBounds(bounds, { padding: [40, 40] })
    }
  }, [points, map])
  return null
}

export default function RouteMap({ stops, mode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [routeCoords, setRouteCoords] = useState(null)
  const [routeStats, setRouteStats] = useState(null)
  const [routeError, setRouteError] = useState(false)
  const [currentPos, setCurrentPos] = useState(null)
  const watchRef = useRef(null)

  // Geocode stops using ZIP_COORDS
  const points = useMemo(() => {
    if (!stops || stops.length < 2) return []
    return stops
      .filter(s => s.status !== 'delivered' && s.status !== 'failed')
      .map((s, i) => {
        const zip = s.ZIP || ''
        const coords = ZIP_COORDS[zip]
        if (!coords) return null
        return {
          lat: coords[0],
          lng: coords[1],
          label: i + 1,
          name: s.Name || s['Name'] || '',
          address: s.Address || '',
          city: s.City || '',
          zip: s.ZIP || '',
        }
      })
      .filter(Boolean)
  }, [stops])

  // Fetch OSRM route
  useEffect(() => {
    if (points.length < 2) {
      setRouteCoords(null)
      setRouteStats(null)
      return
    }

    async function fetchRoute() {
      try {
        const waypoints = [...points]
        if (mode === 'roundtrip') {
          waypoints.push(waypoints[0])
        }
        const coordStr = waypoints.map(p => `${p.lng},${p.lat}`).join(';')
        const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`
        const resp = await fetch(url)
        const data = await resp.json()

        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
          const route = data.routes[0]
          // GeoJSON coords are [lng, lat], Leaflet needs [lat, lng]
          const coords = route.geometry.coordinates.map(c => [c[1], c[0]])
          setRouteCoords(coords)
          setRouteStats({
            distance: (route.distance / 1609.344).toFixed(1), // meters to miles
            duration: Math.round(route.duration / 60), // seconds to minutes
          })
          setRouteError(false)
        } else {
          throw new Error('OSRM returned no routes')
        }
      } catch (err) {
        console.warn('OSRM route fetch failed, using straight-line fallback:', err)
        setRouteError(true)
        setRouteCoords(null)
        setRouteStats(null)
      }
    }

    fetchRoute()
  }, [points, mode])

  // Watch driver's current position
  useEffect(() => {
    if (!navigator.geolocation) return
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setCurrentPos({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      },
      () => {}, // silently ignore errors
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    )
    return () => {
      if (watchRef.current != null) {
        navigator.geolocation.clearWatch(watchRef.current)
      }
    }
  }, [])

  if (points.length < 2) return null

  // Build Google Maps navigation URL
  function buildNavUrl() {
    const navStops = [...points]
    if (mode === 'roundtrip') {
      navStops.push(navStops[0])
    }
    const parts = navStops.map(s => {
      const addr = (s.address || '').replace(/\s+/g, '+')
      const city = (s.city || '').replace(/\s+/g, '+')
      const zip = s.zip || ''
      return `${addr},+${city},+OH+${zip}`
    })
    return `https://www.google.com/maps/dir/${parts.join('/')}`
  }

  // Straight-line fallback polyline
  const fallbackCoords = (() => {
    const coords = points.map(p => [p.lat, p.lng])
    if (mode === 'roundtrip') {
      coords.push(coords[0])
    }
    return coords
  })()

  const durationHrs = routeStats ? Math.floor(routeStats.duration / 60) : 0
  const durationMins = routeStats ? routeStats.duration % 60 : 0

  return (
    <div className="route-map">
      <div className="route-map__header" onClick={() => setCollapsed(!collapsed)}>
        <span className="route-map__title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
          </svg>
          Route Map — {points.length} stops
        </span>
        <svg className={`route-map__chevron ${collapsed ? '' : 'route-map__chevron--open'}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      {!collapsed && (
        <div className="route-map__body">
          {/* Navigate button */}
          <a
            href={buildNavUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="route-map__navigate-btn"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="3 11 22 2 13 21 11 13 3 11"/>
            </svg>
            Navigate All Stops
          </a>

          {/* Stats bar */}
          {routeStats && (
            <div className="route-map__stats">
              <div className="route-map__stat">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M2 12h20"/></svg>
                <span>{routeStats.distance} mi</span>
              </div>
              <div className="route-map__stat">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <span>{durationHrs > 0 ? `${durationHrs}h ` : ''}{durationMins}min</span>
              </div>
            </div>
          )}

          {routeError && (
            <div className="route-map__fallback-notice">
              Routing unavailable — showing straight-line path
            </div>
          )}

          {/* Leaflet Map */}
          <div className="route-map__container">
            <MapContainer
              center={[points[0].lat, points[0].lng]}
              zoom={11}
              scrollWheelZoom={false}
              className="route-map__leaflet"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <FitBounds points={points} />

              {/* Route polyline */}
              {routeCoords ? (
                <Polyline positions={routeCoords} color="#3b82f6" weight={4} opacity={0.8} />
              ) : (
                <Polyline
                  positions={fallbackCoords}
                  color="#3b82f6"
                  weight={3}
                  opacity={0.5}
                  dashArray="8 6"
                />
              )}

              {/* Stop markers */}
              {points.map((p, i) => (
                <Marker
                  key={i}
                  position={[p.lat, p.lng]}
                  icon={createNumberedIcon(p.label, i === 0, i === points.length - 1, mode)}
                >
                  <Popup>
                    <div className="route-map__popup">
                      <strong>Stop {p.label}</strong>
                      <div>{p.name}</div>
                      <div className="route-map__popup-addr">{p.address}</div>
                      {p.city && <div className="route-map__popup-addr">{p.city}, OH {p.zip}</div>}
                    </div>
                  </Popup>
                </Marker>
              ))}

              {/* Current position */}
              {currentPos && (
                <Marker
                  position={[currentPos.lat, currentPos.lng]}
                  icon={createCurrentPosIcon()}
                >
                  <Popup>Your location</Popup>
                </Marker>
              )}
            </MapContainer>
          </div>
        </div>
      )}
    </div>
  )
}
