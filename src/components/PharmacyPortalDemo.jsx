import { useState, useEffect, useRef } from 'react'
import './PharmacyPortalDemo.css'

const ROWS = [
  { name: 'Anderson, James M',   address: '1247 Maple Avenue',     city: 'Springfield', zip: '44101', driver: 'Dom',  time: '8:14 AM' },
  { name: 'Brown, Sarah K',      address: '892 Oak Street',        city: 'Greenville',  zip: '44102', driver: 'Dom',  time: '8:26 AM' },
  { name: 'Chen, Wei',           address: '3456 Cedar Lane',       city: 'Springfield', zip: '44101', driver: 'Mike', time: '8:39 AM' },
  { name: 'Davis, Emily R',      address: '567 Birch Road',        city: 'Riverside',   zip: '44103', driver: 'Mike', time: '8:51 AM' },
  { name: 'Garcia, Carlos',      address: '1890 Pine Drive',       city: 'Madison',     zip: '44104', driver: 'Sara', time: '9:04 AM' },
  { name: 'Hernandez, Maria L',  address: '234 Elm Court',         city: 'Greenville',  zip: '44102', driver: 'Sara', time: '9:18 AM' },
  { name: 'Jackson, Robert L',   address: '678 Walnut Way',        city: 'Franklin',    zip: '44105', driver: 'Adam', time: '9:33 AM' },
  { name: 'Kim, Min-Jun',        address: '1023 Cherry Boulevard', city: 'Salem',       zip: '44106', driver: 'Adam', time: '9:47 AM' },
  { name: 'Lopez, Isabella',     address: '456 Spruce Place',      city: 'Bristol',     zip: '44107', driver: 'Tara', time: '10:02 AM' },
  { name: 'Martinez, Diego',     address: '789 Hickory Trail',     city: 'Clinton',     zip: '44108', driver: 'Tara', time: '10:15 AM' },
  { name: 'Nelson, Patricia',    address: '1356 Willow Park',      city: 'Hamilton',    zip: '44109', driver: 'Josh', time: '10:28 AM' },
  { name: "O'Brien, Michael",    address: '2468 Magnolia Drive',   city: 'Dover',       zip: '44110', driver: 'Josh', time: '10:42 AM' },
  { name: 'Patel, Priya',        address: '1789 Sycamore Street',  city: 'Springfield', zip: '44101', driver: 'Dom',  time: '10:56 AM' },
  { name: 'Rodriguez, Sofia',    address: '345 Ash Grove',         city: 'Greenville',  zip: '44102', driver: 'Mike', time: '11:09 AM' },
  { name: 'Thompson, William',   address: '1567 Poplar Hill',      city: 'Madison',     zip: '44104', driver: 'Sara', time: '11:23 AM' },
  { name: 'Wright, Jennifer',    address: '4521 Aspen Lane',       city: 'Franklin',    zip: '44105', driver: 'Adam', time: '11:36 AM' },
  { name: 'Carter, Anthony',     address: '987 Redwood Drive',     city: 'Salem',       zip: '44106', driver: 'Adam', time: '11:48 AM' },
  { name: 'Mitchell, Rebecca',   address: '2134 Dogwood Court',    city: 'Bristol',     zip: '44107', driver: 'Tara', time: '12:01 PM' },
  { name: 'Roberts, Daniel',     address: '765 Juniper Way',       city: 'Clinton',     zip: '44108', driver: 'Tara', time: '12:14 PM' },
  { name: 'Edwards, Lisa M',     address: '3210 Sequoia Boulevard',city: 'Hamilton',    zip: '44109', driver: 'Josh', time: '12:27 PM' },
  { name: 'Phillips, Mark T',    address: '654 Mulberry Avenue',   city: 'Dover',       zip: '44110', driver: 'Josh', time: '12:40 PM' },
  { name: 'Turner, Amanda J',    address: '1876 Hawthorn Street',  city: 'Springfield', zip: '44101', driver: 'Dom',  time: '12:53 PM' },
  { name: 'Parker, Steven',      address: '432 Linden Place',      city: 'Greenville',  zip: '44102', driver: 'Mike', time: '1:06 PM' },
  { name: 'Collins, Megan E',    address: '2987 Buckeye Drive',    city: 'Riverside',   zip: '44103', driver: 'Sara', time: '1:19 PM' },
]

const TOTAL = ROWS.length
const TICK = 700
const POD_OPEN_AT = 8      // open POD modal after this many delivered
const POD_DURATION = 4500  // how long modal stays open
const RESET_DELAY = 2800

