import { useState, useEffect, useRef } from 'react'
import './DispatchPortalDemo.css'

const DRIVERS = [
  { name: 'Adam',  pharmacy: 'A', stops: 51, pkgs: 55, cold: 26 },
  { name: 'Alex',  pharmacy: 'S', stops: 34, pkgs: 35, cold: 15 },
  { name: 'Bobby', pharmacy: 'S', stops: 31, pkgs: 32, cold:  9 },
  { name: 'Brad',  pharmacy: 'S', stops:  9, pkgs:  9, cold:  0 },
  { name: 'Dom',   pharmacy: 'A', stops: 14, pkgs: 15, cold:  5 },
  { name: 'Josh',  pharmacy: 'S', stops: 32, pkgs: 33, cold:  9 },
  { name: 'Kasey', pharmacy: 'S', stops: 24, pkgs: 24, cold:  6 },
  { name: 'Laura', pharmacy: 'S', stops: 35, pkgs: 35, cold: 16 },
  { name: 'Mike',  pharmacy: 'A', stops: 50, pkgs: 51, cold: 18 },
  { name: 'Tara',  pharmacy: 'A', stops: 54, pkgs: 55, cold: 10 },
]

const TOTAL = DRIVERS.length
const TICK = 700
const FINAL_PAUSE = 2400

export default function DispatchPortalDemo() {
  const [optimizedCount, setOptimizedCount] = useState(0)
  const [justOptimized, setJustOptimized] = useState(-1)
  const timerRef = useRef(null)

  useEffect(() => {
    const tick = () => {
      setOptimizedCount(prev => {
        if (prev >= TOTAL) {
          clearInterval(timerRef.current)
          setTimeout(() => {
            setOptimizedCount(0)
            setJustOptimized(-1)
            timerRef.current = setInterval(tick, TICK)
          }, FINAL_PAUSE)
          return prev
        }
        setJustOptimized(prev)
        return prev + 1
      })
    }
    timerRef.current = setInterval(tick, TICK)
    return () => clearInterval(timerRef.current)
  }, [])

  const totalStops = DRIVERS.reduce((s, d) => s + d.stops, 0)
  const totalCold = DRIVERS.reduce((s, d) => s + d.cold, 0)
  const allOptimized = optimizedCount >= TOTAL

  return (
    <div className="dispatch-demo">
      <div className="dispatch-frame">
        {/* Sidebar */}
        <aside className="dispatch-sidebar">
          <div className="dispatch-brand">
            <div className="dispatch-brand-cnc">CNC</div>
            <div className="dispatch-brand-delivery">DELIVERY</div>
          </div>
          <nav className="dispatch-nav">
            <div className="dispatch-nav-item dispatch-nav-item--active">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
              Routes
            </div>
            <div className="dispatch-nav-item">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              Drivers
            </div>
            <div className="dispatch-nav-item">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              Sort List
            </div>
            <div className="dispatch-nav-item">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              Routing Rules
            </div>
            <div className="dispatch-nav-item">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9 1.65 1.65 0 0 0 4.27 7.18l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              Settings
            </div>
          </nav>
          <div className="dispatch-sidebar-footer">v2 Dispatch &middot; LYN Software</div>
        </aside>

        {/* Main */}
        <main className="dispatch-main">
          <header className="dispatch-header">
            <h3>Routes</h3>
            <div className="dispatch-avatar">D</div>
          </header>

          <div className="dispatch-toolbar">
            <div className="dispatch-date">
              <span className="dispatch-date-arrow">&lsaquo;</span>
              <span className="dispatch-date-text">Wed, Apr 8</span>
              <span className="dispatch-date-arrow">&rsaquo;</span>
            </div>
            <div className="dispatch-actions">
              <button className="dispatch-btn dispatch-btn--ghost">Optimize</button>
              <button className={`dispatch-btn dispatch-btn--primary ${allOptimized ? 'dispatch-btn--ready' : ''}`}>
                Send Routes
              </button>
            </div>
          </div>

          <div className="dispatch-stats">
            <Stat label="TOTAL STOPS"   value={totalStops} color="white" />
            <Stat label="COLD CHAIN"    value={totalCold}  color="blue" />
            <Stat label="ACTIVE DRIVERS" value={`${optimizedCount}/${TOTAL}`} color="white" />
            <Stat label="UNASSIGNED"    value={0}          color="green" />
          </div>

          <div className="dispatch-drivers-label">DRIVERS ({TOTAL})</div>
          <div className="dispatch-drivers">
            {DRIVERS.map((d, i) => {
              const isOptimized = i < optimizedCount
              const isJust = i === justOptimized
              return (
                <div key={d.name} className={`dispatch-driver ${isOptimized ? 'dispatch-driver--optimized' : ''} ${isJust ? 'dispatch-driver--flash' : ''}`}>
                  <div className="dispatch-driver-top">
                    <span className="dispatch-driver-name">{d.name}</span>
                    <span className={`dispatch-pill dispatch-pill--${d.pharmacy === 'A' ? 'a' : 's'}`}>Rx</span>
                    <span className={`dispatch-status ${isOptimized ? 'dispatch-status--ok' : 'dispatch-status--off'}`}>
                      {isOptimized ? 'Optimized' : 'Not Sent'}
                    </span>
                  </div>
                  <div className="dispatch-driver-stats">
                    <span><b>{d.stops}</b> stops</span>
                    <span><b>{d.pkgs}</b> pkgs</span>
                    <span className="dispatch-driver-cold"><b>{d.cold}</b> cold</span>
                  </div>
                </div>
              )
            })}
          </div>
        </main>
      </div>
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div className="dispatch-stat">
      <div className="dispatch-stat-label">{label}</div>
      <div className={`dispatch-stat-value dispatch-stat-value--${color}`}>{value}</div>
    </div>
  )
}
