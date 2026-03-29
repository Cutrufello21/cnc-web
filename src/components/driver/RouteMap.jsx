import { useEffect, useState, useRef } from 'react'
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

// Pharmacy start locations
const PHARMACY_ORIGINS = {
  SHSP: { lat: 41.0758, lng: -81.5193, label: 'SHSP — 70 Arch St, Akron' },
  Aultman: { lat: 40.7914, lng: -81.3939, label: 'Aultman — 2600 6th St SW, Canton' },
}

// In-memory geocode cache (session-level, backed by Supabase persistent cache)
const geocodeCache = new Map()

// Batch geocode via /api/geocode (Census Bureau + Supabase cache)
async function batchGeocode(addresses) {
  // Filter out already-cached
  const uncached = addresses.filter(a => {
    const key = `${a.address}|${a.city}|${a.zip}`
    return !geocodeCache.has(key)
  })

  if (uncached.length > 0) {
    try {
      const resp = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addresses: uncached }),
      })
      const data = await resp.json()
      if (data.results) {
        for (const r of data.results) {
          if (r.lat != null && r.lng != null) {
            const key = `${r.address}|${r.city}|${r.zip}`
            geocodeCache.set(key, { lat: r.lat, lng: r.lng })
          }
        }
      }
    } catch (err) {
      console.warn('Batch geocode failed:', err)
    }
  }

  // Return results from cache (including freshly cached), ZIP fallback for misses
  return addresses.map(a => {
    const key = `${a.address}|${a.city}|${a.zip}`
    const cached = geocodeCache.get(key)
    if (cached) return cached
    // ZIP centroid fallback
    const fallback = ZIP_COORDS[a.zip]
    if (fallback) return { lat: fallback[0], lng: fallback[1] }
    return null
  })
}

// Geocode a freeform address string (for end point)
async function geocodeFreeform(query) {
  if (!query || query.trim().length < 5) return null
  const cacheKey = `__freeform__${query}`
  if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey)

  try {
    // Use the batch endpoint with a single address
    const resp = await fetch('/api/geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addresses: [{ address: query, city: '', zip: '' }] }),
    })
    const data = await resp.json()
    if (data.results?.[0]?.lat != null) {
      const result = { lat: data.results[0].lat, lng: data.results[0].lng, display: query }
      geocodeCache.set(cacheKey, result)
      return result
    }
  } catch (err) {
    console.warn('Freeform geocode failed:', err)
  }
  return null
}

function createNumberedIcon(number, stopData) {
  const bg = stopData?._coldChain ? '#2563eb' : stopData?._sigRequired ? '#d97706' : '#6b7280'
  const size = 32
  const fontSize = number > 99 ? 10 : 12
  return L.divIcon({
    className: 'route-map__marker-icon',
    html: `<div class="route-map__marker-pin" style="--pin-bg:${bg}"><span style="font-size:${fontSize}px">${number}</span></div>`,
    iconSize: [size, 40],
    iconAnchor: [size / 2, 40],
    popupAnchor: [0, -36],
  })
}

function createStartIcon() {
  return L.divIcon({
    className: 'route-map__marker-icon',
    html: '<div class="route-map__marker-pin" style="--pin-bg:#16a34a"><span style="font-size:13px">S</span></div>',
    iconSize: [32, 40],
    iconAnchor: [16, 40],
    popupAnchor: [0, -36],
  })
}