export default function PharmacyPortalDemo() {
  const [delivered, setDelivered] = useState(0)
  const [justDelivered, setJustDelivered] = useState(-1)
  const [podRow, setPodRow] = useState(null)
  const [paused, setPaused] = useState(false)
  const [inView, setInView] = useState(false)
  const containerRef = useRef(null)
  const timerRef = useRef(null)

  // Only run animation when the demo is visible on screen
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
        // open POD modal when reaching threshold
        if (next === POD_OPEN_AT) {
          clearInterval(timerRef.current)
          setPaused(true)
          setPodRow(0) // show POD for first delivered row
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
  const pct = Math.round((delivered / TOTAL) * 100)

  return (
    <div className="portal-demo" ref={containerRef}>
      <div className="portal-browser">
        <div className="portal-chrome">
          <div className="portal-chrome-dots">
            <span /><span /><span />
          </div>
          <div className="portal-chrome-url">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
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
            <div className="portal-nav-item portal-nav-item--active" title="Dashboard">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            </div>
            <div className="portal-nav-item" title="Deliveries">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
            </div>
            <div className="portal-nav-item" title="POD Records">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            </div>
            <div className="portal-nav-item" title="Reports">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            </div>
          </nav>
        </aside>

        {/* Main */}
        <main className="portal-main">
          <header className="portal-header">
            <div>
              <h3>Dashboard</h3>
              <div className="portal-subtitle">Live delivery activity &middot; Wed, Apr 8</div>
            </div>
            <div className="portal-header-right">
              <div className="portal-search">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                Search patient or order...
              </div>
              <div className="portal-avatar">SHSP</div>
            </div>
          </header>

          <div className="portal-stats">
            <Stat label="TOTAL"     value={TOTAL}     trend="+4% vs yesterday" color="white" />
            <Stat label="DELIVERED" value={delivered} trend={`${pct}% complete`} color="green" pulse={delivered > 0 && delivered === justDelivered + 1} />
            <Stat label="PENDING"   value={pending}   trend="awaiting driver"    color="amber" />
            <Stat label="FAILED"    value={failed}    trend="no issues"          color="red" />
          </div>

          <div className="portal-progress">
            <div className="portal-progress-row">
              <span>{pct}% Complete</span>
              <span className="portal-progress-meta">{delivered} of {TOTAL} delivered &middot; ETA 1:23 PM</span>
            </div>
            <div className="portal-progress-track">
              <div className="portal-progress-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>

          <div className="portal-table">
            <div className="portal-thead">
              <span>PATIENT</span>
              <span>ADDRESS</span>
              <span>CITY</span>
              <span>ZIP</span>
              <span>DRIVER</span>
              <span>STATUS</span>
              <span>TIME</span>
              <span>POD</span>
            </div>
            <div className="portal-tbody">
              {ROWS.map((row, i) => {
                const isDelivered = i < delivered
                const isJust = i === justDelivered
                return (
                  <div key={i} className={`portal-row ${isDelivered ? 'portal-row--delivered' : ''} ${isJust ? 'portal-row--flash' : ''}`}>
                    <span className="portal-cell-name">{row.name}</span>
                    <span className="portal-cell-addr">{row.address}</span>
                    <span className="portal-cell-city">{row.city}</span>
                    <span className="portal-cell-zip">{row.zip}</span>
                    <span className="portal-cell-driver">{row.driver}</span>
                    <span>
                      <span className={`portal-status ${isDelivered ? 'portal-status--delivered' : 'portal-status--pending'}`}>
                        {isDelivered ? 'Delivered' : 'Pending'}
                      </span>
                    </span>
                    <span className="portal-cell-time">{isDelivered ? row.time : '—'}</span>
                    <span className="portal-cell-pod">
                      {isDelivered ? (
                        <span className="portal-pod-link">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                          View
                        </span>
                      ) : '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </main>
      </div>

      {/* POD Modal — sibling of .portal-frame inside .portal-browser */}
      {podRow !== null && (
        <div className="portal-modal-overlay">
          <div className="portal-modal">
            <div className="portal-modal-header">
              <div>
                <div className="portal-modal-eyebrow">PROOF OF DELIVERY</div>
                <div className="portal-modal-title">{ROWS[podRow].name}</div>
                <div className="portal-modal-sub">{ROWS[podRow].address}, {ROWS[podRow].city}, OH {ROWS[podRow].zip}</div>
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
                  <span className="portal-modal-value">{ROWS[podRow].driver}</span>
                </div>
                <div className="portal-modal-row">
                  <span className="portal-modal-label">Timestamp</span>
                  <span className="portal-modal-value">Wed Apr 8 &middot; {ROWS[podRow].time}</span>
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

function Stat({ label, value, trend, color, pulse }) {
  return (
    <div className={`portal-stat ${pulse ? 'portal-stat--pulse' : ''}`}>
      <div className="portal-stat-label">{label}</div>
      <div className={`portal-stat-value portal-stat-value--${color}`}>{value}</div>
      <div className="portal-stat-trend">{trend}</div>
    </div>
  )
}
