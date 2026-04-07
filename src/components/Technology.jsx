import { motion } from 'framer-motion'
import { useInView } from '../hooks/useInView'
import './Technology.css'

export default function Technology() {
  const [ref, inView] = useInView(0.1)

  return (
    <section className="tech" id="technology" ref={ref}>
      <div className="container">
        <motion.div
          className="tech__header"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <p className="tech__eyebrow">Our Technology</p>
          <h2 className="tech__title">Transparency built into every delivery.</h2>
          <p className="tech__sub">
            Three connected platforms. One complete system. Your pharmacy sees every delivery in real time — because you built trust by proving it.
          </p>
        </motion.div>

        <div className="tech__grid">
          {/* Pharmacy Portal */}
          <motion.div
            className="tech-card"
            initial={{ opacity: 0, y: 30 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0 }}
          >
            <div className="tech-card__preview">
              <div className="tech-card__preview-header">
                <div className="tech-card__avatar">LP</div>
                <span>LYN Pharmacy</span>
              </div>
              <div className="tech-card__stats-row">
                <div className="tech-card__stat"><span className="tech-card__stat-num" style={{ color: 'var(--navy)' }}>387</span><span className="tech-card__stat-lbl">Total</span></div>
                <div className="tech-card__stat"><span className="tech-card__stat-num" style={{ color: '#10b981' }}>312</span><span className="tech-card__stat-lbl">Delivered</span></div>
                <div className="tech-card__stat"><span className="tech-card__stat-num" style={{ color: '#f59e0b' }}>68</span><span className="tech-card__stat-lbl">Pending</span></div>
                <div className="tech-card__stat"><span className="tech-card__stat-num" style={{ color: '#ef4444' }}>7</span><span className="tech-card__stat-lbl">Failed</span></div>
              </div>
              <div className="tech-card__table">
                <div className="tech-card__table-head"><span>Patient</span><span>Status</span><span>POD</span></div>
                <div className="tech-card__table-row"><span>M. Johnson</span><span className="tech-badge tech-badge--delivered">Delivered</span><span className="tech-pod-link">POD</span></div>
                <div className="tech-card__table-row"><span>S. Williams</span><span className="tech-badge tech-badge--delivered">Delivered</span><span className="tech-pod-link">POD</span></div>
                <div className="tech-card__table-row"><span>R. Davis</span><span className="tech-badge tech-badge--pending">Pending</span><span></span></div>
              </div>
            </div>
            <div className="tech-card__body">
              <div className="tech-card__label">Pharmacy Portal</div>
              <h3 className="tech-card__title">Your clients see everything.</h3>
              <p className="tech-card__desc">Real-time delivery tracking, on-demand POD records, and compliance reporting. Your pharmacy clients never have to call to ask where a delivery is.</p>
            </div>
          </motion.div>

          {/* Dispatch Portal */}
          <motion.div
            className="tech-card"
            initial={{ opacity: 0, y: 30 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            <div className="tech-card__preview">
              <div className="tech-card__preview-header">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--cornflower)' }}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
                <span>Dispatch Portal</span>
              </div>
              <div className="tech-card__dispatch-banner">Routes optimized · 47 min saved</div>
              <div className="tech-card__drivers">
                {[
                  { name: 'Marcus R.', pct: 79 },
                  { name: 'Angela F.', pct: 73 },
                  { name: 'Derek S.', pct: 82 },
                  { name: 'Rachel K.', pct: 69 },
                ].map((d, i) => (
                  <div className="tech-card__driver" key={i}>
                    <span className="tech-card__driver-name">{d.name}</span>
                    <div className="tech-card__driver-bar">
                      <div className="tech-card__driver-fill" style={{ width: `${d.pct}%` }} />
                    </div>
                    <span className="tech-card__driver-pct">{d.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="tech-card__body">
              <div className="tech-card__label">Dispatch Portal</div>
              <h3 className="tech-card__title">Every route. Every driver. One screen.</h3>
              <p className="tech-card__desc">Route optimization, automated payroll, real-time driver tracking, and analytics. The entire operation managed from one dashboard — built by dispatchers.</p>
            </div>
          </motion.div>

          {/* Driver App */}
          <motion.div
            className="tech-card"
            initial={{ opacity: 0, y: 30 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <div className="tech-card__preview tech-card__preview--phone">
              <div className="tech-card__phone-frame">
                <div className="tech-card__phone-status">
                  <span>9:41</span>
                  <span className="tech-card__phone-battery" />
                </div>
                <div className="tech-card__phone-driver">
                  <span style={{ fontWeight: 600, color: 'var(--gray-900)' }}>Marcus R.</span>
                  <span style={{ fontSize: '10px', color: '#10b981', fontWeight: 600 }}>23/31</span>
                </div>
                <div className="tech-card__phone-progress">
                  <div className="tech-card__phone-progress-fill" />
                </div>
                <div className="tech-card__phone-next">
                  <div className="tech-card__phone-next-label">NEXT STOP</div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gray-900)' }}>1423 Oak St, Fairlawn</div>
                  <div style={{ fontSize: '10px', color: 'var(--gray-500)', marginTop: '2px' }}>M. Johnson · 2 PKG</div>
                </div>
                <div className="tech-card__phone-upcoming">
                  <div className="tech-card__phone-stop">24 · 892 Elm Ave</div>
                  <div className="tech-card__phone-stop tech-card__phone-stop--cold">25 · 2205 Maple Dr</div>
                </div>
              </div>
            </div>
            <div className="tech-card__body">
              <div className="tech-card__label">Driver App</div>
              <h3 className="tech-card__title">Proof of every stop.</h3>
              <p className="tech-card__desc">GPS-verified location, timestamped photos, digital signatures, and geofence confirmation. Four-step proof captured at every door — before the driver leaves.</p>
            </div>
          </motion.div>
        </div>

        {/* POD proof strip */}
        <motion.div
          className="tech__proof"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          <div className="tech__proof-items">
            <div className="tech__proof-item">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <span>GPS Verified</span>
            </div>
            <div className="tech__proof-item">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              <span>Photo Captured</span>
            </div>
            <div className="tech__proof-item">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
              <span>Signature Obtained</span>
            </div>
            <div className="tech__proof-item">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
              <span>Geofence Confirmed</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
