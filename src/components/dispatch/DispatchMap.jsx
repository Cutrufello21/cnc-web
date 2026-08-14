import { useEffect, useRef, useState, useMemo } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { dbUpdate } from '../../lib/db'
import { normalizeCity } from '../../lib/normalizeCity'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN

const MAP_STYLES = [
  { key: 'dark', label: 'Dark', url: 'mapbox://styles/mapbox/dark-v11' },
  { key: 'light', label: 'Light', url: 'mapbox://styles/mapbox/light-v11' },
  { key: 'streets', label: 'Streets', url: 'mapbox://styles/mapbox/streets-v12' },
  { key: 'satellite', label: 'Satellite', url: 'mapbox://styles/mapbox/satellite-streets-v12' },
  { key: 'nav-night', label: 'Nav', url: 'mapbox://styles/mapbox/navigation-night-v1' },
]

const DRIVER_COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#6366f1', '#14b8a6',
  '#e11d48', '#84cc16', '#0ea5e9', '#a855f7', '#ef4444',
  '#22c55e', '#eab308', '#3b82f6', '#d946ef', '#64748b',
]

// Pharmacy icons as inline SVG data URIs
const PHARMACY_ICONS = {
  SHSP: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><rect width="20" height="20" rx="4" fill="#0B1E3D"/><text x="10" y="14" text-anchor="middle" font-size="9" font-weight="700" fill="#fff" font-family="Inter,sans-serif">H</text></svg>`,
  Aultman: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><rect width="20" height="20" rx="4" fill="#16a34a"/><text x="10" y="14" text-anchor="middle" font-size="9" font-weight="700" fill="#fff" font-family="Inter,sans-serif">A</text></svg>`,
}

