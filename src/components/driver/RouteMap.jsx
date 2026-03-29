import { useEffect, useState, useRef, useCallback } from 'react'
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

// In-memory geocode cache
const geocodeCache = new Map()

async function geocodeAddress(address, city, zip) {
  const query = `${address}, ${city}, OH ${zip}`
  if (geocodeCache.has(query)) return geocodeCache.get(query)

  try {
    const params = new URLSearchParams({
      q: query, format: 'json', limit: '1', countrycodes: 'us',
    })
    const resp = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { 'User-Agent': 'CNCDeliveryApp/1.0' },
    })
    const data = await resp.json()
    if (data && data.length > 0) {
      const result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
      geocodeCache.set(query, result)
      return result
    }
  } catch (err) {
    console.warn('Geocode failed for:', query, err)
  }

  // Fall back to ZIP centroid
  const fallback = ZIP_COORDS[zip]
  if (fallback) {
    const result = { lat: fallback[0], lng: fallback[1] }
    geocodeCache.set(query, result)
    return result
  }
  return null
}

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

export default function RouteMap({ stops, mode, onReorder }) {
  const [collapsed, setCollapsed] = useState(false)
  const [routeCoords, setRouteCoords] = useState(null)
  const [routeStats, setRouteStats] = useState(null)
  const [routeError, setRouteError] = useState(false)
  const [currentPos, setCurrentPos] = useState(null)
  const [geocoding, setGeocoding] = useState(false)
  const [points, setPoints] = useState([])
  const [dragIdx, setDragIdx] = useState(null)
  const [dragOverIdx, setDragOverIdx] = useState(null)
  const watchRef = useRef(null)

  // Geocode stops
  useEffect(() => {
    if (!stops || stops.length < 2) { setPoints([]); return }
    let cancelled = false
    const pending = stops.filter(s => s.status !== 'delivered' && s.status !== 'failed')

    async function resolve() {
      setGeocoding(true)
      for (let i = 0; i < pending.length; i++) {
        const s = pending[i]
        const query = `${s.Address || ''}, ${s.City || ''}, OH ${s.ZIP || ''}`
        if (!geocodeCache.has(query)) {
          await geocodeAddress(s.Address || '', s.City || '', s.ZIP || '')
          if (cancelled) return
          if (i < pending.length - 1) await new Promise(r => setTimeout(r, 1100))
        }
      }
      const results = []
      for (let i = 0; i < pending.length; i++) {
        const s = pending[i]
        const coords = await geocodeAddress(s.Address || '', s.City || '', s.ZIP || '')
        if (cancelled) return
        if (coords) {
          results.push({
            lat: coords.lat, lng: coords.lng, label: i + 1,
            name: s.Name || s['Name'] || '',
            address: s.Address || '', city: s.City || '', zip: s.ZIP || '',
            _coldChain: s._coldChain, _packageCount: s._packageCount || 1,
            _stopRef: s,
          })
        }
      }
      if (!cancelled) { setPoints(results); setGeocoding(false) }
    }
    resolve()
    return () => { cancelled = true }
  }, [stops])

  // Fetch OSRM route
  useEffect(() => {
    if (points.length < 2) { setRouteCoords(null); setRouteStats(null); return }
    async function fetchRoute() {
      try {
        const waypoints = [...points]
        if (mode === 'roundtrip') waypoints.push(waypoints[0])
        const coordStr = waypoints.map(p => `${p.lng},${p.lat}`).join(';')
        const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`
        const resp = await fetch(url)
        const data = await resp.json()
        if (data.code === 'Ok' && data.routes?.length > 0) {
          const route = data.routes[0]
          setRouteCoords(route.geometry.coordinates.map(c => [c[1], c[0]]))
          setRouteStats({
            distance: (route.distance / 1609.344).toFixed(1),
            duration: Math.round(route.duration / 60),
          })
          setRouteError(false)
        } else throw new Error('No routes')
      } catch (err) {
        console.warn('OSRM route failed:', err)
        setRouteError(true); setRouteCoords(null); setRouteStats(null)
      }
    }
    fetchRoute()
  }, [points, mode])

  // Watch current position
  useEffect(() => {
    if (!navigator.geolocation) return
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => setCurrentPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    )
    return () => { if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current) }
  }, [])

  // Drag-and-drop reorder
  function handleDragStart(e, idx) {
    setDragIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
  }
  function handleDragOver(e, idx) {
    e.preventDefault()
    setDragOverIdx(idx)
  }
  function handleDrop(e, idx) {
    e.preventDefault()
    if (dragIdx == null || dragIdx === idx) { setDragIdx(null); setDragOverIdx(null); return }
    // Reorder points
    const newPoints = [...points]
    const [moved] = newPoints.splice(dragIdx, 1)
    newPoints.splice(idx, 0, moved)
    // Re-label
    const relabeled = newPoints.map((p, i) => ({ ...p, label: i + 1 }))
    setPoints(relabeled)
    setDragIdx(null)
    setDragOverIdx(null)
    // Notify parent of new stop order
    if (onReorder) {
      onReorder(relabeled.map(p => p._stopRef))
    }
  }
  function handleDragEnd() { setDragIdx(null); setDragOverIdx(null) }

  if (points.length < 2 && !geocoding) return null
  if (points.length < 2 && geocoding) {
    return (
      <div className="route-map">
        <div className="route-map__header">
          <span className="route-map__title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
            Loading route map…
          </span>
        </div>
      </div>
    )
  }

  function buildNavUrl() {
    const navStops = [...points]
    if (mode === 'roundtrip') navStops.push(navStops[0])
    const parts = navStops.map(s => {
      const addr = (s.address || '').replace(/\s+/g, '+')
      const city = (s.city || '').replace(/\s+/g, '+')
      return `${addr},+${city},+OH+${s.zip || ''}`
    })
    return `https://www.google.com/maps/dir/${parts.join('/')}`
  }

  const fallbackCoords = (() => {
    const coords = points.map(p => [p.lat, p.lng])
    if (mode === 'roundtrip') coords.push(coords[0])
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
          Route Planner — {points.length} stops
        </span>
        <svg className={`route-map__chevron ${collapsed ? '' : 'route-map__chevron--open'}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      {!collapsed && (
        <div className="route-map__body">
          {/* Navigate button */}
          <a href={buildNavUrl()} target="_blank" rel="noopener noreferrer" className="route-map__navigate-btn">
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
              <div className="route-map__stat">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg>
                <span>{points.length} stops</span>
              </div>
            </div>
          )}

          {routeError && (
            <div className="route-map__fallback-notice">
              Routing unavailable — showing straight-line path
            </div>
          )}

          {/* Layout: stop list + map */}
          <div className="route-map__planner">
            {/* Draggable stop list */}
            <div className="route-map__stop-list">
              <div className="route-map__list-header">
                <span>Stop Order</span>
                <span className="route-map__list-hint">Drag to reorder</span>
              </div>
              {points.map((p, i) => (
                <div
                  key={`${p.address}-${p.zip}-${i}`}
                  className={`route-map__stop-item ${dragOverIdx === i ? 'route-map__stop-item--dragover' : ''} ${dragIdx === i ? 'route-map__stop-item--dragging' : ''}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, i)}
                  onDragOver={(e) => handleDragOver(e, i)}
                  onDrop={(e) => handleDrop(e, i)}
                  onDragEnd={handleDragEnd}
                >
                  <span className="route-map__stop-grip">⠿</span>
                  <span
                    className="route-map__stop-num"
                    style={{
                      background: i === 0 ? '#0A2463' : (i === points.length - 1 && mode === 'oneway') ? '#dc4a4a' : '#3b82f6',
                    }}
                  >
                    {p.label}
                  </span>
                  <div className="route-map__stop-info">
                    <span className="route-map__stop-name">{p.name || 'Unknown'}</span>
                    <span className="route-map__stop-addr">{p.address}{p.city ? `, ${p.city}` : ''}</span>
                  </div>
                  {p._coldChain && <span className="route-map__stop-badge">CC</span>}
                  {p._packageCount > 1 && <span className="route-map__stop-pkgs">{p._packageCount}x</span>}
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.address}, ${p.city}, OH ${p.zip}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="route-map__stop-nav"
                    onClick={(e) => e.stopPropagation()}
                    title="Navigate to this stop"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="3 11 22 2 13 21 11 13 3 11"/>
                    </svg>
                  </a>
                </div>
              ))}
            </div>

            {/* Map */}
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

                {routeCoords ? (
                  <Polyline positions={routeCoords} color="#3b82f6" weight={4} opacity={0.8} />
                ) : (
                  <Polyline positions={fallbackCoords} color="#3b82f6" weight={3} opacity={0.5} dashArray="8 6" />
                )}

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

                {currentPos && (
                  <Marker position={[currentPos.lat, currentPos.lng]} icon={createCurrentPosIcon()}>
                    <Popup>Your location</Popup>
                  </Marker>
                )}
              </MapContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