function createEndIcon() {
  return L.divIcon({
    className: 'route-map__marker-icon',
    html: '<div class="route-map__marker-pin" style="--pin-bg:#dc2626"><span style="font-size:13px">E</span></div>',
    iconSize: [32, 40],
    iconAnchor: [16, 40],
    popupAnchor: [0, -36],
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

export default function RouteMap({ stops, mode, onReorder, pharmacy, defaultOpen = true }) {
  const [collapsed, setCollapsed] = useState(!defaultOpen)
  const [routeCoords, setRouteCoords] = useState(null)
  const [routeStats, setRouteStats] = useState(null)
  const [routeError, setRouteError] = useState(false)
  const [currentPos, setCurrentPos] = useState(null)
  const [geocoding, setGeocoding] = useState(false)
  const [points, setPoints] = useState([])
  const [dragIdx, setDragIdx] = useState(null)
  const [dragOverIdx, setDragOverIdx] = useState(null)
  const [endInput, setEndInput] = useState('')
  const [endPoint, setEndPoint] = useState(null)
  const [endLoading, setEndLoading] = useState(false)
  const watchRef = useRef(null)
  const endDebounce = useRef(null)

  // Determine start point from pharmacy
  const startPoint = PHARMACY_ORIGINS[pharmacy] || PHARMACY_ORIGINS.SHSP

  // Load saved end point from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('cnc_route_end')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setEndPoint(parsed)
        setEndInput(parsed.display || '')
      } catch {}
    }
  }, [])

  // Geocode end point when input changes (debounced)
  function handleEndInputChange(val) {
    setEndInput(val)
    if (endDebounce.current) clearTimeout(endDebounce.current)
    if (!val || val.trim().length < 5) {
      setEndPoint(null)
      localStorage.removeItem('cnc_route_end')
      return
    }
    endDebounce.current = setTimeout(async () => {
      setEndLoading(true)
      const result = await geocodeFreeform(val)
      setEndLoading(false)
      if (result) {
        setEndPoint(result)
        localStorage.setItem('cnc_route_end', JSON.stringify(result))
      } else {
        setEndPoint(null)
      }
    }, 1200)
  }

  // Geocode all stops in one batch request
  useEffect(() => {
    if (!stops || stops.length < 2) { setPoints([]); return }
    let cancelled = false
    const pending = stops.filter(s => s.status !== 'delivered' && s.status !== 'failed')

    async function resolve() {
      setGeocoding(true)
      const addressList = pending.map(s => ({
        address: s.Address || '', city: s.City || '', zip: s.ZIP || '',
      }))
      const coords = await batchGeocode(addressList)
      if (cancelled) return

      const results = []
      for (let i = 0; i < pending.length; i++) {
        const s = pending[i]
        const c = coords[i]
        if (c) {
          results.push({
            lat: c.lat, lng: c.lng, label: i + 1,
            name: s.Name || s['Name'] || '',
            address: s.Address || '', city: s.City || '', zip: s.ZIP || '',
            _coldChain: s._coldChain, _sigRequired: s._sigRequired,
            _packageCount: s._packageCount || 1, _stopRef: s,
          })
        }
      }
      if (!cancelled) { setPoints(results); setGeocoding(false) }
    }
    resolve()
    return () => { cancelled = true }
  }, [stops])

  // Fetch OSRM route (start → stops → end)
  useEffect(() => {
    if (points.length < 2) { setRouteCoords(null); setRouteStats(null); return }
    async function fetchRoute() {
      try {
        // Build waypoint chain: start → stops → end
        const allWaypoints = [
          { lat: startPoint.lat, lng: startPoint.lng },
          ...points,
        ]
        if (endPoint) {
          allWaypoints.push({ lat: endPoint.lat, lng: endPoint.lng })
        }
        const coordStr = allWaypoints.map(p => `${p.lng},${p.lat}`).join(';')
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
  }, [points, startPoint, endPoint])

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
    const newPoints = [...points]
    const [moved] = newPoints.splice(dragIdx, 1)
    newPoints.splice(idx, 0, moved)
    const relabeled = newPoints.map((p, i) => ({ ...p, label: i + 1 }))
    setPoints(relabeled)
    setDragIdx(null)
    setDragOverIdx(null)
    if (onReorder) onReorder(relabeled.map(p => p._stopRef))
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

  // All map points for bounds fitting (start + stops + end)
  const allBoundsPoints = [
    startPoint,
    ...points,
    ...(endPoint ? [endPoint] : []),
  ]

  function buildNavUrl() {
    const parts = []
    // Start from pharmacy
    parts.push(startPoint.label.split(' — ')[1]?.replace(/\s+/g, '+') || '')
    // Stops
    points.forEach(s => {
      const addr = (s.address || '').replace(/\s+/g, '+')
      const city = (s.city || '').replace(/\s+/g, '+')
      parts.push(`${addr},+${city},+OH+${s.zip || ''}`)
    })
    // End point
    if (endPoint) {
      parts.push(encodeURIComponent(endPoint.display || endInput))
    }
    return `https://www.google.com/maps/dir/${parts.join('/')}`
  }

  const fallbackCoords = (() => {
    const coords = [
      [startPoint.lat, startPoint.lng],
      ...points.map(p => [p.lat, p.lng]),
    ]
    if (endPoint) coords.push([endPoint.lat, endPoint.lng])
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

              {/* Start point (pharmacy) */}
              <div className="route-map__stop-item route-map__stop-item--fixed route-map__stop-item--start">
                <span className="route-map__stop-num" style={{ background: '#16a34a' }}>S</span>
                <div className="route-map__stop-info">
                  <span className="route-map__stop-name">Start — {pharmacy || 'SHSP'}</span>
                  <span className="route-map__stop-addr">{startPoint.label.split(' — ')[1] || ''}</span>
                </div>
              </div>

              {/* Delivery stops */}
              {points.map((p, i) => {
                const stopType = p._coldChain ? 'cold' : p._sigRequired ? 'sig' : 'regular'
                return (
                  <div
                    key={`${p.address}-${p.zip}-${i}`}
                    className={`route-map__stop-item route-map__stop-item--${stopType} ${dragOverIdx === i ? 'route-map__stop-item--dragover' : ''} ${dragIdx === i ? 'route-map__stop-item--dragging' : ''}`}
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
                        background: p._coldChain ? '#2563eb' : p._sigRequired ? '#d97706' : '#6b7280',
                      }}
                    >
                      {p.label}
                    </span>
                    <div className="route-map__stop-info">
                      <span className="route-map__stop-name">{p.name || 'Unknown'}</span>
                      <span className="route-map__stop-addr">{p.address}{p.city ? `, ${p.city}` : ''}</span>
                    </div>
                    {p._coldChain && <span className="route-map__stop-badge route-map__stop-badge--cold">CC</span>}
                    {p._sigRequired && <span className="route-map__stop-badge route-map__stop-badge--sig">SIG</span>}
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
                )
              })}

              {/* End point (driver-entered) */}
              <div className="route-map__stop-item route-map__stop-item--fixed route-map__stop-item--end">
                <span className="route-map__stop-num" style={{ background: '#dc2626' }}>E</span>
                <div className="route-map__stop-info route-map__stop-info--end">
                  <input
                    type="text"
                    className="route-map__end-input"
                    placeholder="End address (pharmacy, home, etc.)..."
                    value={endInput}
                    onChange={(e) => handleEndInputChange(e.target.value)}
                  />
                  {endLoading && <span className="route-map__end-loading">...</span>}
                  {endPoint && !endLoading && <span className="route-map__end-check">Set</span>}
                </div>
              </div>

              {/* Legend */}
              <div className="route-map__legend">
                <span className="route-map__legend-item"><span className="route-map__legend-dot route-map__legend-dot--cold"></span>Cold Chain</span>
                <span className="route-map__legend-item"><span className="route-map__legend-dot route-map__legend-dot--sig"></span>Signature</span>
                <span className="route-map__legend-item"><span className="route-map__legend-dot route-map__legend-dot--regular"></span>Standard</span>
              </div>
            </div>

            {/* Map */}
            <div className="route-map__container">
              <MapContainer
                center={[startPoint.lat, startPoint.lng]}
                zoom={11}
                scrollWheelZoom={true}
                touchZoom={true}
                dragging={true}
                zoomControl={false}
                className="route-map__leaflet"
              >
                <TileLayer
                  attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                  url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                />
                <FitBounds points={allBoundsPoints} />

                {/* Route polyline — shadow underneath for depth */}
                {routeCoords ? (
                  <>
                    <Polyline positions={routeCoords} color="#1e3a5f" weight={7} opacity={0.15} lineCap="round" lineJoin="round" />
                    <Polyline positions={routeCoords} color="#4f8df7" weight={5} opacity={0.9} lineCap="round" lineJoin="round" />
                  </>
                ) : (
                  <Polyline positions={fallbackCoords} color="#94a3b8" weight={3} opacity={0.5} dashArray="10 8" lineCap="round" />
                )}

                {/* Start marker */}
                <Marker position={[startPoint.lat, startPoint.lng]} icon={createStartIcon()}>
                  <Popup>
                    <div className="route-map__popup">
                      <strong>Start</strong>
                      <div>{startPoint.label}</div>
                    </div>
                  </Popup>
                </Marker>

                {/* Stop markers */}
                {points.map((p, i) => (
                  <Marker
                    key={i}
                    position={[p.lat, p.lng]}
                    icon={createNumberedIcon(p.label, p)}
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

                {/* End marker */}
                {endPoint && (
                  <Marker position={[endPoint.lat, endPoint.lng]} icon={createEndIcon()}>
                    <Popup>
                      <div className="route-map__popup">
                        <strong>End Point</strong>
                        <div className="route-map__popup-addr">{endPoint.display || endInput}</div>
                      </div>
                    </Popup>
                  </Marker>
                )}

                {/* Current position */}
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
