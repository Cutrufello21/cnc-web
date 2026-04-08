import { useState, useEffect, useRef } from 'react'
import './PharmacyPortalDemo.css'

const DELIVERIES = [
  { name: 'Anderson, James M',  address: '1247 Maple Ave',      city: 'Springfield', driver: 'Dom',  time: '8:14 AM' },
  { name: 'Brown, Sarah K',     address: '892 Oak Street',      city: 'Greenville',  driver: 'Dom',  time: '8:26 AM' },
  { name: 'Chen, Wei',          address: '3456 Cedar Lane',     city: 'Springfield', driver: 'Mike', time: '8:39 AM' },
  { name: 'Davis, Emily R',     address: '567 Birch Road',      city: 'Riverside',   driver: 'Mike', time: '8:51 AM' },
  { name: 'Garcia, Carlos',     address: '1890 Pine Drive',     city: 'Madison',     driver: 'Sara', time: '9:04 AM' },
  { name: 'Hernandez, Maria L', address: '234 Elm Court',       city: 'Greenville',  driver: 'Sara', time: '9:18 AM' },
  { name: 'Jackson, Robert L',  address: '678 Walnut Way',      city: 'Franklin',    driver: 'Adam', time: '9:33 AM' },
  { name: 'Kim, Min-Jun',       address: '1023 Cherry Blvd',    city: 'Salem',       driver: 'Adam', time: '9:47 AM' },
  { name: 'Lopez, Isabella',    address: '456 Spruce Place',    city: 'Bristol',     driver: 'Tara', time: '10:02 AM' },
  { name: 'Martinez, Diego',    address: '789 Hickory Trail',   city: 'Clinton',     driver: 'Tara', time: '10:15 AM' },
  { name: 'Nelson, Patricia',   address: '1356 Willow Park',    city: 'Hamilton',    driver: 'Josh', time: '10:28 AM' },
  { name: "O'Brien, Michael",   address: '2468 Magnolia Drive', city: 'Dover',       driver: 'Josh', time: '10:42 AM' },
]

const TOTAL = 379
const VISIBLE_ROWS = DELIVERIES.length
const STEPS = VISIBLE_ROWS // one visual row flip per step
const INCREMENT = Math.ceil(TOTAL / STEPS) // ~32 per tick
const TICK = 1500
const RESET_DELAY = 3500

export default function PharmacyPortalDemo() {
  const [delivered, setDelivered] = useState(0)
  const [rowsDelivered, setRowsDelivered] = useState(0)
  const [justDelivered, setJustDelivered] = useState(-1)
  const [inView, setInView] = useState(false)
  const containerRef = useRef(null)
  const timerRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current) return
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.2 }
    )
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!inView) return
    const tick = () => {
      setRowsDelivered(prev => {
        if (prev >= VISIBLE_ROWS) {
          clearInterval(timerRef.current)
          setTimeout(() => {
            setRowsDelivered(0)
            setDelivered(0)
            setJustDelivered(-1)
            timerRef.current = setInterval(tick, TICK)
          }, RESET_DELAY)
          return prev
        }
        const nextRows = prev + 1
        setJustDelivered(prev)
        setDelivered(Math.min(TOTAL, nextRows * INCREMENT))
        return nextRows
      })
    }
    timerRef.current = setInterval(tick, TICK)
    return () => clearInterval(timerRef.current)
  }, [inView])

  const pending = TOTAL - delivered
  const failed = 0
  const allDelivered = delivered >= TOTAL

  return (
    <div className="pharm-demo" ref={containerRef}>
      <div className="pharm-browser">
        <div className="pharm-chrome">
          <div className="pharm-chrome-dots">
            <span /><span /><span />
          </div>
          <div className="pharm-chrome-url">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            cncdelivery.com/portal/dashboard
          </div>
          <div style={{width:30}} />
        </div>
        <div className="pharm-frame">
          {/* Sidebar */}
          <aside className="pharm-sidebar">
            <div className="pharm-brand">
              <div className="pharm-brand-cnc">CNC</div>
              <div className="pharm-brand-delivery">DELIVERY</div>
            </div>
            <nav className="pharm-nav">
              <div className="pharm-nav-item pharm-nav-item--active">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
              </div>
              <div className="pharm-nav-item">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
              </div>
              <div className="pharm-nav-item">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              </div>
              <div className="pharm-nav-item">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              </div>
            </nav>
          </aside>

          {/* Main */}
          <main className="pharm-main">
            <header className="pharm-header">
              <h3>Dashboard</h3>
              <div className="pharm-avatar">SH</div>
            </header>

            <div className="pharm-toolbar">
              <div className="pharm-date">
                <span className="pharm-date-arrow">&lsaquo;</span>
                <span className="pharm-date-text">Wed, Apr 8</span>
                <span className="pharm-date-arrow">&rsaquo;</span>
              </div>
              <div className="pharm-actions">
                <button className="pharm-btn pharm-btn--ghost">Export</button>
                <button className={`pharm-btn pharm-btn--primary ${allDelivered ? 'pharm-btn--ready' : ''}`}>
                  {allDelivered ? 'All Delivered' : 'Live'}
                </button>
              </div>
            </div>

            <div className="pharm-stats">
              <Stat label="TOTAL"     value={TOTAL}     color="white" />
              <Stat label="DELIVERED" value={delivered} color="green" pulse={delivered > 0 && delivered === justDelivered + 1} />
              <Stat label="PENDING"   value={pending}   color="amber" />
              <Stat label="FAILED"    value={failed}    color="red" />
            </div>

            <div className="pharm-table">
              <div className="pharm-thead">
                <span>PATIENT</span>
                <span>ADDRESS</span>
                <span>DRIVER</span>
                <span>STATUS</span>
                <span>TIME</span>
              </div>
              <div className="pharm-tbody">
                {DELIVERIES.map((d, i) => {
                  const isDelivered = i < rowsDelivered
                  const isJust = i === justDelivered
                  return (
                    <div key={i} className={`pharm-row ${isDelivered ? 'pharm-row--delivered' : ''} ${isJust ? 'pharm-row--flash' : ''}`}>
                      <span className="pharm-cell-name">{d.name}</span>
                      <span className="pharm-cell-addr">{d.address}, {d.city}</span>
                      <span className="pharm-cell-driver">{d.driver}</span>
                      <span>
                        <span className={`pharm-status ${isDelivered ? 'pharm-status--ok' : 'pharm-status--off'}`}>
                          {isDelivered ? 'Delivered' : 'Pending'}
                        </span>
                      </span>
                      <span className="pharm-cell-time">{isDelivered ? d.time : '—'}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </main>
        </div>

      </div>
    </div>
  )
}

function Stat({ label, value, color, pulse }) {
  return (
    <div className={`pharm-stat ${pulse ? 'pharm-stat--pulse' : ''}`}>
      <div className="pharm-stat-label">{label}</div>
      <div className={`pharm-stat-value pharm-stat-value--${color}`}>{value}</div>
    </div>
  )
}
