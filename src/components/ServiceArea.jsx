import React, { lazy, Suspense, useState, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { useInView } from '../hooks/useInView'
import './ServiceArea.css'

const ServiceMap = lazy(() => import('./ServiceMap.jsx'))

// ZIP codes with approximate center coordinates [lng, lat]
const ZIP_DATA = {
  // Summit County
  '44201': [-81.1936, 41.0262], '44203': [-81.6057, 41.0131], '44210': [-81.4404, 41.1595],
  '44216': [-81.6195, 40.9617], '44221': [-81.4843, 41.1334], '44223': [-81.4843, 41.1334],
  '44224': [-81.4404, 41.1595], '44232': [-81.5388, 41.0242], '44236': [-81.3457, 41.1508],
  '44237': [-81.3457, 41.1508], '44240': [-81.3580, 41.1537], '44241': [-81.3457, 41.1898],
  '44250': [-81.5388, 41.0342], '44260': [-81.3900, 41.0700], '44262': [-81.4404, 41.1395],
  '44264': [-81.5388, 41.0642], '44278': [-81.4404, 41.0262], '44281': [-81.7257, 41.0242],
  '44286': [-81.6195, 41.0917], '44301': [-81.5190, 41.0614], '44302': [-81.5390, 41.0814],
  '44303': [-81.5390, 41.0914], '44304': [-81.5090, 41.0914], '44305': [-81.4890, 41.0814],
  '44306': [-81.4990, 41.0514], '44307': [-81.5390, 41.0614], '44308': [-81.5190, 41.0814],
  '44309': [-81.5190, 41.0714], '44310': [-81.5090, 41.1014], '44311': [-81.5390, 41.0514],
  '44312': [-81.5790, 41.0214], '44313': [-81.5690, 41.1114], '44314': [-81.5590, 41.0414],
  '44319': [-81.4690, 41.0114], '44320': [-81.5590, 41.0714], '44321': [-81.6090, 41.0814],
  '44333': [-81.6190, 41.1414], '44334': [-81.6090, 41.1314], '44372': [-81.5190, 41.0814],
  '44396': [-81.5190, 41.0814],
  // Stark County
  '44601': [-81.1076, 40.9153], '44608': [-81.5960, 40.6560], '44614': [-81.5815, 40.8567],
  '44618': [-81.6360, 40.7460], '44626': [-81.4560, 40.6860], '44630': [-81.4360, 40.8860],
  '44632': [-81.2960, 40.9460], '44640': [-81.1560, 40.8860], '44641': [-81.2260, 40.8560],
  '44643': [-81.4260, 40.7260], '44646': [-81.4215, 40.7667], '44647': [-81.5215, 40.7967],
  '44648': [-81.2360, 40.7460], '44650': [-81.2060, 40.8060], '44657': [-81.1460, 40.7560],
  '44662': [-81.4060, 40.6260], '44666': [-81.6460, 40.8260], '44669': [-81.3060, 40.7060],
  '44670': [-81.1760, 40.8360], '44672': [-81.0560, 40.9060], '44685': [-81.4260, 40.9460],
  '44688': [-81.3360, 40.6660], '44689': [-81.5060, 40.6260], '44702': [-81.3784, 40.7989],
  '44703': [-81.3884, 40.8089], '44704': [-81.3584, 40.8089], '44705': [-81.3484, 40.8189],
  '44706': [-81.3984, 40.7689], '44707': [-81.3484, 40.7689], '44708': [-81.4184, 40.8189],
  '44709': [-81.3884, 40.8289], '44710': [-81.4184, 40.7889], '44714': [-81.3584, 40.8289],
  '44718': [-81.4484, 40.8489], '44720': [-81.4084, 40.8789], '44721': [-81.3184, 40.8689],
  '44730': [-81.2484, 40.7789],
  // Portage County
  '44231': [-81.1857, 41.2395], '44234': [-81.1257, 41.2895], '44255': [-81.2857, 41.1795],
  '44265': [-81.2657, 41.1295], '44266': [-81.2424, 41.1573], '44272': [-81.1857, 41.1995],
  '44285': [-81.1457, 41.1695], '44288': [-81.0757, 41.2395], '44411': [-81.0557, 41.1195],
  '44412': [-81.0357, 41.0595],
  // Tuscarawas County
  '44610': [-81.5748, 40.5718], '44612': [-81.3548, 40.5518], '44615': [-81.2348, 40.5418],
  '44621': [-81.4348, 40.5318], '44622': [-81.4748, 40.5318], '44624': [-81.5948, 40.5518],
  '44629': [-81.3548, 40.4818], '44634': [-81.6148, 40.6318], '44644': [-81.5148, 40.6518],
  '44651': [-81.1848, 40.4818], '44654': [-81.6648, 40.5118], '44656': [-81.3948, 40.5918],
  '44663': [-81.4148, 40.5218], '44671': [-81.3248, 40.6018], '44678': [-81.3448, 40.5618],
  '44681': [-81.5848, 40.5018], '44682': [-81.5648, 40.5218], '44683': [-81.4548, 40.5518],
  '44693': [-81.2548, 40.4318],
}

export default function ServiceArea() {
  const [ref, inView] = useInView(0.05)
  const [zip, setZip] = useState('')
  const [result, setResult] = useState(null) // 'yes' | 'no' | null
  const mapInstanceRef = useRef(null)

  const handleMapReady = useCallback((mapInstance) => {
    mapInstanceRef.current = mapInstance
  }, [])

  const handleLookup = useCallback(() => {
    const cleaned = zip.trim()
    if (cleaned.length !== 5 || !/^\d{5}$/.test(cleaned)) return

    const coords = ZIP_DATA[cleaned]
    if (coords) {
      setResult('yes')
      // Fly the map to this ZIP
      const map = mapInstanceRef.current
      if (map) {
        // Remove previous search marker if any
        if (map.getLayer('search-pin-glow')) map.removeLayer('search-pin-glow')
        if (map.getLayer('search-pin')) map.removeLayer('search-pin')
        if (map.getLayer('search-label')) map.removeLayer('search-label')
        if (map.getSource('search-marker')) map.removeSource('search-marker')

        map.flyTo({ center: coords, zoom: 12, duration: 1800, easing: t => 1 - Math.pow(1 - t, 3) })

        // Add marker after fly completes
        setTimeout(() => {
          if (!map.getSource('search-marker')) {
            map.addSource('search-marker', {
              type: 'geojson',
              data: { type: 'Feature', geometry: { type: 'Point', coordinates: coords }, properties: { zip: cleaned } },
            })
            map.addLayer({
              id: 'search-pin-glow',
              type: 'circle',
              source: 'search-marker',
              paint: { 'circle-radius': 24, 'circle-color': '#60A5FA', 'circle-opacity': 0.25, 'circle-blur': 0.5 },
            })
            map.addLayer({
              id: 'search-pin',
              type: 'circle',
              source: 'search-marker',
              paint: { 'circle-radius': 8, 'circle-color': '#0A2463', 'circle-stroke-width': 3, 'circle-stroke-color': '#fff' },
            })
            map.addLayer({
              id: 'search-label',
              type: 'symbol',
              source: 'search-marker',
              layout: {
                'text-field': ['get', 'zip'],
                'text-size': 13,
                'text-offset': [0, -2],
                'text-anchor': 'bottom',
                'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
                'text-allow-overlap': true,
              },
              paint: { 'text-color': '#0A2463', 'text-halo-color': '#fff', 'text-halo-width': 2 },
            })
          }
        }, 1900)
      }
    } else {
      setResult('no')
    }
  }, [zip])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') handleLookup()
  }, [handleLookup])

  return (
    <section className="service" id="coverage" ref={ref}>
      <div className="service__map-section">
      {/* Top row: text */}
      <motion.div
        className="service__header"
        initial={{ opacity: 0, y: 20 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.8 }}
      >
        <p className="service__eyebrow">Coverage Area</p>
        <h2 className="service__title">Every ZIP we serve. Every day.</h2>
        <p className="service__sub">
          Summit, Stark, Portage, and Tuscarawas counties — if your patients live there, we deliver there.
        </p>
      </motion.div>

      {/* ZIP lookup */}
      <motion.div
        className="service__zip-lookup"
        initial={{ opacity: 0, y: 10 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6, delay: 0.3 }}
      >
        <div className="service__zip-input-wrap">
          <input
            className="service__zip-input"
            type="text"
            inputMode="numeric"
            maxLength={5}
            placeholder="Enter ZIP code"
            value={zip}
            onChange={(e) => { setZip(e.target.value.replace(/\D/g, '')); setResult(null) }}
            onKeyDown={handleKeyDown}
          />
          <button className="service__zip-btn" onClick={handleLookup} aria-label="Check ZIP code">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
        </div>
        {result === 'yes' && (
          <p className="service__zip-result service__zip-result--yes">
            We deliver to {zip} — every day.
          </p>
        )}
        {result === 'no' && (
          <p className="service__zip-result service__zip-result--no">
            Not in our standard area, but <a href="mailto:dom@cncdeliveryservice.com">let's talk</a> — we may still be able to help.
          </p>
        )}
      </motion.div>

      {/* Bottom row: map */}
      <div className="service__map-wrap">
        <div className="service__map-fade-left" />
        <div className="service__map-fade-right" />
        {inView && (
          <Suspense fallback={<div className="service__map-placeholder" />}>
            <ServiceMap onMapReady={handleMapReady} />
          </Suspense>
        )}
      </div>
      </div>

      {/* County cards */}
      <motion.div
        className="service__counties"
        initial={{ opacity: 0, y: 20 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6, delay: 0.4 }}
      >
        {[
          { name: 'Summit County', count: '520,000+', cities: 'Akron, Barberton, Cuyahoga Falls, Stow, Hudson, Green, Norton' },
          { name: 'Stark County', count: '410,000+', cities: 'Canton, Massillon, Alliance, North Canton, Louisville, Minerva' },
          { name: 'Portage County', count: '185,000+', cities: 'Ravenna, Kent, Streetsboro, Aurora, Rootstown, Windham' },
          { name: 'Tuscarawas County', count: '145,000+', cities: 'New Philadelphia, Dover, Uhrichsville, Sugarcreek, Strasburg' },
        ].map(c => (
          <div key={c.name} className="service__county">
            <h4 className="service__county-name">{c.name}</h4>
            <p className="service__county-count">{c.count} deliveries</p>
            <p className="service__county-cities">{c.cities}</p>
          </div>
        ))}
      </motion.div>

      {/* Stat bar below map */}
      <motion.div
        className="service__stat-bar"
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : {}}
        transition={{ duration: 0.6, delay: 0.5 }}
      >
        <div className="service__stat-bar-inner">
          <div className="service__stat-item">
            <span className="service__stat-value">1.3M+</span>
            <span className="service__stat-label">Verified Deliveries</span>
          </div>
          <div className="service__stat-divider" />
          <div className="service__stat-item">
            <span className="service__stat-value">200+</span>
            <span className="service__stat-label">ZIP Codes</span>
          </div>
          <div className="service__stat-divider" />
          <div className="service__stat-item">
            <span className="service__stat-value">Since 2007</span>
            <span className="service__stat-label">Years in Operation</span>
          </div>
          <div className="service__stat-divider" />
          <div className="service__stat-item">
            <span className="service__stat-value service__stat-link">
              <a href="mailto:dom@cncdeliveryservice.com">Let's talk</a>
            </span>
            <span className="service__stat-label">Don't see your area?</span>
          </div>
        </div>
      </motion.div>
    </section>
  )
}
