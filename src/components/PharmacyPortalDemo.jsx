import { useState, useEffect, useRef } from 'react'
import './PharmacyPortalDemo.css'

const ROWS = [
  { name: 'Sample, Patient A', address: '123 Sample Street',     city: 'Demo City',  zip: '44000', driver: 'Dom',  time: '9:14 AM' },
  { name: 'Sample, Patient B', address: '456 Example Avenue',    city: 'Demo City',  zip: '44000', driver: 'Dom',  time: '9:31 AM' },
  { name: 'Sample, Patient C', address: '789 Test Boulevard',    city: 'Demo City',  zip: '44000', driver: 'Mike', time: '9:48 AM' },
  { name: 'Sample, Patient D', address: '1010 Demo Lane',        city: 'Demo City',  zip: '44001', driver: 'Mike', time: '10:05 AM' },
  { name: 'Sample, Patient E', address: '2020 Sample Court',     city: 'Demo City',  zip: '44001', driver: 'Sara', time: '10:22 AM' },
  { name: 'Sample, Patient F', address: '3030 Example Drive',    city: 'Demo City',  zip: '44001', driver: 'Sara', time: '10:39 AM' },
  { name: 'Sample, Patient G', address: '4040 Test Way',         city: 'Demo City',  zip: '44002', driver: 'Dom',  time: '10:56 AM' },
  { name: 'Sample, Patient H', address: '5050 Demo Boulevard',   city: 'Demo City',  zip: '44002', driver: 'Mike', time: '11:13 AM' },
]

const TOTAL = ROWS.length
const TICK = 1600
const RESET_DELAY = 2200

export default function PharmacyPortalDemo() {
  const [delivered, setDelivered] = useState(0)
  const [justDelivered, setJustDelivered] = useState(-1)
  const timerRef = useRef(null)

  useEffect(() => {
    const tick = () => {
      setDelivered(prev => {
        if (prev >= TOTAL) {
          // pause briefly then reset
          clearInterval(timerRef.current)
          setTimeout(() => {
            setDelivered(0)
            setJustDelivered(-1)
            timerRef.current = setInterval(tick, TICK)
          }, RESET_DELAY)
          return prev
        }
        setJustDelivered(prev)
        return prev + 1
      })
    }
    timerRef.current = setInterval(tick, TICK)
    return () => clearInterval(timerRef.current)
  }, [])

  const pending = TOTAL - delivered
  const pct = Math.round((delivered / TOTAL) * 100)

  return (
    <div className="portal-demo">
      <div className="portal-frame">
        {/* Sidebar */}
        <aside className="portal-sidebar">
          <div className="portal-brand">
            <div className="portal-brand-cnc">CNC</div>
            <div className="portal-brand-line" />
            <div className="portal-brand-delivery">DELIVERY</div>
          </div>
          <nav className="portal-nav">
            <div className="portal-nav-item portal-nav-item--active">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
              Dashboard
            </div>
            <div className="portal-nav-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
              Deliveries
            </div>
            <div className="portal-nav-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              POD Records
            </div>
            <div className="portal-nav-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              Reports
            </div>
          </nav>
          <div className="portal-sidebar-footer">Powered by LYN Software</div>
        </aside>

        {/* Main */}
        <main className="portal-main">
          <header className="portal-header">
            <h3>Dashboard</h3>
            <div className="portal-avatar">S</div>
          </header>

          <div className="portal-stats">
            <Stat label="TOTAL"     value={TOTAL}     trend="+4%"   color="white" />
            <Stat label="DELIVERED" value={delivered} trend={`${pct}%`} color="green" pulse={delivered > 0 && delivered === justDelivered + 1} />
            <Stat label="PENDING"   value={pending}   trend={`${100 - pct}%`} color="amber" />
            <Stat label="FAILED"    value={0}         trend="—"     color="red" />
          </div>

          <div className="portal-progress">
            <div className="portal-progress-row">
              <span>{pct}% Complete</span>
              <span className="portal-progress-meta">{delivered} of {TOTAL} delivered today</span>
            </div>
            <div className="portal-progress-track">
              <div className="portal-progress-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>

          <div className="portal-table">
            <div className="portal-thead">
              <span>PATIENT</span>
              <span>ADDRESS</span>
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
