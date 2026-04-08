import { useState, useEffect, useRef } from 'react'
import './PharmacyPortalDemo.css'

const DELIVERIES = [
  { name: 'Anderson, James M',  address: '1247 Maple Ave',      city: 'Springfield', driver: 'Dom',  time: '8:14 AM',  cold: true  },
  { name: 'Brown, Sarah K',     address: '892 Oak Street',      city: 'Greenville',  driver: 'Dom',  time: '8:26 AM',  cold: false },
  { name: 'Chen, Wei',          address: '3456 Cedar Lane',     city: 'Springfield', driver: 'Mike', time: '8:39 AM',  cold: true  },
  { name: 'Davis, Emily R',     address: '567 Birch Road',      city: 'Riverside',   driver: 'Mike', time: '8:51 AM',  cold: false },
  { name: 'Garcia, Carlos',     address: '1890 Pine Drive',     city: 'Madison',     driver: 'Sara', time: '9:04 AM',  cold: true  },
  { name: 'Hernandez, Maria L', address: '234 Elm Court',       city: 'Greenville',  driver: 'Sara', time: '9:18 AM',  cold: false },
  { name: 'Jackson, Robert L',  address: '678 Walnut Way',      city: 'Franklin',    driver: 'Adam', time: '9:33 AM',  cold: false },
  { name: 'Kim, Min-Jun',       address: '1023 Cherry Blvd',    city: 'Salem',       driver: 'Adam', time: '9:47 AM',  cold: true  },
  { name: 'Lopez, Isabella',    address: '456 Spruce Place',    city: 'Bristol',     driver: 'Tara', time: '10:02 AM', cold: false },
  { name: 'Martinez, Diego',    address: '789 Hickory Trail',   city: 'Clinton',     driver: 'Tara', time: '10:15 AM', cold: true  },
  { name: 'Nelson, Patricia',   address: '1356 Willow Park',    city: 'Hamilton',    driver: 'Josh', time: '10:28 AM', cold: false },
  { name: "O'Brien, Michael",   address: '2468 Magnolia Drive', city: 'Dover',       driver: 'Josh', time: '10:42 AM', cold: true  },
]

const TOTAL = DELIVERIES.length
const TICK = 700
const POD_OPEN_AT = 6
const POD_DURATION = 4500
const RESET_DELAY = 2400

