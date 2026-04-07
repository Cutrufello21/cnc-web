import { useState } from 'react'
import DispatchV2Shell from '../../components/dispatch-v2/DispatchV2Shell'

function getSetting(key, fallback) {
  try {
    const val = localStorage.getItem('dv2-' + key)
    return val !== null ? val : fallback
  } catch {
    return fallback
  }
}

export default function DispatchV2Settings() {
  const [dateOffset, setDateOffset] = useState(() => getSetting('date-offset', '1'))
  const [routeEngine, setRouteEngine] = useState(() => getSetting('route-engine', 'auto'))
  const [rowHeight, setRowHeight] = useState(() => getSetting('row-height', 'comfortable'))
  const [saved, setSaved] = useState(false)

  function handleSave() {
    localStorage.setItem('dv2-date-offset', dateOffset)
    localStorage.setItem('dv2-route-engine', routeEngine)
    localStorage.setItem('dv2-row-height', rowHeight)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <DispatchV2Shell title="Settings">
      <div style={{ maxWidth: 520 }}>
        {/* Date Offset */}
        <div className="dv2-card">
          <h4 style={{ margin: '0 0 4px', fontSize: 14 }}>Default Date Offset</h4>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
            Which date to default to when opening Routes.
          </p>
          <select
            className="dv2-select"
            value={dateOffset}
            onChange={e => setDateOffset(e.target.value)}
          >
            <option value="0">Today</option>
            <option value="1">Tomorrow</option>
            <option value="2">Day after tomorrow</option>
          </select>
        </div>

        {/* Route Engine */}
        <div className="dv2-card">
          <h4 style={{ margin: '0 0 4px', fontSize: 14 }}>Route Optimization Engine</h4>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
            Which engine to use for route optimization.
          </p>
          <select
            className="dv2-select"
            value={routeEngine}
            onChange={e => setRouteEngine(e.target.value)}
          >
            <option value="auto">Auto (recommended)</option>
            <option value="google">Google Routes</option>
            <option value="osrm">OSRM</option>
          </select>
        </div>

        {/* Row Height */}
        <div className="dv2-card">
          <h4 style={{ margin: '0 0 4px', fontSize: 14 }}>Display Density</h4>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
            Row height in tables and stop lists.
          </p>
          <select
            className="dv2-select"
            value={rowHeight}
            onChange={e => setRowHeight(e.target.value)}
          >
            <option value="compact">Compact</option>
            <option value="comfortable">Comfortable</option>
          </select>
        </div>

        <button className="dv2-btn dv2-btn-navy" onClick={handleSave}>
          Save Settings
        </button>

        {saved && (
          <span style={{ marginLeft: 12, fontSize: 13, color: '#10b981' }}>Saved</span>
        )}
      </div>
    </DispatchV2Shell>
  )
}
