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

// Approximate ZIP centroid coords for NE Ohio + surrounding delivery area
const ZIP_COORDS = {
  // Summit County (Akron area)
  '44201':[40.95,-81.19],'44203':[41.01,-81.61],'44210':[41.03,-81.70],'44211':[41.05,-81.27],
  '44212':[41.04,-81.73],'44215':[40.98,-81.82],'44216':[40.94,-81.53],'44217':[40.86,-81.68],
  '44221':[41.14,-81.49],'44222':[41.15,-81.48],'44223':[41.14,-81.52],'44224':[41.17,-81.44],
  '44230':[40.97,-81.72],'44233':[41.09,-81.75],'44236':[41.20,-81.35],'44237':[41.17,-81.39],
  '44240':[41.16,-81.35],'44241':[41.23,-81.36],'44242':[41.24,-81.34],'44243':[41.16,-81.34],
  '44250':[41.04,-81.43],'44251':[41.00,-81.77],'44255':[41.19,-81.25],'44256':[41.04,-81.86],
  '44258':[41.03,-81.89],'44260':[41.03,-81.33],'44262':[41.14,-81.44],'44264':[41.11,-81.54],
  '44265':[41.08,-81.30],'44266':[41.16,-81.20],'44270':[40.96,-81.62],'44272':[41.13,-81.24],
  '44273':[40.90,-81.69],'44274':[41.02,-81.79],'44276':[40.95,-81.69],'44278':[41.08,-81.54],
  '44280':[41.07,-81.90],'44281':[41.02,-81.75],'44282':[41.05,-81.67],'44285':[41.16,-81.15],
  '44286':[41.23,-81.52],
  // Akron city ZIPs
  '44301':[41.05,-81.51],'44302':[41.09,-81.54],'44303':[41.10,-81.54],'44304':[41.08,-81.50],
  '44305':[41.08,-81.47],'44306':[41.04,-81.48],'44307':[41.06,-81.53],'44308':[41.08,-81.52],
  '44309':[41.08,-81.51],'44310':[41.10,-81.49],'44311':[41.06,-81.52],'44312':[41.00,-81.44],
  '44313':[41.10,-81.57],'44314':[40.98,-81.53],'44319':[40.98,-81.48],'44320':[41.07,-81.58],
  '44321':[41.08,-81.63],'44333':[41.14,-81.61],'44334':[41.13,-81.62],'44372':[41.08,-81.52],
  // Portage County
  '44202':[41.31,-81.34],'44232':[40.87,-81.41],'44411':[41.01,-81.10],
  // Stark County (Canton area)
  '44601':[40.81,-81.37],'44606':[40.73,-81.86],'44608':[40.72,-81.59],'44612':[40.60,-81.40],
  '44613':[40.70,-81.50],'44614':[40.88,-81.51],'44615':[40.57,-81.08],'44618':[40.84,-81.63],
  '44620':[40.55,-81.25],'44621':[40.53,-81.48],'44622':[40.57,-81.58],'44624':[40.68,-81.67],
  '44626':[40.73,-81.42],'44627':[40.73,-81.73],'44630':[40.88,-81.43],'44632':[40.92,-81.37],
  '44640':[40.90,-81.29],'44641':[40.88,-81.38],'44643':[40.63,-81.43],'44644':[40.72,-81.41],
  '44645':[40.94,-81.45],'44646':[40.83,-81.44],'44647':[40.83,-81.43],'44650':[40.88,-81.25],
  '44651':[40.52,-81.01],'44652':[40.85,-81.36],'44656':[40.62,-81.30],'44657':[40.65,-81.22],
  '44660':[40.67,-81.75],'44662':[40.70,-81.55],'44663':[40.53,-81.55],'44666':[40.84,-81.56],
  '44667':[40.85,-81.69],'44675':[40.58,-81.18],'44677':[40.82,-81.75],'44680':[40.70,-81.45],
  '44683':[40.55,-81.48],'44685':[40.91,-81.43],'44688':[40.70,-81.35],'44689':[40.68,-81.68],
  '44691':[40.80,-81.94],
  // Canton city ZIPs
  '44701':[40.80,-81.38],'44702':[40.80,-81.37],'44703':[40.82,-81.39],'44704':[40.80,-81.35],
  '44705':[40.82,-81.34],'44706':[40.77,-81.42],'44707':[40.77,-81.36],'44708':[40.82,-81.44],
  '44709':[40.84,-81.39],'44710':[40.81,-81.43],'44711':[40.80,-81.38],'44714':[40.82,-81.37],
  '44718':[40.85,-81.46],'44720':[40.87,-81.42],'44721':[40.87,-81.33],'44730':[40.72,-81.28],
  '44735':[40.80,-81.38],'44750':[40.80,-81.38],'44767':[40.80,-81.38],'44799':[40.80,-81.38],
  // Wayne County
  '44460':[40.89,-81.03],
  // Tuscarawas County
  '44682':[40.56,-81.42],'44693':[40.40,-81.35],
  // Carroll/Harrison County
  '43903':[40.38,-80.88],'43908':[40.38,-80.77],'43945':[40.43,-80.85],
  '43986':[40.45,-80.90],'43988':[40.48,-80.83],
  // Cuyahoga County (Cleveland suburbs)
  '44023':[41.39,-81.38],'44056':[41.31,-81.34],'44067':[41.31,-81.53],'44087':[41.31,-81.44],
  '44102':[41.47,-81.74],'44125':[41.40,-81.63],'44128':[41.43,-81.54],'44129':[41.39,-81.70],
  '44131':[41.38,-81.66],'44133':[41.31,-81.74],'44134':[41.38,-81.72],'44136':[41.31,-81.69],
  '44137':[41.40,-81.56],'44139':[41.38,-81.44],'44141':[41.33,-81.61],'44146':[41.38,-81.53],
  '44147':[41.34,-81.73],'44149':[41.31,-81.63],
}

