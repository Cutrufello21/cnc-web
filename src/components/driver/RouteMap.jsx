import { useEffect, useState, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import ZIP_COORDS from '../../lib/zipCoords.js'
import './RouteMap.css'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

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

function createNumberedIcon(number, stopData) {
  const bg = stopData?._coldChain ? '#2563eb' : stopData?._sigRequired ? '#d97706' : '#6b7280'
  const fontSize = number > 99 ? 10 : 12
  return L.divIcon({
    className: 'route-map__marker-icon',
    html: `<div class="route-map__marker-pin" style="--pin-bg:${bg}"><span style="font-size:${fontSize}px">${number}</span></div>`,
    iconSize: [32, 40], iconAnchor: [16, 40], popupAnchor: [0, -36],
  })
}
function createStartIcon() {
  return L.divIcon({
    className: 'route-map__marker-icon',
    html: '<div class="route-map__marker-pin" style="--pin-bg:#16a34a"><span style="font-size:13px">S</span></div>',
    iconSize: [32, 40], iconAnchor: [16, 40], popupAnchor: [0, -36],
  })
}
function createEndIcon() {
  return L.divIcon({
    className: 'route-map__marker-icon',
    html: '<div class="route-map__marker-pin" style="--pin-bg:#dc2626"><span style="font-size:13px">E</span></div>',
    iconSize: [32, 40], iconAnchor: [16, 40], popupAnchor: [0, -36],
  })
}
function createCompletedIcon(status) {
  const bg = status === 'failed' ? '#ef4444' : '#9ca3af'
  const icon = status === 'failed' ? '✕' : '✓'
  return L.divIcon({
    className: 'route-map__marker-icon',
    html: `<div class="route-map__marker-pin route-map__marker-pin--done" style="--pin-bg:${bg};opacity:0.5"><span style="font-size:13px">${icon}</span></div>`,
    iconSize: [32, 40], iconAnchor: [16, 40], popupAnchor: [0, -36],
  })
}

function createCurrentPosIcon() {
  return L.divIcon({
    className: 'route-map__current-pos',
    html: '<div class="route-map__pulse-dot"><div class="route-map__pulse-ring"></div></div>',
    iconSize: [18, 18], iconAnchor: [9, 9],
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

  // Build the stop list content (shared between desktop and mobile drawer)
  const stopListContent = (
    <>
      <div className="route-map__list-header">
        <span>Stop Order</span>
        <span className="route-map__list-hint">{isMobile ? 'Hold to reorder' : 'Drag to reorder'}</span>
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
              onTouchStart={(e) => handleTouchStart(e, i)}
              onTouchMove={(e) => handleTouchMove(e, i)}
              onTouchEnd={handleTouchEnd}
            >
              <span className="route-map__stop-grip">⠿</span>
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

  const mapContent = (
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

      {routeCoords ? (
        <>
          <Polyline positions={routeCoords} color="#1e3a5f" weight={7} opacity={0.15} lineCap="round" lineJoin="round" />
          <Polyline positions={routeCoords} color="#4f8df7" weight={5} opacity={0.9} lineCap="round" lineJoin="round" />
        </>
      ) : (
        <Polyline positions={fallbackCoords} color="#94a3b8" weight={3} opacity={0.5} dashArray="10 8" lineCap="round" />
      )}

      <Marker position={[startPoint.lat, startPoint.lng]} icon={createStartIcon()}>
        <Popup><div className="route-map__popup"><strong>Start</strong><div>{startPoint.label}</div></div></Popup>
      </Marker>

      {points.map((p, i) => (
        <Marker key={i} position={[p.lat, p.lng]} icon={createNumberedIcon(p.label, p)}>
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

      {endPoint && (
        <Marker position={[endPoint.lat, endPoint.lng]} icon={createEndIcon()}>
          <Popup><div className="route-map__popup"><strong>End Point</strong><div className="route-map__popup-addr">{endPoint.display || endInput}</div></div></Popup>
        </Marker>
      )}

      {/* Completed stops — greyed out */}
      {completedPoints.map((p, i) => (
        <Marker key={`done-${i}`} position={[p.lat, p.lng]} icon={createCompletedIcon(p.status)}>
          <Popup>
            <div className="route-map__popup">
              <strong>{p.status === 'failed' ? 'Failed' : 'Delivered'}</strong>
              <div>{p.name}</div>
              <div className="route-map__popup-addr">{p.address}</div>
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

          {/* Layout: desktop = side by side, mobile = map + drawer */}
          <div className={`route-map__planner ${isMobile ? 'route-map__planner--mobile' : ''}`}>
            {isMobile ? (
              <>
                <div className="route-map__container">{mapContent}</div>
                <div
                  ref={drawerRef}
                  className={`route-map__drawer ${drawerOpen ? 'route-map__drawer--open' : ''}`}
                >
                  <div
                    className="route-map__drawer-handle"
                    onTouchStart={handleDrawerTouchStart}
                    onTouchMove={handleDrawerTouchMove}
                    onTouchEnd={handleDrawerTouchEnd}
                    onClick={() => setDrawerOpen(!drawerOpen)}
                  >
                    <div className="route-map__drawer-bar"></div>
                  </div>
                  <div className="route-map__stop-list route-map__stop-list--drawer">
                    {stopListContent}
                  </div>
                </div>
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
