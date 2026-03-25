import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './DeliveryMap.css'

const NE_OHIO = [40.95, -81.45]
const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
const PHARMACY_ORIGINS = {
  SHSP: { lat: 41.0758, lng: -81.5193, label: 'SHSP — 70 Arch St, Akron' },
  Aultman: { lat: 40.7914, lng: -81.3939, label: 'Aultman — 2600 6th St SW, Canton' },
}

// Geocode via Google Maps and cache in Supabase
async function geocodeAndCache(address, city, zip, table, id) {
  if (!MAPS_KEY || !address) return null
  const query = encodeURIComponent(`${address}, ${city}, OH ${zip}`)
  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${MAPS_KEY}`)
    const data = await res.json()
    if (data.results?.[0]) {
      const { lat, lng } = data.results[0].geometry.location
      // Cache in Supabase
      await supabase.from(table).update({ lat, lng }).eq('id', id)
      return { lat, lng }
    }
  } catch {}
  return null
}

export default function DeliveryMap() {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const markersLayer = useRef(null)
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [timePeriod, setTimePeriod] = useState('today')
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [geocodeProgress, setGeocodeProgress] = useState('')

  useEffect(() => { loadData() }, [timePeriod])

  async function loadData() {
    setLoading(true)
    setGeocodeProgress('')
    try {
      let rows = []
      let table = 'orders'

      if (timePeriod === 'today') {
        table = 'daily_stops'
        const now = new Date()
        const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
        const { data } = await supabase.from('daily_stops')
          .select('id, order_id, patient_name, address, city, zip, pharmacy, driver_name, delivery_date, cold_chain, lat, lng')
          .eq('delivery_date', today)
        rows = data || []
      } else {
        let query = supabase.from('orders')
          .select('id, order_id, patient_name, address, city, zip, pharmacy, driver_name, date_delivered, cold_chain, lat, lng')
          .not('address', 'is', null).not('address', 'eq', '')

        if (timePeriod === 'week') {
          const d = new Date(); d.setDate(d.getDate() - 7)
          query = query.gte('date_delivered', d.toISOString().split('T')[0])
        } else if (timePeriod === 'month') {
          const d = new Date(); d.setDate(d.getDate() - 30)
          query = query.gte('date_delivered', d.toISOString().split('T')[0])
        }
        const { data } = await query
        rows = data || []
      }

      // Split into geocoded and needing geocoding
      const geocoded = rows.filter(r => r.lat && r.lng)
      const needsGeocode = rows.filter(r => !r.lat && r.address)

      // Build locations from already-geocoded rows
      const locs = buildLocations(geocoded, timePeriod === 'today')
      setLocations(locs)
      setLoading(false)

      // Geocode missing addresses in background (max 50 per load)
      if (needsGeocode.length > 0 && MAPS_KEY) {
        const batch = needsGeocode.slice(0, 50)
        setGeocodeProgress(`Geocoding ${batch.length} of ${needsGeocode.length} addresses...`)
        const newLocs = [...locs]

        for (let i = 0; i < batch.length; i++) {
          const row = batch[i]
          const result = await geocodeAndCache(row.address, row.city, row.zip, table, row.id)
          if (result) {
            newLocs.push({
              address: row.address, city: row.city, zip: row.zip,
              pharmacy: row.pharmacy, driver: row.driver_name,
              lat: result.lat, lng: result.lng,
              totalDeliveries: 1,
              coldChainCount: row.cold_chain ? 1 : 0,
              coldChainPct: row.cold_chain ? 100 : 0,
              lastDate: (timePeriod === 'today' ? row.delivery_date : row.date_delivered) || '',
              orders: [{ orderId: row.order_id, name: row.patient_name, date: row.date_delivered || row.delivery_date, driver: row.driver_name, pharmacy: row.pharmacy, coldChain: row.cold_chain }],
            })
          }
          if ((i + 1) % 10 === 0) {
            setLocations([...newLocs])
            setGeocodeProgress(`Geocoded ${i + 1} of ${batch.length}...`)
          }
        }
        setLocations(newLocs)
        setGeocodeProgress(`${newLocs.length} locations mapped`)
      }
    } catch (err) {
      console.error('Map error:', err)
      setLoading(false)
    }
  }

  function buildLocations(rows, isDaily) {
    const locationMap = {}
    for (const row of rows) {
      if (!row.lat || !row.lng) continue
      const key = `${row.address}|${row.city}|${row.zip}`
      if (!locationMap[key]) {
        locationMap[key] = {
          address: row.address, city: row.city, zip: row.zip,
          pharmacy: row.pharmacy, lat: row.lat, lng: row.lng,
          totalDeliveries: 0, coldChainCount: 0,
          lastDate: '', driver: '', orders: [],
        }
      }
      const loc = locationMap[key]
      loc.totalDeliveries++
      if (row.cold_chain) loc.coldChainCount++
      const date = (isDaily ? row.delivery_date : row.date_delivered) || ''
      if (date > loc.lastDate) loc.lastDate = date
      loc.driver = row.driver_name || loc.driver
      if (loc.orders.length < 10) {
        loc.orders.push({
          orderId: row.order_id, name: row.patient_name,
          date, driver: row.driver_name,
          pharmacy: row.pharmacy, coldChain: row.cold_chain,
        })
      }
    }
    return Object.values(locationMap).map(loc => ({
      ...loc,
      coldChainPct: loc.totalDeliveries ? Math.round((loc.coldChainCount / loc.totalDeliveries) * 100) : 0,
    }))
  }

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return
    const map = L.map(mapRef.current, { center: NE_OHIO, zoom: 10, zoomControl: true, scrollWheelZoom: true })
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 19,
    }).addTo(map)

    Object.entries(PHARMACY_ORIGINS).forEach(([name, pos]) => {
      L.marker([pos.lat, pos.lng], {
        icon: L.divIcon({
          className: 'map__pharmacy-marker',
          html: `<div class="map__pharmacy-pin">${name === 'SHSP' ? '💊' : '🏥'}</div>`,
          iconSize: [32, 32], iconAnchor: [16, 16],
        }),
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

    const filtered = locations.filter(loc => {
      if (filter === 'SHSP') return loc.pharmacy === 'SHSP'
      if (filter === 'Aultman') return loc.pharmacy === 'Aultman'
      if (filter === 'coldchain') return loc.coldChainCount > 0
      return true
    })

    filtered.forEach(loc => {
      const size = loc.totalDeliveries >= 16 ? 12 : loc.totalDeliveries >= 6 ? 9 : 6
      const color = loc.pharmacy === 'Aultman' ? '#4ADE80' : '#6495ED'
      const opacity = 0.8

      const marker = L.circleMarker([loc.lat, loc.lng], {
        radius: size, fillColor: color, fillOpacity: opacity,
        color: '#fff', weight: 1.5, opacity: 0.9,
      })

      marker.bindTooltip(`
        <div class="map__tip">
          <strong>${loc.address}</strong><br/>
          ${loc.city}, OH ${loc.zip}<br/>
          <span class="map__tip-row">Deliveries: <b>${loc.totalDeliveries}</b></span>
          ${loc.driver ? `<span class="map__tip-row">Driver: <b>${loc.driver}</b></span>` : ''}
          ${loc.coldChainCount > 0 ? `<span class="map__tip-row">Cold Chain: <b>${loc.coldChainPct}%</b> (${loc.coldChainCount})</span>` : ''}
          <span class="map__tip-row">Pharmacy: <b>${loc.pharmacy}</b></span>
        </div>
      `, { direction: 'top', offset: [0, -8], className: 'map__tooltip' })

      marker.on('click', () => setSelectedLocation(loc))
      marker.addTo(markersLayer.current)
    })
  }, [locations, filter])

  const stats = {
    total: locations.length,
    shsp: locations.filter(l => l.pharmacy === 'SHSP').length,
    aultman: locations.filter(l => l.pharmacy === 'Aultman').length,
    coldchain: locations.filter(l => l.coldChainCount > 0).length,
  }

  return (
    <div className="map__container">
      <div className="map__header">
        <h3 className="map__title">Delivery Map</h3>
        <div className="map__time-filters">
          {[['today', 'Today'], ['week', 'This Week'], ['month', 'This Month'], ['all', 'All Time']].map(([key, label]) => (
            <button key={key} className={`map__time-btn ${timePeriod === key ? 'map__time-btn--active' : ''}`}
              onClick={() => setTimePeriod(key)}>{label}</button>
          ))}
        </div>
        <div className="map__filters">
          {[
            ['all', `All (${stats.total})`],
            ['SHSP', `SHSP (${stats.shsp})`],
            ['Aultman', `Aultman (${stats.aultman})`],
            ['coldchain', `Cold Chain (${stats.coldchain})`],
          ].map(([key, label]) => (
            <button key={key}
              className={`map__filter-btn ${filter === key ? 'map__filter-btn--active' : ''} ${key === 'SHSP' ? 'map__filter-btn--shsp' : ''} ${key === 'Aultman' ? 'map__filter-btn--aultman' : ''}`}
              onClick={() => setFilter(key)}>{label}</button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="map__loading"><div className="dispatch__spinner" />Loading delivery locations...</div>
      )}

      {geocodeProgress && !loading && (
        <div className="map__geocode-status">{geocodeProgress}</div>
      )}

      <div className="map__wrap">
        <div ref={mapRef} className="map__canvas" />

        {selectedLocation && (
          <div className="map__panel">
            <div className="map__panel-header">
              <h4>{selectedLocation.address}</h4>
              <button className="map__panel-close" onClick={() => setSelectedLocation(null)}>&#10005;</button>
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
                    {o.coldChain && <span className="map__panel-order-cc">&#10052;&#65039;</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="map__legend">
        <span className="map__legend-item"><span className="map__legend-dot map__legend-dot--md" style={{ background: '#6495ED' }} />SHSP</span>
        <span className="map__legend-item"><span className="map__legend-dot map__legend-dot--md" style={{ background: '#4ADE80' }} />Aultman</span>
        <span className="map__legend-item"><span className="map__legend-dot map__legend-dot--sm" />1-5</span>
        <span className="map__legend-item"><span className="map__legend-dot map__legend-dot--md" />6-15</span>
        <span className="map__legend-item"><span className="map__legend-dot map__legend-dot--lg" />16+</span>
        <span className="map__legend-count">{stats.total} locations mapped</span>
      </div>
    </div>
  )
}