export default function PharmacyPortalDemo() {
  const [delivered, setDelivered] = useState(0)
  const [justDelivered, setJustDelivered] = useState(-1)
  const [podRow, setPodRow] = useState(null)
  const [paused, setPaused] = useState(false)
  const [inView, setInView] = useState(false)
  const containerRef = useRef(null)
  const timerRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting)
        if (!entry.isIntersecting) {
          setPodRow(null)
          setPaused(false)
        }
      },
      { threshold: 0.2 }
    )
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (paused || !inView) return
    const tick = () => {
      setDelivered(prev => {
        if (prev >= TOTAL) {
          clearInterval(timerRef.current)
          setTimeout(() => {
            setDelivered(0)
            setJustDelivered(-1)
            setPodRow(null)
            timerRef.current = setInterval(tick, TICK)
          }, RESET_DELAY)
          return prev
        }
        const next = prev + 1
        setJustDelivered(prev)
        if (next === POD_OPEN_AT) {
          clearInterval(timerRef.current)
          setPaused(true)
          setPodRow(0)
          setTimeout(() => {
            setPodRow(null)
            setPaused(false)
          }, POD_DURATION)
        }
        return next
      })
    }
    timerRef.current = setInterval(tick, TICK)
    return () => clearInterval(timerRef.current)
  }, [paused, inView])

  const pending = TOTAL - delivered
  const failed = 0
  const allDelivered = delivered >= TOTAL

  return (
    <div className="portal-demo" ref={containerRef}>
      <div className="portal-browser">
        <div className="portal-chrome">
          <div className="portal-chrome-dots">
            <span /><span /><span />
          </div>
          <div className="portal-chrome-url">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            cncdelivery.com/portal/dashboard
          </div>
          <div style={{width:30}} />
        </div>
        <div className="portal-frame">
          {/* Sidebar */}
          <aside className="portal-sidebar">
            <div className="portal-brand">
              <div className="portal-brand-cnc">CNC</div>
              <div className="portal-brand-delivery">DELIVERY</div>
            </div>
            <nav className="portal-nav">
              <div className="portal-nav-item portal-nav-item--active">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
              </div>
              <div className="portal-nav-item">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
              </div>
              <div className="portal-nav-item">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              </div>
              <div className="portal-nav-item">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              </div>
            </nav>
          </aside>

          {/* Main */}
          <main className="portal-main">
            <header className="portal-header">
              <h3>Dashboard</h3>
              <div className="portal-avatar">SH</div>
            </header>

            <div className="portal-toolbar">
              <div className="portal-date">
                <span className="portal-date-arrow">&lsaquo;</span>
                <span className="portal-date-text">Wed, Apr 8</span>
                <span className="portal-date-arrow">&rsaquo;</span>
              </div>
              <div className="portal-actions">
                <button className="portal-btn portal-btn--ghost">Export</button>
                <button className={`portal-btn portal-btn--primary ${allDelivered ? 'portal-btn--ready' : ''}`}>
                  {allDelivered ? 'All Delivered' : 'Live'}
                </button>
              </div>
            </div>

            <div className="portal-stats">
              <Stat label="TOTAL"     value={TOTAL}     color="white" />
              <Stat label="DELIVERED" value={delivered} color="green" pulse={delivered > 0 && delivered === justDelivered + 1} />
              <Stat label="PENDING"   value={pending}   color="amber" />
              <Stat label="FAILED"    value={failed}    color="red" />
            </div>

            <div className="portal-grid-label">TODAY'S DELIVERIES ({TOTAL})</div>
            <div className="portal-grid">
              {DELIVERIES.map((d, i) => {
                const isDelivered = i < delivered
                const isJust = i === justDelivered
                return (
                  <div key={i} className={`portal-card ${isDelivered ? 'portal-card--delivered' : ''} ${isJust ? 'portal-card--flash' : ''}`}>
                    <div className="portal-card-top">
                      <span className="portal-card-name">{d.name}</span>
                      {d.cold && <span className="portal-pill portal-pill--cold">Cold</span>}
                      <span className={`portal-status ${isDelivered ? 'portal-status--ok' : 'portal-status--off'}`}>
                        {isDelivered ? 'Delivered' : 'Pending'}
                      </span>
                    </div>
                    <div className="portal-card-addr">{d.address}, {d.city}</div>
                    <div className="portal-card-meta">
                      <span>{d.driver}</span>
                      <span className="portal-card-time">{isDelivered ? d.time : '—'}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </main>
        </div>

        {/* POD Modal */}
        {podRow !== null && (
          <div className="portal-modal-overlay">
            <div className="portal-modal">
              <div className="portal-modal-header">
                <div>
                  <div className="portal-modal-eyebrow">PROOF OF DELIVERY</div>
                  <div className="portal-modal-title">{DELIVERIES[podRow].name}</div>
                  <div className="portal-modal-sub">{DELIVERIES[podRow].address}, {DELIVERIES[podRow].city}, OH</div>
                </div>
                <span className="portal-modal-close">&times;</span>
              </div>
              <div className="portal-modal-body">
                <div className="portal-modal-photos">
                  <div className="portal-modal-photo" style={{ backgroundImage: 'url(/images/demo-porch.jpg)' }}>
                    <span className="portal-modal-photo-label">Where left</span>
                  </div>
                  <div className="portal-modal-photo" style={{ backgroundImage: 'url(/images/demo-house.jpg)' }}>
                    <span className="portal-modal-photo-label">Front of house</span>
                  </div>
                </div>
                <div className="portal-modal-meta">
                  <div className="portal-modal-row">
                    <span className="portal-modal-label">Delivered by</span>
                    <span className="portal-modal-value">{DELIVERIES[podRow].driver}</span>
                  </div>
                  <div className="portal-modal-row">
                    <span className="portal-modal-label">Timestamp</span>
                    <span className="portal-modal-value">Wed Apr 8 &middot; {DELIVERIES[podRow].time}</span>
                  </div>
                  <div className="portal-modal-row">
                    <span className="portal-modal-label">GPS</span>
                    <span className="portal-modal-value portal-modal-mono">40.8001&deg; N, 81.3784&deg; W</span>
                  </div>
                  <div className="portal-modal-row">
                    <span className="portal-modal-label">Geofence</span>
                    <span className="portal-modal-value portal-modal-ok">&#10003; Verified within 50 ft</span>
                  </div>
                  <div className="portal-modal-row">
                    <span className="portal-modal-label">Cold chain</span>
                    <span className="portal-modal-value portal-modal-cold">&#10003; Maintained 36–46&deg;F</span>
                  </div>
                  <div className="portal-modal-row">
                    <span className="portal-modal-label">Note</span>
                    <span className="portal-modal-value">Left at front door</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, color, pulse }) {
  return (
    <div className={`portal-stat ${pulse ? 'portal-stat--pulse' : ''}`}>
      <div className="portal-stat-label">{label}</div>
      <div className={`portal-stat-value portal-stat-value--${color}`}>{value}</div>
    </div>
  )
}
