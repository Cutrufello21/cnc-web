import { useEffect, useState } from 'react'
import './RouteMap.css'

const ZIP_COORDS_IMPORT = () => import('../../lib/zipCoords.js')

export default function RouteMap({ stops, mode }) {
  const [mapHtml, setMapHtml] = useState(null)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (!stops || stops.length < 2) { setMapHtml(null); return }

    async function buildMap() {
      const { ZIP_COORDS } = await ZIP_COORDS_IMPORT()

      // Get coordinates for each stop
      const points = stops
        .filter(s => s.status !== 'delivered' && s.status !== 'failed')
        .map((s, i) => {
          const zip = s.ZIP || ''
          const coords = ZIP_COORDS[zip]
          return coords ? { lat: coords[0], lng: coords[1], label: i + 1, name: s.Name || s['Name'] || '', address: s.Address || '' } : null
        })
        .filter(Boolean)

      if (points.length < 2) { setMapHtml(null); return }
      setMapHtml(points)
    }

    buildMap()
  }, [stops])

  if (!mapHtml || mapHtml.length < 2) return null

  // Calculate map bounds
  const lats = mapHtml.map(p => p.lat)
  const lngs = mapHtml.map(p => p.lng)
  const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2
  const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2

  // Build a static map image URL using OpenStreetMap tiles via an embedded iframe approach
  // Actually, let's use a simple SVG map — no external dependencies needed
  const padding = 20
  const width = 600
  const height = 300

  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)

  const latRange = (maxLat - minLat) || 0.01
  const lngRange = (maxLng - minLng) || 0.01

  // Add 15% padding to bounds
  const padLat = latRange * 0.15
  const padLng = lngRange * 0.15

  function toX(lng) {
    return padding + ((lng - (minLng - padLng)) / (lngRange + 2 * padLng)) * (width - 2 * padding)
  }
  function toY(lat) {
    return padding + (1 - (lat - (minLat - padLat)) / (latRange + 2 * padLat)) * (height - 2 * padding)
  }

  // Build polyline path
  const pathD = mapHtml.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.lng)} ${toY(p.lat)}`).join(' ')
  // For round trip, close the path
  const closePath = mode === 'roundtrip' ? ` L ${toX(mapHtml[0].lng)} ${toY(mapHtml[0].lat)}` : ''

  return (
    <div className="route-map">
      <div className="route-map__header" onClick={() => setCollapsed(!collapsed)}>
        <span className="route-map__title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
          </svg>
          Route Map — {mapHtml.length} stops
        </span>
        <svg className={`route-map__chevron ${collapsed ? '' : 'route-map__chevron--open'}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      {!collapsed && (
        <div className="route-map__body">
          <svg viewBox={`0 0 ${width} ${height}`} className="route-map__svg">
            {/* Route line */}
            <path d={pathD + closePath} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={mode === 'roundtrip' ? 'none' : '8 4'} opacity="0.7" />

            {/* Direction arrows along the path */}
            {mapHtml.slice(0, -1).map((p, i) => {
              const next = mapHtml[i + 1]
              const mx = (toX(p.lng) + toX(next.lng)) / 2
              const my = (toY(p.lat) + toY(next.lat)) / 2
              const angle = Math.atan2(toY(next.lat) - toY(p.lat), toX(next.lng) - toX(p.lng)) * (180 / Math.PI)
              return (
                <polygon
                  key={`arrow-${i}`}
                  points="-4,-3 4,0 -4,3"
                  fill="#3b82f6"
                  opacity="0.6"
                  transform={`translate(${mx},${my}) rotate(${angle})`}
                />
              )
            })}

            {/* Return arrow for round trip */}
            {mode === 'roundtrip' && mapHtml.length > 1 && (() => {
              const last = mapHtml[mapHtml.length - 1]
              const first = mapHtml[0]
              const mx = (toX(last.lng) + toX(first.lng)) / 2
              const my = (toY(last.lat) + toY(first.lat)) / 2
              const angle = Math.atan2(toY(first.lat) - toY(last.lat), toX(first.lng) - toX(last.lng)) * (180 / Math.PI)
              return (
                <polygon
                  points="-4,-3 4,0 -4,3"
                  fill="#3b82f6"
                  opacity="0.6"
                  transform={`translate(${mx},${my}) rotate(${angle})`}
                />
              )
            })()}

            {/* Stop markers */}
            {mapHtml.map((p, i) => {
              const x = toX(p.lng)
              const y = toY(p.lat)
              const isFirst = i === 0
              const isLast = i === mapHtml.length - 1
              return (
                <g key={i}>
                  <circle cx={x} cy={y} r={isFirst || isLast ? 14 : 11} fill={isFirst ? '#0A2463' : isLast && mode === 'oneway' ? '#dc4a4a' : '#3b82f6'} stroke="#fff" strokeWidth="2" />
                  <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize={isFirst || isLast ? 10 : 9} fontWeight="700" fontFamily="-apple-system, sans-serif">
                    {p.label}
                  </text>
                  {/* Name label for first and last */}
                  {(isFirst || (isLast && mode === 'oneway')) && (
                    <text x={x} y={y + (isFirst ? -20 : 22)} textAnchor="middle" fill={isFirst ? '#0A2463' : '#dc4a4a'} fontSize="10" fontWeight="600" fontFamily="-apple-system, sans-serif">
                      {isFirst ? 'START' : 'END'}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>

          {/* Legend */}
          <div className="route-map__legend">
            {mapHtml.map((p, i) => (
              <div key={i} className="route-map__legend-item">
                <span className="route-map__legend-num" style={{ background: i === 0 ? '#0A2463' : i === mapHtml.length - 1 && mode === 'oneway' ? '#dc4a4a' : '#3b82f6' }}>{p.label}</span>
                <span className="route-map__legend-text">{p.name} — {p.address}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
