import { useEffect, useState, useRef, useCallback } from 'react'
import Map, { Marker, Source, Layer, Popup, NavigationControl } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import ZIP_COORDS from '../../lib/zipCoords.js'
import './RouteMap.css'

const PHARMACY_ORIGINS = {
  SHSP: { lat: 41.0758, lng: -81.5193, label: 'SHSP — 70 Arch St, Akron' },
  Aultman: { lat: 40.7914, lng: -81.3939, label: 'Aultman — 2600 6th St SW, Canton' },
}

const geocodeCache = new Map()

async function batchGeocode(addresses) {
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
            geocodeCache.set(`${r.address}|${r.city}|${r.zip}`, { lat: r.lat, lng: r.lng })
          }
        }
      }
    } catch (err) { console.warn('Batch geocode failed:', err) }
  }
  return addresses.map(a => {
    const cached = geocodeCache.get(`${a.address}|${a.city}|${a.zip}`)
    if (cached) return cached
    const fallback = ZIP_COORDS[a.zip]
    return fallback ? { lat: fallback[0], lng: fallback[1] } : null
  })
}

async function geocodeFreeform(query) {
  if (!query || query.trim().length < 5) return null
  const cacheKey = `__freeform__${query}`
  if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey)
  try {
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
  } catch (err) { console.warn('Freeform geocode failed:', err) }
  return null
}

// MapLibre pin marker component
function PinMarker({ lng, lat, label, color, opacity = 1, children }) {
  const [showPopup, setShowPopup] = useState(false)
  return (
    <>
      <Marker longitude={lng} latitude={lat} anchor="bottom" onClick={() => setShowPopup(true)}>
        <div className="route-map__pin" style={{ '--pin-color': color, opacity }} onClick={() => setShowPopup(true)}>
          <span>{label}</span>
        </div>
      </Marker>
      {showPopup && (
        <Popup longitude={lng} latitude={lat} anchor="bottom" offset={[0, -36]} onClose={() => setShowPopup(false)}
          closeButton={true} closeOnClick={false} className="route-map__gl-popup">
          {children}
        </Popup>
      )}
    </>
  )
}

// Compute bounds from points array
function computeBounds(points) {
  if (!points.length) return null
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity
  for (const p of points) {
    if (p.lng < minLng) minLng = p.lng
    if (p.lng > maxLng) maxLng = p.lng
    if (p.lat < minLat) minLat = p.lat
    if (p.lat > maxLat) maxLat = p.lat
  }
  return [[minLng, minLat], [maxLng, maxLat]]
}