export default function DispatchMap({ drivers, onStopClick, onMoveStop, selectedDay, deliveryDate, fetchDispatchData }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const markerMetaRef = useRef([]) // { stop, driverName, marker, el, color, lat, lng }
  const [selectedDrivers, setSelectedDrivers] = useState(new Set())
  const [mapReady, setMapReady] = useState(false)
  const [styleIdx, setStyleIdx] = useState(0)
  const [pharmaFilter, setPharmaFilter] = useState('all')
  const [coldOnly, setColdOnly] = useState(false)
  const [plotCount, setPlotCount] = useState(0)
  const [coldCount, setColdCount] = useState(0)
  const [moving, setMoving] = useState(false)
  const [mapSearch, setMapSearch] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [selectedStops, setSelectedStops] = useState(new Set())
  const [batchTarget, setBatchTarget] = useState('')
  const [batchMoving, setBatchMoving] = useState(false)
  const openPopupRef = useRef(null)
  const geocodedRef = useRef(false)

  function toggleStopSelection(oid) {
    if (!oid) return
    setSelectedStops(prev => {
      const next = new Set(prev)
      if (next.has(oid)) next.delete(oid)
      else next.add(oid)
      return next
    })
  }

  function clearSelection() {
    setSelectedStops(new Set())
    setBatchTarget('')
  }

  async function handleBatchMove() {
    if (!batchTarget || selectedStops.size === 0 || batchMoving) return
    const targetDrv = (drivers || []).find(d => d['Driver Name'] === batchTarget)
    if (!targetDrv) return
    if (!confirm(`Move ${selectedStops.size} stops to ${batchTarget}?`)) return
    setBatchMoving(true)
    try {
      const dateStr = deliveryDate ? `${deliveryDate.getFullYear()}-${String(deliveryDate.getMonth()+1).padStart(2,'0')}-${String(deliveryDate.getDate()).padStart(2,'0')}` : null
      if (!dateStr) return
      const targetNum = String(targetDrv['Driver #'])
      for (const oid of selectedStops) {
        await dbUpdate('daily_stops', { driver_name: batchTarget, driver_number: targetNum, assigned_driver_number: targetNum }, { order_id: oid, delivery_date: dateStr })
      }
      setSelectedStops(new Set())
      setBatchTarget('')
      if (fetchDispatchData) fetchDispatchData(selectedDay)
    } catch (e) { console.error('Batch map move error:', e) }
    finally { setBatchMoving(false) }
  }

  // Auto-geocode stops missing lat/lng when map opens
  useEffect(() => {
    if (geocodedRef.current || !drivers?.length) return
    const allStops = (drivers || []).flatMap(d => d.stopDetails || [])
    const missing = allStops.filter(s => !s.lat && !s.lng && (s.address || s.Address))
    if (missing.length === 0) return
    geocodedRef.current = true

    async function batchGeocode() {
      let updated = 0
      for (let i = 0; i < missing.length; i += 50) {
        const batch = missing.slice(i, i + 50)
        try {
          const res = await fetch('/api/geocode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              addresses: batch.map(s => ({
                address: s.address || s.Address || '',
                city: s.city || s.City || '',
                zip: s.zip || s.ZIP || '',
              })),
            }),
          })
          const data = await res.json()
          const results = data?.results || []
          await Promise.all(results.map(async (r, idx) => {
            const stop = batch[idx]
            if (r?.lat && r?.lng && stop?.id) {
              await dbUpdate('daily_stops', { lat: r.lat, lng: r.lng }, { id: stop.id })
              updated++
            }
          }))
        } catch {}
      }
      if (updated > 0 && fetchDispatchData) fetchDispatchData(selectedDay)
    }
    batchGeocode()
  }, [drivers])

  // Global handler for popup reassign (popups use raw HTML)
  useEffect(() => {
    window.__dispatchMapMove = async (orderId, fromDriver, toDriver) => {
      if (!toDriver || toDriver === fromDriver || moving) return
      const targetDrv = (drivers || []).find(d => d['Driver Name'] === toDriver)
      if (!targetDrv) return
      setMoving(true)
      try {
        const dateStr = deliveryDate ? `${deliveryDate.getFullYear()}-${String(deliveryDate.getMonth()+1).padStart(2,'0')}-${String(deliveryDate.getDate()).padStart(2,'0')}` : null
        if (!dateStr) return
        const targetNum = String(targetDrv['Driver #'])
        await dbUpdate('daily_stops', { driver_name: toDriver, driver_number: targetNum, assigned_driver_number: targetNum }, { order_id: orderId, delivery_date: dateStr })
        if (fetchDispatchData) fetchDispatchData(selectedDay)
      } catch (e) { console.error('Map move error:', e) }
      finally { setMoving(false) }
    }
    return () => { delete window.__dispatchMapMove }
  }, [drivers, deliveryDate, selectedDay, moving])

  // Assign colors to drivers
  const driverNames = useMemo(() => (drivers || []).filter(d => d.stops > 0).map(d => d['Driver Name']).sort(), [drivers])
  const colorMap = useMemo(() => {
    const m = {}
    driverNames.forEach((name, i) => { m[name] = DRIVER_COLORS[i % DRIVER_COLORS.length] })
    return m
  }, [driverNames])

  function toggleDriver(name) {
    setSelectedDrivers(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  // Initialize map (re-init on style change)
  useEffect(() => {
    if (!containerRef.current) return
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    setMapReady(false)
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLES[styleIdx].url,
      center: [-81.52, 41.08],
      zoom: 10,
    })
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
    map.on('load', () => setMapReady(true))
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [styleIdx])

  // Plot markers + route lines
  useEffect(() => {
    if (!mapRef.current || !mapReady) return
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []
    markerMetaRef.current = []
    if (openPopupRef.current) { openPopupRef.current.remove(); openPopupRef.current = null }

    const bounds = new mapboxgl.LngLatBounds()
    let hasPoints = false
    let count = 0
    let coldC = 0

    for (const driver of (drivers || [])) {
      if (driver.stops === 0) continue
      const name = driver['Driver Name']
      if (selectedDrivers.size > 0 && !selectedDrivers.has(name)) continue
      const color = colorMap[name] || '#6b7280'

      for (const stop of (driver.stopDetails || [])) {
        const stopPharma = stop.pharmacy || stop.Pharmacy || ''
        if (pharmaFilter !== 'all' && stopPharma !== pharmaFilter) continue
        if (coldOnly && !stop.cold_chain && !stop._coldChain) continue

        const lat = stop.lat || stop.latitude
        const lng = stop.lng || stop.longitude
        if (!lat || !lng) continue

        const el = document.createElement('div')
        const isCold = stop.cold_chain || stop._coldChain
        if (isCold) coldC++
        const size = isCold && coldOnly ? 16 : 13
        const pinColor = coldOnly && isCold ? '#2563eb' : color

        el.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background:${pinColor};border:2px solid rgba(255,255,255,0.9);cursor:pointer;box-shadow:0 0 0 1px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.25);`

        const oid = stop.order_id || stop['Order ID'] || ''
        const otherDriverOpts = driverNames.filter(n => n !== name).map(n => `<option value="${n}">${n.split(' ')[0]}</option>`).join('')
        const popup = new mapboxgl.Popup({ offset: 14, closeButton: true, maxWidth: '260px', className: 'dispatch-map-popup' })
          .setHTML(`<div style="font-family:Inter,sans-serif;font-size:12px;line-height:1.5;padding:2px 0">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
              <span style="width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0"></span>
              <strong style="font-size:13px">${stop.patient_name || stop.Name || '—'}</strong>
            </div>
            <div style="color:#374151;margin-bottom:2px">${stop.address || stop.Address || ''}</div>
            <div style="color:#6b7280;font-size:11px">${normalizeCity(stop.city || stop.City) || ''}, ${stop.zip || stop.ZIP || ''}</div>
            <div style="display:flex;align-items:center;gap:6px;margin-top:6px">
              <span style="color:${color};font-weight:600;font-size:11px">${name}</span>
              ${isCold ? '<span style="background:#dbeafe;color:#2563eb;font-weight:600;font-size:10px;padding:1px 6px;border-radius:4px">Cold Chain</span>' : ''}
            </div>
            <div style="margin-top:8px;padding-top:8px;border-top:1px solid #e5e7eb">
              <select onchange="window.__dispatchMapMove('${oid}','${name}',this.value)" style="width:100%;padding:5px 8px;font-size:11px;border:1px solid #d1d5db;border-radius:6px;font-family:inherit;background:#f9fafb;color:#0B1E3D;cursor:pointer">
                <option value="">Move to...</option>
                ${otherDriverOpts}
              </select>
            </div>
          </div>`)

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([lng, lat])
          .addTo(mapRef.current)

        el.addEventListener('click', (e) => {
          if (e.shiftKey || e.metaKey || e.ctrlKey) {
            e.preventDefault()
            e.stopPropagation()
            toggleStopSelection(oid)
            return
          }
          if (popup.isOpen()) { popup.remove(); openPopupRef.current = null; return }
          if (openPopupRef.current) openPopupRef.current.remove()
          popup.setLngLat([lng, lat]).addTo(mapRef.current)
          openPopupRef.current = popup
          if (onStopClick) onStopClick(stop, name)
        })

        markersRef.current.push(marker)
        markerMetaRef.current.push({ stop, driverName: name, marker, el, color: pinColor, lat, lng })
        bounds.extend([lng, lat])
        hasPoints = true
        count++
      }
    }

    // Add pharmacy origin markers
    if (pharmaFilter === 'all' || pharmaFilter === 'SHSP') {
      const shspEl = document.createElement('div')
      shspEl.innerHTML = PHARMACY_ICONS.SHSP
      shspEl.style.cssText = 'cursor:pointer;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));'
      const shspMarker = new mapboxgl.Marker({ element: shspEl })
        .setLngLat([-81.5185, 41.0534])
        .setPopup(new mapboxgl.Popup({ offset: 12 }).setHTML('<div style="font-family:Inter,sans-serif;font-size:12px;font-weight:600">Summa Health System Pharmacy</div>'))
        .addTo(mapRef.current)
      markersRef.current.push(shspMarker)
    }
    if (pharmaFilter === 'all' || pharmaFilter === 'Aultman') {
      const aEl = document.createElement('div')
      aEl.innerHTML = PHARMACY_ICONS.Aultman
      aEl.style.cssText = 'cursor:pointer;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));'
      const aMarker = new mapboxgl.Marker({ element: aEl })
        .setLngLat([-81.3784, 40.7989])
        .setPopup(new mapboxgl.Popup({ offset: 12 }).setHTML('<div style="font-family:Inter,sans-serif;font-size:12px;font-weight:600">Aultman Pharmacy</div>'))
        .addTo(mapRef.current)
      markersRef.current.push(aMarker)
    }

    setPlotCount(count)
    setColdCount(coldC)
    setMapSearch('')
    if (hasPoints) {
      mapRef.current.fitBounds(bounds, { padding: { top: 60, bottom: 60, left: 220, right: 60 }, maxZoom: 13, duration: 800 })
    }
  }, [drivers, mapReady, selectedDrivers, pharmaFilter, coldOnly])

  // Search: highlight matching markers, dim others, fit bounds
  useEffect(() => {
    const q = mapSearch.trim().toLowerCase()
    if (!q) {
      // Reset all markers to normal
      markerMetaRef.current.forEach(m => {
        m.el.style.width = '13px'
        m.el.style.height = '13px'
        m.el.style.background = m.color
        m.el.style.opacity = '1'
        m.el.style.border = '2px solid rgba(255,255,255,0.9)'
        m.el.style.zIndex = ''
      })
      return
    }
    const matchBounds = new mapboxgl.LngLatBounds()
    let hasMatch = false
    markerMetaRef.current.forEach(m => {
      const addr = (m.stop.address || m.stop.Address || '').toLowerCase()
      const city = normalizeCity(m.stop.city || m.stop.City).toLowerCase()
      const zip = (m.stop.zip || m.stop.ZIP || '').toLowerCase()
      const name = (m.stop.patient_name || m.stop.Name || '').toLowerCase()
      const isMatch = addr.includes(q) || city.includes(q) || zip.includes(q) || name.includes(q)
      if (isMatch) {
        m.el.style.width = '16px'
        m.el.style.height = '16px'
        m.el.style.background = '#f59e0b'
        m.el.style.opacity = '1'
        m.el.style.border = '2px solid #fff'
        m.el.style.zIndex = '10'
        matchBounds.extend([m.lng, m.lat])
        hasMatch = true
      } else {
        m.el.style.width = '10px'
        m.el.style.height = '10px'
        m.el.style.background = m.color
        m.el.style.opacity = '0.2'
        m.el.style.border = '1px solid rgba(255,255,255,0.4)'
        m.el.style.zIndex = ''
      }
    })
    if (hasMatch && mapRef.current) {
      mapRef.current.fitBounds(matchBounds, { padding: { top: 80, bottom: 60, left: 220, right: 60 }, maxZoom: 15, duration: 600 })
    }
  }, [mapSearch])

  // Batch selection: highlight selected markers with a ring
  useEffect(() => {
    markerMetaRef.current.forEach(m => {
      const oid = m.stop.order_id || m.stop['Order ID']
      if (selectedStops.has(oid)) {
        m.el.style.boxShadow = '0 0 0 3px #f59e0b, 0 0 0 6px rgba(245,158,11,0.35), 0 2px 6px rgba(0,0,0,0.25)'
        m.el.style.zIndex = '20'
      } else {
        m.el.style.boxShadow = '0 0 0 1px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.25)'
      }
    })
  }, [selectedStops, plotCount, mapSearch])

  // Shift-drag box-select: replace default box-zoom with rectangular marker selection
  useEffect(() => {
    if (!mapReady || !mapRef.current || !containerRef.current) return
    const map = mapRef.current
    const container = containerRef.current
    map.boxZoom.disable()

    let start = null
    let boxEl = null

    const onMove = (e) => {
      if (!start || !boxEl) return
      const rect = container.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const left = Math.min(start.x, x), top = Math.min(start.y, y)
      const w = Math.abs(x - start.x), h = Math.abs(y - start.y)
      boxEl.style.left = left + 'px'
      boxEl.style.top = top + 'px'
      boxEl.style.width = w + 'px'
      boxEl.style.height = h + 'px'
    }

    const onUp = (e) => {
      if (!start) return
      const rect = container.getBoundingClientRect()
      const x = e.clientX - rect.left, y = e.clientY - rect.top
      const minX = Math.min(start.x, x), maxX = Math.max(start.x, x)
      const minY = Math.min(start.y, y), maxY = Math.max(start.y, y)
      if (boxEl && boxEl.parentNode) boxEl.parentNode.removeChild(boxEl)
      boxEl = null
      start = null
      map.dragPan.enable()
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      if ((maxX - minX) < 5 && (maxY - minY) < 5) return
      const additions = []
      markerMetaRef.current.forEach(m => {
        const p = map.project([m.lng, m.lat])
        if (p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY) {
          const oid = m.stop.order_id || m.stop['Order ID']
          if (oid) additions.push(oid)
        }
      })
      if (!additions.length) return
      setSelectedStops(prev => {
        const next = new Set(prev)
        additions.forEach(id => next.add(id))
        return next
      })
    }

    const onDown = (e) => {
      if (!e.shiftKey) return
      // Ignore drags that start on a marker element
      if (e.target && e.target !== container && e.target.closest && e.target.closest('.mapboxgl-marker')) return
      e.preventDefault()
      const rect = container.getBoundingClientRect()
      start = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      boxEl = document.createElement('div')
      boxEl.style.cssText = `position:absolute;left:${start.x}px;top:${start.y}px;width:0;height:0;border:2px dashed #f59e0b;background:rgba(245,158,11,0.15);pointer-events:none;z-index:100;border-radius:2px;`
      container.appendChild(boxEl)
      map.dragPan.disable()
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    }

    container.addEventListener('mousedown', onDown)
    return () => {
      container.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      if (boxEl && boxEl.parentNode) boxEl.parentNode.removeChild(boxEl)
      if (map && map.boxZoom) map.boxZoom.enable()
    }
  }, [mapReady])

  // Search results for dropdown
  const searchResults = useMemo(() => {
    const q = mapSearch.trim().toLowerCase()
    if (!q || q.length < 2) return []
    return markerMetaRef.current
      .filter(m => {
        const addr = (m.stop.address || m.stop.Address || '').toLowerCase()
        const city = normalizeCity(m.stop.city || m.stop.City).toLowerCase()
        const zip = (m.stop.zip || m.stop.ZIP || '').toLowerCase()
        const name = (m.stop.patient_name || m.stop.Name || '').toLowerCase()
        return addr.includes(q) || city.includes(q) || zip.includes(q) || name.includes(q)
      })
      .slice(0, 8)
  }, [mapSearch])

  function flyToStop(meta) {
    if (!mapRef.current) return
    mapRef.current.flyTo({ center: [meta.lng, meta.lat], zoom: 16, duration: 800 })
    setTimeout(() => { meta.marker.togglePopup() }, 850)
    setMapSearch('')
    setSearchFocused(false)
  }

  // Compute active driver count and filtered names
  const filteredDriverNames = useMemo(() => {
    if (pharmaFilter === 'all') return driverNames
    return driverNames.filter(name => {
      const drv = (drivers || []).find(d => d['Driver Name'] === name)
      return (drv?.stopDetails || []).some(s => (s.pharmacy || s.Pharmacy || '') === pharmaFilter)
    })
  }, [driverNames, drivers, pharmaFilter])

  // Filtered stop count per driver (respects pharmacy + cold chain filter)
  const filteredStopCount = useMemo(() => {
    const counts = {}
    for (const name of driverNames) {
      const drv = (drivers || []).find(d => d['Driver Name'] === name)
      let c = 0
      for (const s of (drv?.stopDetails || [])) {
        const sp = s.pharmacy || s.Pharmacy || ''
        if (pharmaFilter !== 'all' && sp !== pharmaFilter) continue
        if (coldOnly && !s.cold_chain && !s._coldChain) continue
        c++
      }
      counts[name] = c
    }
    return counts
  }, [driverNames, drivers, pharmaFilter, coldOnly])

  const activeDriverCount = selectedDrivers.size > 0 ? selectedDrivers.size : filteredDriverNames.length

  return (
    <div style={{ position: 'relative', height: 'calc(100vh - 200px)', minHeight: 500, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(229,231,235,0.5)' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Driver legend + filters — glass panel */}
      <div style={{
        position: 'absolute', top: 12, left: 12,
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        borderRadius: 12, padding: '10px 6px', maxHeight: 'calc(100% - 24px)', overflowY: 'auto',
        boxShadow: '0 4px 24px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.06)',
        minWidth: 170, border: '1px solid rgba(255,255,255,0.6)',
      }}>

        {/* Pharmacy filter tabs */}
        <div style={{ display: 'flex', gap: 3, padding: '0 6px', marginBottom: 8 }}>
          {['all', 'SHSP', 'Aultman'].map(p => (
            <button key={p} onClick={() => setPharmaFilter(p)} style={{
              flex: 1, padding: '4px 0', fontSize: 10, fontWeight: pharmaFilter === p ? 700 : 500, letterSpacing: '0.02em',
              color: pharmaFilter === p ? '#fff' : '#6b7280',
              background: pharmaFilter === p ? (p === 'Aultman' ? '#16a34a' : p === 'SHSP' ? '#2563eb' : '#0B1E3D') : '#f1f5f9',
              border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all 0.15s ease',
            }}>
              {p === 'all' ? 'All' : p}
            </button>
          ))}
        </div>

        {/* Cold chain + route lines toggles */}
        <div style={{ display: 'flex', gap: 4, padding: '0 6px', marginBottom: 6 }}>
          <div
            onClick={() => setColdOnly(!coldOnly)}
            style={{
              flex: 1, padding: '4px 8px', fontSize: 10, fontWeight: 600,
              color: coldOnly ? '#2563eb' : '#9ca3af', cursor: 'pointer', borderRadius: 6,
              background: coldOnly ? '#dbeafe' : '#f8fafc',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
              transition: 'all 0.15s ease', border: coldOnly ? '1px solid #bfdbfe' : '1px solid transparent',
            }}
          >
            <span style={{ fontSize: 11 }}>&#10052;</span> Cold
          </div>
        </div>

        <div style={{ height: 1, background: '#e5e7eb', margin: '2px 8px 6px' }} />

        {/* All Drivers button */}
        <div
          style={{
            padding: '5px 10px', fontSize: 11, fontWeight: 600,
            color: selectedDrivers.size === 0 ? '#0B1E3D' : '#6b7280',
            cursor: 'pointer', borderRadius: 6,
            background: selectedDrivers.size === 0 ? '#f1f5f9' : 'transparent',
            marginBottom: 2, transition: 'all 0.15s ease',
          }}
          onClick={() => setSelectedDrivers(new Set())}
        >
          All Drivers ({filteredDriverNames.length})
        </div>

        {/* Driver list */}
        {filteredDriverNames.map(name => {
          const isOn = selectedDrivers.has(name)
          const stopCount = filteredStopCount[name] || 0
          return (
            <div
              key={name}
              style={{
                padding: '5px 10px', fontSize: 11, fontWeight: isOn ? 700 : 500,
                color: isOn ? colorMap[name] : '#374151',
                cursor: 'pointer', borderRadius: 6,
                background: isOn ? `${colorMap[name]}12` : 'transparent',
                display: 'flex', alignItems: 'center', gap: 7,
                transition: 'all 0.15s ease',
              }}
              onClick={() => toggleDriver(name)}
            >
              <span style={{
                width: 9, height: 9, borderRadius: '50%',
                background: colorMap[name], flexShrink: 0,
                opacity: isOn || selectedDrivers.size === 0 ? 1 : 0.3,
                boxShadow: isOn ? `0 0 0 2px ${colorMap[name]}30` : 'none',
                transition: 'all 0.15s ease',
              }} />
              <span style={{ flex: 1 }}>{name.split(' ')[0]}</span>
              <span style={{ color: '#9ca3af', fontWeight: 500, fontSize: 10 }}>{stopCount}</span>
            </div>
          )
        })}
      </div>

      {/* Map search — top right */}
      <div style={{ position: 'absolute', top: 12, right: 60, zIndex: 5 }}>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            value={mapSearch}
            onChange={e => setMapSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
            placeholder="Search stops..."
            style={{
              width: 220, padding: '8px 12px 8px 32px', fontSize: 12,
              fontFamily: 'inherit', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 8, background: 'rgba(0,0,0,0.65)', color: '#fff',
              backdropFilter: 'blur(8px)', outline: 'none',
              boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            }}
          />
          <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
          </svg>
          {mapSearch && (
            <div onClick={() => setMapSearch('')} style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              cursor: 'pointer', color: 'rgba(255,255,255,0.5)', fontSize: 14, lineHeight: 1,
            }}>&#215;</div>
          )}
        </div>
        {/* Search results dropdown */}
        {searchFocused && searchResults.length > 0 && (
          <div style={{
            marginTop: 4, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)',
            borderRadius: 8, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            border: '1px solid rgba(229,231,235,0.6)', maxHeight: 280, overflowY: 'auto',
          }}>
            <div style={{ padding: '6px 10px', fontSize: 9, fontWeight: 600, color: '#9ca3af', letterSpacing: '0.05em', borderBottom: '1px solid #f1f5f9' }}>
              {searchResults.length} MATCH{searchResults.length !== 1 ? 'ES' : ''}
            </div>
            {searchResults.map((m, i) => (
              <div
                key={i}
                onMouseDown={() => flyToStop(m)}
                style={{
                  padding: '8px 10px', cursor: 'pointer', borderBottom: '1px solid #f8fafc',
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.color, flexShrink: 0, marginTop: 3 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#0B1E3D', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {m.stop.patient_name || m.stop.Name || '—'}
                  </div>
                  <div style={{ fontSize: 10, color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {m.stop.address || m.stop.Address || ''}, {normalizeCity(m.stop.city || m.stop.City) || ''} {m.stop.zip || m.stop.ZIP || ''}
                  </div>
                  <div style={{ fontSize: 9, color: m.color, fontWeight: 600, marginTop: 1 }}>{m.driverName}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Style toggle — bottom right */}
      <div style={{
        position: 'absolute', bottom: 12, right: 60,
        display: 'flex', gap: 2,
        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)',
        borderRadius: 8, padding: 3,
      }}>
        {MAP_STYLES.map((s, i) => (
          <button key={s.key} onClick={() => setStyleIdx(i)} style={{
            padding: '4px 10px', fontSize: 10, fontWeight: styleIdx === i ? 700 : 500,
            color: styleIdx === i ? '#fff' : 'rgba(255,255,255,0.5)',
            background: styleIdx === i ? 'rgba(255,255,255,0.2)' : 'transparent',
            border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
            transition: 'all 0.15s ease', letterSpacing: '0.02em',
          }}>{s.label}</button>
        ))}
      </div>

      {/* Stats bar — top center */}
      <div style={{
        position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 0,
        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)',
        borderRadius: 8, overflow: 'hidden',
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
      }}>
        <div style={{ padding: '6px 16px', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', lineHeight: 1 }}>{plotCount}</div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', fontWeight: 500, marginTop: 2, letterSpacing: '0.05em' }}>STOPS</div>
        </div>
        <div style={{ padding: '6px 16px', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#60A5FA', lineHeight: 1 }}>{coldCount}</div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', fontWeight: 500, marginTop: 2, letterSpacing: '0.05em' }}>COLD</div>
        </div>
        <div style={{ padding: '6px 16px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', lineHeight: 1 }}>{activeDriverCount}</div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', fontWeight: 500, marginTop: 2, letterSpacing: '0.05em' }}>DRIVERS</div>
        </div>
      </div>

      {/* Batch selection bar — bottom center */}
      {selectedStops.size > 0 && (() => {
        const selectedDetails = []
        for (const meta of markerMetaRef.current) {
          const oid = meta.stop.order_id || meta.stop['Order ID']
          if (oid && selectedStops.has(oid)) selectedDetails.push({ stop: meta.stop, driverName: meta.driverName, color: meta.color })
        }
        return (
        <div style={{
          position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', flexDirection: 'column', gap: 6, zIndex: 10,
          background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
          borderRadius: 10, padding: '8px 12px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
          maxWidth: 520, minWidth: 380,
        }}>
          {selectedDetails.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 168, overflowY: 'auto', paddingRight: 4 }}>
              {selectedDetails.map(({ stop, driverName, color }, i) => (
                <div key={(stop.order_id || stop['Order ID'] || i) + '-' + i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#fff', lineHeight: 1.35 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {stop.patient_name || stop.Name || '—'}
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {stop.address || stop.Address || ''} · {normalizeCity(stop.city || stop.City) || ''} {stop.zip || stop.ZIP || ''}
                    </div>
                  </div>
                  <span style={{ color, fontSize: 11, fontWeight: 600, flexShrink: 0 }}>{driverName}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#fff', fontSize: 12, fontWeight: 600, letterSpacing: '0.02em' }}>
            {selectedStops.size} stop{selectedStops.size !== 1 ? 's' : ''} selected
          </span>
          <select value={batchTarget} onChange={e => setBatchTarget(e.target.value)} style={{
            padding: '6px 10px', fontSize: 12, borderRadius: 6, border: 'none',
            background: 'rgba(255,255,255,0.15)', color: '#fff', fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
          }}>
            <option value="" style={{ color: '#000' }}>Move to…</option>
            {driverNames.map(n => (
              <option key={n} value={n} style={{ color: '#000' }}>{n}</option>
            ))}
          </select>
          <button onClick={handleBatchMove} disabled={!batchTarget || batchMoving} style={{
            padding: '6px 14px', fontSize: 12, fontWeight: 700, borderRadius: 6, border: 'none',
            background: batchTarget && !batchMoving ? '#f59e0b' : 'rgba(255,255,255,0.1)',
            color: batchTarget && !batchMoving ? '#fff' : 'rgba(255,255,255,0.5)',
            cursor: batchTarget && !batchMoving ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
          }}>
            {batchMoving ? 'Moving…' : 'Move'}
          </button>
          <button onClick={clearSelection} style={{
            padding: '6px 10px', fontSize: 12, borderRadius: 6, border: 'none',
            background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.85)', cursor: 'pointer', fontFamily: 'inherit',
          }}>
            Clear
          </button>
          </div>
        </div>
        )
      })()}
    </div>
  )
}
