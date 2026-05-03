import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './DeliveryMap.css'

const NE_OHIO = [40.95, -81.45]
const PHARMACY_ORIGINS = {
  SHSP: { lat: 41.0758, lng: -81.5193, label: 'SHSP — 70 Arch St, Akron' },
  Aultman: { lat: 40.7914, lng: -81.3939, label: 'Aultman — 2600 6th St SW, Canton' },
}

const DRIVER_COLORS = {
  Bobby:'#3b82f6', Jake:'#ef4444', Adam:'#f59e0b', Theresa:'#8b5cf6',
  Nick:'#06b6d4', Rob:'#84cc16', Josh:'#f97316', Alex:'#ec4899',
  Dom:'#0ea5e9', Mark:'#14b8a6', Mike:'#a855f7', Tara:'#e11d48',
  Nicholas:'#65a30d', Laura:'#0891b2', Kasey:'#d946ef', Brad:'#78716c',
}

export default function DeliveryMap() {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const markersLayer = useRef(null)
  const [stops, setStops] = useState([])
  const [loading, setLoading] = useState(true)
  const [timePeriod, setTimePeriod] = useState('today')
  const [colorBy, setColorBy] = useState('driver') // driver, pharmacy
  const [selectedStop, setSelectedStop] = useState(null)

  useEffect(() => { loadData() }, [timePeriod])

  async function loadData() {
    setLoading(true)
    try {
      if (timePeriod === 'today') {
        const { data: latest } = await supabase.from('daily_stops').select('delivery_date').order('delivery_date', { ascending: false }).limit(1)
        const dateStr = latest?.[0]?.delivery_date || new Date().toISOString().split('T')[0]
        const { data } = await supabase.from('daily_stops')
          .select('order_id, patient_name, address, city, zip, pharmacy, driver_name, cold_chain, lat, lng')
          .eq('delivery_date', dateStr)
        setStops(data || [])
      } else {
        let query = supabase.from('daily_stops')
          .select('order_id, patient_name, address, city, zip, pharmacy, driver_name, delivery_date, cold_chain, lat, lng')
          .not('address', 'is', null).not('lat', 'is', null)

        if (timePeriod === 'week') {
          const d = new Date(); d.setDate(d.getDate() - 7)
          query = query.gte('delivery_date', d.toISOString().split('T')[0])
        } else if (timePeriod === 'month') {
          const d = new Date(); d.setDate(d.getDate() - 30)
          query = query.gte('delivery_date', d.toISOString().split('T')[0])
        }
        query = query.order('delivery_date', { ascending: false }).limit(3000)
        const { data } = await query
        setStops(data || [])
      }
    } catch (err) { console.error('Map error:', err) }
    finally { setLoading(false) }
  }

  // Geocode stops that don't have lat/lng via server-side /api/geocode (HIPAA-safe)
  useEffect(() => {
    const needGeocode = stops.filter(s => !s.lat && s.address)
    if (needGeocode.length === 0) return

    let cancelled = false
    async function geocodeBatch() {
      const batch = needGeocode.slice(0, 25)
      try {
        const res = await fetch('/api/geocode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ addresses: batch.map(s => ({ address: s.address, city: s.city, zip: s.zip })) }),
        })
        const { results } = await res.json()
        if (cancelled || !results) return

        for (let i = 0; i < batch.length; i++) {
          const { lat, lng } = results[i] || {}
          if (lat && lng) {
            batch[i].lat = lat
            batch[i].lng = lng
            const table = timePeriod === 'today' ? 'daily_stops' : 'orders'
            supabase.from(table).update({ lat, lng }).eq('order_id', batch[i].order_id)
          }
        }
        if (!cancelled) setStops([...stops])
      } catch {}
    }
    geocodeBatch()
    return () => { cancelled = true }
  }, [stops.length])

  // Init map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return
    const map = L.map(mapRef.current, { center: NE_OHIO, zoom: 10, zoomControl: true, scrollWheelZoom: true })
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 19,
    }).addTo(map)

    Object.entries(PHARMACY_ORIGINS).forEach(([name, pos]) => {
      L.marker([pos.lat, pos.lng], {
        icon: L.divIcon({ className: 'map__pharmacy-marker', html: `<div class="map__pharmacy-pin">${name === 'SHSP' ? '💊' : '🏥'}</div>`, iconSize: [32, 32], iconAnchor: [16, 16] }),
      }).addTo(map).bindTooltip(pos.label, { direction: 'top', offset: [0, -16] })
    })

    markersLayer.current = L.layerGroup().addTo(map)
    mapInstance.current = map
    return () => { map.remove(); mapInstance.current = null }
  }, [])

  // Update markers
  useEffect(() => {
    if (!markersLayer.current) return
    markersLayer.current.clearLayers()

    const geocoded = stops.filter(s => s.lat && s.lng)
    geocoded.forEach(s => {
      const color = colorBy === 'driver'
        ? (DRIVER_COLORS[s.driver_name] || '#6b7280')
        : (s.pharmacy === 'Aultman' ? '#4ADE80' : '#6495ED')

      const marker = L.circleMarker([s.lat, s.lng], {
        radius: 6, fillColor: color, fillOpacity: 0.8,
        color: '#fff', weight: 1.5, opacity: 0.9,
      })

      marker.bindTooltip(`
        <div class="map__tip">
          <strong>${s.address}</strong><br/>
          ${s.city}, OH ${s.zip}<br/>
          <span class="map__tip-row">Driver: <b>${s.driver_name}</b></span>
          <span class="map__tip-row">Pharmacy: <b>${s.pharmacy}</b></span>
          ${s.cold_chain ? '<span class="map__tip-row"><b>Cold Chain</b></span>' : ''}
        </div>
      `, { direction: 'top', offset: [0, -8], className: 'map__tooltip' })

      marker.on('click', () => setSelectedStop(s))
      marker.addTo(markersLayer.current)
    })
  }, [stops, colorBy])

  const geocodedCount = stops.filter(s => s.lat).length
  const drivers = [...new Set(stops.map(s => s.driver_name))].sort()

  return (
    <div className="map__container">
      <div className="map__header">
        <h3 className="map__title">Delivery Map</h3>
        <div className="map__time-filters">
          {[['today', 'Today'], ['week', 'Week'], ['month', 'Month'], ['all', 'All']].map(([key, label]) => (
            <button key={key} className={`map__time-btn ${timePeriod === key ? 'map__time-btn--active' : ''}`}
              onClick={() => setTimePeriod(key)}>{label}</button>
          ))}
        </div>
        <div className="map__time-filters">
          {[['driver', 'By Driver'], ['pharmacy', 'By Pharmacy']].map(([key, label]) => (
            <button key={key} className={`map__time-btn ${colorBy === key ? 'map__time-btn--active' : ''}`}
              onClick={() => setColorBy(key)}>{label}</button>
          ))}
        </div>
      </div>

      {loading && <div className="map__loading"><div className="dispatch__spinner" />Loading...</div>}

      <div className="map__wrap">
        <div ref={mapRef} className="map__canvas" />

        {selectedStop && (
          <div className="map__panel">
            <div className="map__panel-header">
              <h4>{selectedStop.address}</h4>
              <button className="map__panel-close" onClick={() => setSelectedStop(null)}>&#10005;</button>
            </div>
            <p className="map__panel-city">{selectedStop.city}, OH {selectedStop.zip}</p>
            <p style={{ fontSize: 14, margin: '8px 0' }}><strong>{selectedStop.driver_name}</strong> — {selectedStop.pharmacy}</p>
            <p style={{ fontSize: 13, color: 'var(--gray-500)' }}>#{selectedStop.order_id} {selectedStop.patient_name}</p>
            {selectedStop.cold_chain && <span style={{ display: 'inline-block', padding: '2px 8px', background: '#eef4ff', color: '#3b82f6', borderRadius: 4, fontSize: 12, fontWeight: 600, marginTop: 8 }}>Cold Chain</span>}
          </div>
        )}
      </div>

      <div className="map__legend">
        {colorBy === 'driver' ? (
          drivers.filter(n => DRIVER_COLORS[n]).map(name => (
            <span className="map__legend-item" key={name}>
              <span className="map__legend-dot map__legend-dot--md" style={{ background: DRIVER_COLORS[name] }} />{name}
            </span>
          ))
        ) : (
          <>
            <span className="map__legend-item"><span className="map__legend-dot map__legend-dot--md" style={{ background: '#6495ED' }} />SHSP</span>
            <span className="map__legend-item"><span className="map__legend-dot map__legend-dot--md" style={{ background: '#4ADE80' }} />Aultman</span>
          </>
        )}
        <span className="map__legend-count">{geocodedCount} of {stops.length} mapped</span>
      </div>
    </div>
  )
}