export default function RouteMap({ stops, mode, onReorder, pharmacy, defaultOpen = true }) {
  const [collapsed, setCollapsed] = useState(!defaultOpen)
  const [routeCoords, setRouteCoords] = useState(null)
  const [routeStats, setRouteStats] = useState(null)
  const [routeError, setRouteError] = useState(false)
  const [routeLegs, setRouteLegs] = useState([])
  const [routeSource, setRouteSource] = useState(null)
  const [currentPos, setCurrentPos] = useState(null)
  const [geocoding, setGeocoding] = useState(false)
  const [points, setPoints] = useState([])
  const [dragIdx, setDragIdx] = useState(null)
  const [dragOverIdx, setDragOverIdx] = useState(null)
  const [endInput, setEndInput] = useState('')
  const [endPoint, setEndPoint] = useState(null)
  const [endLoading, setEndLoading] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  // Touch reorder state
  const [touchDragIdx, setTouchDragIdx] = useState(null)
  const [touchOverIdx, setTouchOverIdx] = useState(null)
  const touchTimeout = useRef(null)
  const touchStartPos = useRef(null)
  const touchActive = useRef(false)
  const stopListRef = useRef(null)
  const watchRef = useRef(null)
  const endDebounce = useRef(null)
  // Drawer touch
  const drawerRef = useRef(null)
  const drawerStartY = useRef(null)
  const drawerStartH = useRef(null)

  const startPoint = PHARMACY_ORIGINS[pharmacy] || PHARMACY_ORIGINS.SHSP

  // Detect mobile
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    setIsMobile(mq.matches)
    const handler = (e) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Load saved end point
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
      } else { setEndPoint(null) }
    }, 1200)
  }

  const [completedPoints, setCompletedPoints] = useState([])

  // Geocode stops (active + completed)
  useEffect(() => {
    if (!stops || stops.length < 2) { setPoints([]); setCompletedPoints([]); return }
    let cancelled = false
    const pending = stops.filter(s => s.status !== 'delivered' && s.status !== 'failed')
    const done = stops.filter(s => s.status === 'delivered' || s.status === 'failed')

    async function resolve() {
      setGeocoding(true)
      // Geocode all in one batch
      const allStops = [...pending, ...done]
      const coords = await batchGeocode(allStops.map(s => ({
        address: s.Address || '', city: s.City || '', zip: s.ZIP || '',
      })))
      if (cancelled) return

      const activeResults = []
      for (let i = 0; i < pending.length; i++) {
        const s = pending[i], c = coords[i]
        if (c) {
          activeResults.push({
            lat: c.lat, lng: c.lng, label: i + 1,
            name: s.Name || s['Name'] || '',
            address: s.Address || '', city: s.City || '', zip: s.ZIP || '',
            _coldChain: s._coldChain, _sigRequired: s._sigRequired,
            _packageCount: s._packageCount || 1, _stopRef: s,
          })
        }
      }

      const doneResults = []
      for (let i = 0; i < done.length; i++) {
        const s = done[i], c = coords[pending.length + i]
        if (c) {
          doneResults.push({
            lat: c.lat, lng: c.lng,
            name: s.Name || s['Name'] || '',
            address: s.Address || '', city: s.City || '', zip: s.ZIP || '',
            status: s.status,
          })
        }
      }

      if (!cancelled) {
        setPoints(activeResults)
        setCompletedPoints(doneResults)
        setGeocoding(false)
      }
    }
    resolve()
    return () => { cancelled = true }
  }, [stops])

  // Fetch route via /api/directions (Google traffic-aware or OSRM fallback)
  useEffect(() => {
    if (points.length < 2) { setRouteCoords(null); setRouteStats(null); setRouteLegs([]); return }
    async function fetchRoute() {
      try {
        const waypoints = [
          { lat: startPoint.lat, lng: startPoint.lng },
          ...points.map(p => ({ lat: p.lat, lng: p.lng })),
        ]
        if (endPoint) waypoints.push({ lat: endPoint.lat, lng: endPoint.lng })

        const resp = await fetch('/api/directions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ waypoints }),
        })
        const data = await resp.json()
        if (data.geometry) {
          setRouteCoords(data.geometry)
          setRouteStats({ distance: data.distance, duration: data.duration })
          setRouteLegs(data.legs || [])
          setRouteSource(data.source || 'osrm')
          setRouteError(false)
        } else throw new Error(data.error || 'No route')
      } catch (err) {
        console.warn('Route fetch failed:', err)
        setRouteError(true); setRouteCoords(null); setRouteStats(null); setRouteLegs([])
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

  // === Reorder logic (shared between desktop drag and touch) ===
  const doReorder = useCallback((fromIdx, toIdx) => {
    if (fromIdx == null || fromIdx === toIdx) return
    const newPoints = [...points]
    const [moved] = newPoints.splice(fromIdx, 1)
    newPoints.splice(toIdx, 0, moved)
    const relabeled = newPoints.map((p, i) => ({ ...p, label: i + 1 }))
    setPoints(relabeled)
    if (onReorder) onReorder(relabeled.map(p => p._stopRef))
  }, [points, onReorder])

  // Desktop drag
  function handleDragStart(e, idx) { setDragIdx(idx); e.dataTransfer.effectAllowed = 'move' }
  function handleDragOver(e, idx) { e.preventDefault(); setDragOverIdx(idx) }
  function handleDrop(e, idx) {
    e.preventDefault()
    doReorder(dragIdx, idx)
    setDragIdx(null); setDragOverIdx(null)
  }
  function handleDragEnd() { setDragIdx(null); setDragOverIdx(null) }

  // === Mobile touch reorder ===
  function handleTouchStart(e, idx) {
    touchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    touchActive.current = false
    touchTimeout.current = setTimeout(() => {
      touchActive.current = true
      setTouchDragIdx(idx)
      // Haptic feedback if available
      if (navigator.vibrate) navigator.vibrate(30)
    }, 400)
  }

  function handleTouchMove(e, idx) {
    if (!touchActive.current) {
      // Cancel long press if finger moved too much (it's a scroll)
      if (touchStartPos.current) {
        const dx = Math.abs(e.touches[0].clientX - touchStartPos.current.x)
        const dy = Math.abs(e.touches[0].clientY - touchStartPos.current.y)
        if (dx > 10 || dy > 10) {
          clearTimeout(touchTimeout.current)
          touchStartPos.current = null
        }
      }
      return
    }
    e.preventDefault() // prevent scrolling while dragging
    // Find which stop element we're over
    const touch = e.touches[0]
    const el = document.elementFromPoint(touch.clientX, touch.clientY)
    if (el) {
      const stopEl = el.closest('[data-stop-idx]')
      if (stopEl) {
        const overIdx = parseInt(stopEl.dataset.stopIdx, 10)
        if (!isNaN(overIdx)) setTouchOverIdx(overIdx)
      }
    }
  }

  function handleTouchEnd() {
    clearTimeout(touchTimeout.current)
    if (touchActive.current && touchDragIdx != null && touchOverIdx != null) {
      doReorder(touchDragIdx, touchOverIdx)
    }
    touchActive.current = false
    touchStartPos.current = null
    setTouchDragIdx(null)
    setTouchOverIdx(null)
  }

  // === Drawer touch ===
  function handleDrawerTouchStart(e) {
    drawerStartY.current = e.touches[0].clientY
    drawerStartH.current = drawerOpen ? window.innerHeight * 0.65 : 130
  }
  function handleDrawerTouchMove(e) {
    if (drawerStartY.current == null) return
    const dy = drawerStartY.current - e.touches[0].clientY
    const newH = Math.min(Math.max(drawerStartH.current + dy, 130), window.innerHeight * 0.75)
    if (drawerRef.current) drawerRef.current.style.height = `${newH}px`
  }
  function handleDrawerTouchEnd() {
    if (drawerRef.current) {
      const h = drawerRef.current.offsetHeight
      const snap = h > 250
      setDrawerOpen(snap)
      drawerRef.current.style.height = ''
    }
    drawerStartY.current = null
  }

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

  const allBoundsPoints = [startPoint, ...points, ...(endPoint ? [endPoint] : [])]

  // Next Stop nav URL
  function buildNextStopUrl() {
    if (!points.length) return null
    const p = points[0]
    const addr = encodeURIComponent(`${p.address}, ${p.city}, OH ${p.zip}`)
    return `https://www.google.com/maps/dir/?api=1&destination=${addr}&travelmode=driving`
  }

  function buildNavUrl() {
    const parts = []
    parts.push(startPoint.label.split(' — ')[1]?.replace(/\s+/g, '+') || '')
    points.forEach(s => {
      const addr = (s.address || '').replace(/\s+/g, '+')
      const city = (s.city || '').replace(/\s+/g, '+')
      parts.push(`${addr},+${city},+OH+${s.zip || ''}`)
    })
    if (endPoint) parts.push(encodeURIComponent(endPoint.display || endInput))
    return `https://www.google.com/maps/dir/${parts.join('/')}`
  }

  const fallbackCoords = (() => {
    const coords = [[startPoint.lat, startPoint.lng], ...points.map(p => [p.lat, p.lng])]
    if (endPoint) coords.push([endPoint.lat, endPoint.lng])
    return coords
  })()

  const durationHrs = routeStats ? Math.floor(routeStats.duration / 60) : 0
  const durationMins = routeStats ? routeStats.duration % 60 : 0

  const activeIdx = dragIdx ?? touchDragIdx
  const activeOverIdx = dragOverIdx ?? touchOverIdx

  // Move stop up/down (for mobile arrow buttons)
  function moveStop(fromIdx, direction) {
    const toIdx = fromIdx + direction
    if (toIdx < 0 || toIdx >= points.length) return
    doReorder(fromIdx, toIdx)
  }

  // Build the stop list content (shared between desktop and mobile)
  const stopListContent = (
    <>
      <div className="route-map__list-header">
        <span>Stop Order</span>
        <span className="route-map__list-hint">{isMobile ? 'Use arrows to reorder' : 'Drag to reorder'}</span>
      </div>

      <div className="route-map__stop-item route-map__stop-item--fixed route-map__stop-item--start">
        <span className="route-map__stop-num" style={{ background: '#16a34a' }}>S</span>
        <div className="route-map__stop-info">
          <span className="route-map__stop-name">Start — {pharmacy || 'SHSP'}</span>
          <span className="route-map__stop-addr">{startPoint.label.split(' — ')[1] || ''}</span>
        </div>
      </div>

      {points.map((p, i) => {
        const stopType = p._coldChain ? 'cold' : p._sigRequired ? 'sig' : 'regular'
        const leg = routeLegs[i]
        return (
          <div key={`${p.address}-${p.zip}-${i}`}>
            {leg && (
              <div className="route-map__leg">
                <div className="route-map__leg-line"></div>
                <span className="route-map__leg-info">{leg.duration} min · {leg.distance} mi</span>
              </div>
            )}
            <div
              data-stop-idx={i}
              className={`route-map__stop-item route-map__stop-item--${stopType} ${activeOverIdx === i ? 'route-map__stop-item--dragover' : ''} ${activeIdx === i ? 'route-map__stop-item--dragging' : ''}`}
              draggable={!isMobile}
              onDragStart={(e) => handleDragStart(e, i)}
              onDragOver={(e) => handleDragOver(e, i)}
              onDrop={(e) => handleDrop(e, i)}
              onDragEnd={handleDragEnd}
            >
              {/* Mobile: up/down arrows | Desktop: drag grip */}
              {isMobile ? (
                <div className="route-map__stop-arrows">
                  <button
                    className="route-map__arrow-btn"
                    onClick={() => moveStop(i, -1)}
                    disabled={i === 0}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
                  </button>
                  <button
                    className="route-map__arrow-btn"
                    onClick={() => moveStop(i, 1)}
                    disabled={i === points.length - 1}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                </div>
              ) : (
                <span className="route-map__stop-grip">⠿</span>
              )}
              <span className="route-map__stop-num" style={{ background: p._coldChain ? '#2563eb' : p._sigRequired ? '#d97706' : '#6b7280' }}>
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
                target="_blank" rel="noopener noreferrer" className="route-map__stop-nav"
                onClick={(e) => e.stopPropagation()}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="3 11 22 2 13 21 11 13 3 11"/>
                </svg>
              </a>
            </div>
          </div>
        )
      })}

      {(() => {
        const lastLeg = routeLegs[points.length]
        return lastLeg ? (
          <div className="route-map__leg">
            <div className="route-map__leg-line"></div>
            <span className="route-map__leg-info">{lastLeg.duration} min · {lastLeg.distance} mi</span>
          </div>
        ) : null
      })()}

      <div className="route-map__stop-item route-map__stop-item--fixed route-map__stop-item--end">
        <span className="route-map__stop-num" style={{ background: '#dc2626' }}>E</span>
        <div className="route-map__stop-info route-map__stop-info--end">
          <input type="text" className="route-map__end-input" placeholder="End address (pharmacy, home, etc.)..."
            value={endInput} onChange={(e) => handleEndInputChange(e.target.value)} />
          {endLoading && <span className="route-map__end-loading">...</span>}
          {endPoint && !endLoading && <span className="route-map__end-check">Set</span>}
        </div>
      </div>

      <div className="route-map__legend">
        <span className="route-map__legend-item"><span className="route-map__legend-dot route-map__legend-dot--cold"></span>Cold Chain</span>
        <span className="route-map__legend-item"><span className="route-map__legend-dot route-map__legend-dot--sig"></span>Signature</span>
        <span className="route-map__legend-item"><span className="route-map__legend-dot route-map__legend-dot--regular"></span>Standard</span>
      </div>
    </>
  )

  // GeoJSON for route line
  const routeGeoJSON = routeCoords ? {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: routeCoords.map(c => [c[1], c[0]]), // [lng, lat]
    },
  } : fallbackCoords.length > 1 ? {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: fallbackCoords.map(c => [c[1], c[0]]),
    },
  } : null

  const bounds = computeBounds(allBoundsPoints)

  const mapContent = (
    <Map
      initialViewState={{
        bounds: bounds || undefined,
        fitBoundsOptions: { padding: 50 },
        longitude: startPoint.lng,
        latitude: startPoint.lat,
        zoom: 10,
      }}
      style={{ width: '100%', height: '100%' }}
      mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
      attributionControl={true}
    >
      {/* Route line */}
      {routeGeoJSON && (
        <Source id="route" type="geojson" data={routeGeoJSON}>
          {/* Shadow */}
          <Layer id="route-shadow" type="line" paint={{
            'line-color': '#1e3a5f',
            'line-width': 7,
            'line-opacity': routeCoords ? 0.12 : 0,
          }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
          {/* Main line */}
          <Layer id="route-line" type="line" paint={{
            'line-color': routeCoords ? '#4f8df7' : '#94a3b8',
            'line-width': routeCoords ? 5 : 3,
            'line-opacity': routeCoords ? 0.9 : 0.5,
            ...(routeCoords ? {} : { 'line-dasharray': [2, 1.5] }),
          }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
        </Source>
      )}

      {/* Start marker */}
      <PinMarker lng={startPoint.lng} lat={startPoint.lat} label="S" color="#16a34a">
        <strong>Start</strong>
        <div>{startPoint.label}</div>
      </PinMarker>

      {/* Stop markers */}
      {points.map((p, i) => {
        const color = p._coldChain ? '#2563eb' : p._sigRequired ? '#d97706' : '#6b7280'
        return (
          <PinMarker key={i} lng={p.lng} lat={p.lat} label={p.label} color={color}>
            <strong>Stop {p.label}</strong>
            <div>{p.name}</div>
            <div style={{ color: '#64748b', fontSize: 12 }}>{p.address}</div>
            {p.city && <div style={{ color: '#64748b', fontSize: 12 }}>{p.city}, OH {p.zip}</div>}
          </PinMarker>
        )
      })}

      {/* End marker */}
      {endPoint && (
        <PinMarker lng={endPoint.lng} lat={endPoint.lat} label="E" color="#dc2626">
          <strong>End Point</strong>
          <div style={{ color: '#64748b', fontSize: 12 }}>{endPoint.display || endInput}</div>
        </PinMarker>
      )}

      {/* Completed stops — greyed out */}
      {completedPoints.map((p, i) => (
        <PinMarker key={`done-${i}`} lng={p.lng} lat={p.lat}
          label={p.status === 'failed' ? '✕' : '✓'}
          color={p.status === 'failed' ? '#ef4444' : '#9ca3af'}
          opacity={0.5}
        >
          <strong>{p.status === 'failed' ? 'Failed' : 'Delivered'}</strong>
          <div>{p.name}</div>
          <div style={{ color: '#64748b', fontSize: 12 }}>{p.address}</div>
        </PinMarker>
      ))}

      {/* Current position */}
      {currentPos && (
        <Marker longitude={currentPos.lng} latitude={currentPos.lat} anchor="center">
          <div className="route-map__pulse-dot">
            <div className="route-map__pulse-ring"></div>
          </div>
        </Marker>
      )}
    </Map>
  )

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
          {/* Next Stop button */}
          {points.length > 0 && (
            <a href={buildNextStopUrl()} target="_blank" rel="noopener noreferrer" className="route-map__next-stop-btn">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="3 11 22 2 13 21 11 13 3 11"/>
              </svg>
              <div className="route-map__next-stop-text">
                <span className="route-map__next-stop-label">Next Stop</span>
                <span className="route-map__next-stop-name">{points[0].name} — {points[0].address}</span>
              </div>
              {routeLegs[0] && (
                <span className="route-map__next-stop-eta">{routeLegs[0].duration} min</span>
              )}
            </a>
          )}

          {/* Navigate All */}
          <a href={buildNavUrl()} target="_blank" rel="noopener noreferrer" className="route-map__navigate-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
              {routeSource === 'google' && (
                <span className="route-map__traffic-badge">Live traffic</span>
              )}
            </div>
          )}

          {routeError && (
            <div className="route-map__fallback-notice">Routing unavailable — showing straight-line path</div>
          )}

          {/* Layout: desktop = side by side, mobile = list on top + map below */}
          <div className={`route-map__planner ${isMobile ? 'route-map__planner--mobile' : ''}`}>
            {isMobile ? (
              <>
                <div className="route-map__stop-list route-map__stop-list--mobile">
                  {stopListContent}
                </div>
                <div className="route-map__container">{mapContent}</div>
              </>
            ) : (
              <>
                <div className="route-map__stop-list" ref={stopListRef}>
                  {stopListContent}
                </div>
                <div className="route-map__container">{mapContent}</div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
