import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './DeliveryMap.css'

const AKRON = [41.0814, -81.519]
const PHARMACY_ORIGINS = {
  SHSP: { lat: 41.0758, lng: -81.5193, label: 'SHSP — 70 Arch St, Akron' },
  Aultman: { lat: 40.7914, lng: -81.3939, label: 'Aultman — 2600 6th St SW, Canton' },
}

export default function DeliveryMap() {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const markersLayer = useRef(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // all, SHSP, Aultman, coldchain
  const [selectedLocation, setSelectedLocation] = useState(null)

  useEffect(() => {
    async function loadMapData() {
      try {
        const { data: orders } = await supabase.from('orders')
          .select('order_id, patient_name, address, city, zip, pharmacy, driver_name, date_delivered, cold_chain')
          .not('address', 'is', null).not('address', 'eq', '')

        // Aggregate by address
        const locationMap = {}
        for (const row of (orders || [])) {
          const key = `${row.address}|${row.city}|${row.zip}`
          if (!locationMap[key]) {
            locationMap[key] = {
              address: row.address, city: row.city, zip: row.zip,
              pharmacy: row.pharmacy, totalDeliveries: 0, coldChainCount: 0,
              lastDate: '', orders: [],
            }
          }
          const loc = locationMap[key]
          loc.totalDeliveries++
          if (row.cold_chain) loc.coldChainCount++
          if ((row.date_delivered || '') > loc.lastDate) loc.lastDate = row.date_delivered
          if (loc.orders.length < 20) {
            loc.orders.push({
              orderId: row.order_id, name: row.patient_name,
              date: row.date_delivered, driver: row.driver_name,
              pharmacy: row.pharmacy, coldChain: row.cold_chain,
            })
          }
        }

        // For now, no geocoding from frontend — just show locations that have ZIP-based approximate coords
        // The map will show data once geocoded coords are available
        const locations = Object.values(locationMap).map(loc => ({
          ...loc,
          coldChainPct: loc.totalDeliveries ? Math.round((loc.coldChainCount / loc.totalDeliveries) * 100) : 0,
        }))

        setData({
          locations: [], // No geocoded coords available from frontend yet
          totalLocations: locations.length,
          geocodedLocations: 0,
        })
      } catch {}
      finally { setLoading(false) }
    }
    loadMapData()
  }, [])

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return

    const map = L.map(mapRef.current, {
      center: AKRON,
      zoom: 10,
      zoomControl: true,
      scrollWheelZoom: true,
    })

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 19,
    }).addTo(map)

    // Add pharmacy origin markers
    Object.entries(PHARMACY_ORIGINS).forEach(([name, pos]) => {
      L.marker([pos.lat, pos.lng], {
        icon: L.divIcon({
          className: 'map__pharmacy-marker',
          html: `<div class="map__pharmacy-pin">${name === 'SHSP' ? '💊' : '🏥'}</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        }),
      })
        .addTo(map)
        .bindTooltip(pos.label, { direction: 'top', offset: [0, -16] })
    })

    markersLayer.current = L.layerGroup().addTo(map)
    mapInstance.current = map

    return () => { map.remove(); mapInstance.current = null }
  }, [])

  // Update markers when data or filter changes
  useEffect(() => {
    if (!markersLayer.current || !data?.locations) return

    markersLayer.current.clearLayers()

    const filtered = data.locations.filter(loc => {
      if (filter === 'SHSP') return loc.pharmacy === 'SHSP'
      if (filter === 'Aultman') return loc.pharmacy === 'Aultman'
      if (filter === 'coldchain') return loc.coldChainCount > 0
      return true
    })

    filtered.forEach(loc => {
      const size = loc.totalDeliveries >= 16 ? 14 : loc.totalDeliveries >= 6 ? 10 : 6
      const color = loc.pharmacy === 'Aultman' ? '#4ADE80' : '#6495ED'
      const opacity = loc.totalDeliveries >= 6 ? 0.85 : 0.65

      const marker = L.circleMarker([loc.lat, loc.lng], {
        radius: size,
        fillColor: color,
        fillOpacity: opacity,
        color: '#fff',
        weight: 1.5,
        opacity: 0.9,
      })

      marker.bindTooltip(`
        <div class="map__tip">
          <strong>${loc.address}</strong><br/>
          ${loc.city}, OH ${loc.zip}<br/>
          <span class="map__tip-row">Deliveries: <b>${loc.totalDeliveries}</b></span>
          ${loc.coldChainCount > 0 ? `<span class="map__tip-row">Cold Chain: <b>${loc.coldChainPct}%</b> (${loc.coldChainCount})</span>` : ''}
          <span class="map__tip-row">Pharmacy: <b>${loc.pharmacy}</b></span>
          <span class="map__tip-row">Last: <b>${loc.lastDate}</b></span>
        </div>
      `, { direction: 'top', offset: [0, -8], className: 'map__tooltip' })

      marker.on('click', () => setSelectedLocation(loc))

      marker.addTo(markersLayer.current)
    })
  }, [data, filter])

  const stats = data ? {
    total: data.locations?.length || 0,
    shsp: data.locations?.filter(l => l.pharmacy === 'SHSP').length || 0,
    aultman: data.locations?.filter(l => l.pharmacy === 'Aultman').length || 0,
    coldchain: data.locations?.filter(l => l.coldChainCount > 0).length || 0,
  } : {}

  return (
    <div className="map__container">
      <div className="map__header">
        <h3 className="map__title">Delivery Map</h3>
        <div className="map__filters">
          {[
            ['all', `All (${stats.total})`],
            ['SHSP', `SHSP (${stats.shsp})`],
            ['Aultman', `Aultman (${stats.aultman})`],
            ['coldchain', `Cold Chain (${stats.coldchain})`],
          ].map(([key, label]) => (
            <button
              key={key}
              className={`map__filter-btn ${filter === key ? 'map__filter-btn--active' : ''} ${key === 'SHSP' ? 'map__filter-btn--shsp' : ''} ${key === 'Aultman' ? 'map__filter-btn--aultman' : ''}`}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="map__loading">
          <div className="dispatch__spinner" />
          Loading delivery locations...
        </div>
      )}

      <div className="map__wrap">
        <div ref={mapRef} className="map__canvas" />

        {/* Side panel */}
        {selectedLocation && (
          <div className="map__panel">
            <div className="map__panel-header">
              <h4>{selectedLocation.address}</h4>
              <button className="map__panel-close" onClick={() => setSelectedLocation(null)}>✕</button>
            </div>
            <p className="map__panel-city">{selectedLocation.city}, OH {selectedLocation.zip}</p>

            <div className="map__panel-stats">
              <div className="map__panel-stat">
                <span className="map__panel-stat-val">{selectedLocation.totalDeliveries}</span>
                <span className="map__panel-stat-label">Total</span>
              </div>
              <div className="map__panel-stat">
                <span className="map__panel-stat-val map__panel-stat-val--cc">{selectedLocation.coldChainCount}</span>
                <span className="map__panel-stat-label">Cold Chain</span>
              </div>
              <div className="map__panel-stat">
                <span className="map__panel-stat-val">{selectedLocation.coldChainPct}%</span>
                <span className="map__panel-stat-label">CC Rate</span>
              </div>
            </div>

            <span className={`map__panel-pharma ${selectedLocation.pharmacy === 'SHSP' ? 'map__panel-pharma--shsp' : 'map__panel-pharma--aultman'}`}>
              {selectedLocation.pharmacy}
            </span>

            <h5 className="map__panel-section">Delivery History</h5>
            <div className="map__panel-orders">
              {selectedLocation.orders.map((o, i) => (
                <div className="map__panel-order" key={i}>
                  <div className="map__panel-order-top">
                    <span className="map__panel-order-id">#{o.orderId}</span>
                    <span className="map__panel-order-date">{o.date}</span>
                  </div>
                  <div className="map__panel-order-bottom">
                    <span>{o.name}</span>
                    <span className="map__panel-order-driver">{o.driver}</span>
                    {o.coldChain && <span className="map__panel-order-cc">❄️</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {data && (
        <div className="map__legend">
          <span className="map__legend-item"><span className="map__legend-dot map__legend-dot--shsp map__legend-dot--sm" />1-5 deliveries</span>
          <span className="map__legend-item"><span className="map__legend-dot map__legend-dot--shsp map__legend-dot--md" />6-15 deliveries</span>
          <span className="map__legend-item"><span className="map__legend-dot map__legend-dot--shsp map__legend-dot--lg" />16+ deliveries</span>
          <span className="map__legend-item"><span className="map__legend-dot map__legend-dot--shsp map__legend-dot--md" />SHSP</span>
          <span className="map__legend-item"><span className="map__legend-dot map__legend-dot--aultman map__legend-dot--md" />Aultman</span>
          <span>💊 SHSP origin</span>
          <span>🏥 Aultman origin</span>
          <span className="map__legend-count">{data.geocodedLocations?.toLocaleString()} of {data.totalLocations?.toLocaleString()} addresses mapped</span>
        </div>
      )}
    </div>
  )
}