// Add jitter so stops at same ZIP don't stack
function jitter(coord, amount = 0.004) {
  return coord + (Math.random() - 0.5) * amount
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

  useEffect(() => { loadData() }, [timePeriod])

  async function loadData() {
    setLoading(true)
    try {
      let query

      if (timePeriod === 'today') {
        // Use daily_stops for today
        const now = new Date()
        const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
        const { data } = await supabase.from('daily_stops')
          .select('order_id, patient_name, address, city, zip, pharmacy, driver_name, delivery_date, cold_chain')
          .eq('delivery_date', today)
        setLocations(buildLocations(data || [], true))
      } else {
        // Use orders table with date filter
        query = supabase.from('orders')
          .select('order_id, patient_name, address, city, zip, pharmacy, driver_name, date_delivered, cold_chain')
          .not('address', 'is', null).not('address', 'eq', '')

        if (timePeriod === 'week') {
          const d = new Date(); d.setDate(d.getDate() - 7)
          query = query.gte('date_delivered', d.toISOString().split('T')[0])
        } else if (timePeriod === 'month') {
          const d = new Date(); d.setDate(d.getDate() - 30)
          query = query.gte('date_delivered', d.toISOString().split('T')[0])
        }

        const { data } = await query
        setLocations(buildLocations(data || [], false))
      }
    } catch (err) {
      console.error('Map error:', err)
    } finally {
      setLoading(false)
    }
  }

  function buildLocations(rows, isDaily) {
    const locationMap = {}
    for (const row of rows) {
      const zip = row.zip || ''
      const coords = ZIP_COORDS[zip]
      if (!coords) continue

      const key = `${row.address}|${row.city}|${zip}`
      if (!locationMap[key]) {
        locationMap[key] = {
          address: row.address, city: row.city, zip,
          pharmacy: row.pharmacy,
          lat: jitter(coords[0]), lng: jitter(coords[1]),
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

    const map = L.map(mapRef.current, {
      center: NE_OHIO,
      zoom: 10,
      zoomControl: true,
      scrollWheelZoom: true,
    })

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 19,
    }).addTo(map)

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
      const size = loc.totalDeliveries >= 16 ? 14 : loc.totalDeliveries >= 6 ? 10 : 6
      const color = loc.pharmacy === 'Aultman' ? '#4ADE80' : '#6495ED'
      const opacity = loc.totalDeliveries >= 6 ? 0.85 : 0.65

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
            <button
              key={key}
              className={`map__time-btn ${timePeriod === key ? 'map__time-btn--active' : ''}`}
              onClick={() => setTimePeriod(key)}
            >
              {label}
            </button>
          ))}
        </div>
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
        <span className="map__legend-item"><span className="map__legend-dot map__legend-dot--shsp map__legend-dot--sm" />1-5</span>
        <span className="map__legend-item"><span className="map__legend-dot map__legend-dot--shsp map__legend-dot--md" />6-15</span>
        <span className="map__legend-item"><span className="map__legend-dot map__legend-dot--shsp map__legend-dot--lg" />16+</span>
        <span className="map__legend-item"><span className="map__legend-dot map__legend-dot--shsp map__legend-dot--md" />SHSP</span>
        <span className="map__legend-item"><span className="map__legend-dot map__legend-dot--aultman map__legend-dot--md" />Aultman</span>
        <span className="map__legend-count">{stats.total} locations mapped</span>
      </div>
    </div>
  )
}
