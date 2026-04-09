import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { useInView } from '../hooks/useInView'
import DriverAppDemo from './DriverAppDemo'
import PharmacyPortalDemo from './PharmacyPortalDemo'
import DispatchPortalDemo from './DispatchPortalDemo'
import './Technology.css'

/* Scroll-driven background: interpolate the entire page background
   (document.body) from white → deep navy → white as the Technology
   section enters, fills, and exits the viewport. The .tech section
   itself is transparent so the body color shows through and the
   effect reads as the whole page darkening. rAF-throttled for 60/
   120Hz smoothness. Also writes --nav-bg / --nav-text / --nav-border
   so the navbar tracks the same curve. */
function useTechScrollTransition() {
  useEffect(() => {
    const el = document.querySelector('.tech')
    if (!el) return

    const FROM = [255, 255, 255]
    const TO = [5, 16, 31]
    const lerp = (a, b, t) => Math.round(a + (b - a) * t)
    const smoothstep = (t) => t * t * (3 - 2 * t)

    let ticking = false
    const update = () => {
      ticking = false
      const rect = el.getBoundingClientRect()
      const vh = window.innerHeight

      let t
      if (rect.top >= vh) t = 0
      else if (rect.top > 0) t = 1 - rect.top / vh
      else if (rect.bottom >= vh) t = 1
      else if (rect.bottom > 0) t = rect.bottom / vh
      else t = 0

      t = smoothstep(Math.max(0, Math.min(1, t)))
      const r = lerp(FROM[0], TO[0], t)
      const g = lerp(FROM[1], TO[1], t)
      const b = lerp(FROM[2], TO[2], t)
      const color = `rgb(${r}, ${g}, ${b})`
      document.body.style.backgroundColor = color
      document.documentElement.style.backgroundColor = color

      const navBgR = lerp(255, 5, t)
      const navBgG = lerp(255, 16, t)
      const navBgB = lerp(255, 31, t)
      const navTxtR = lerp(10, 230, t)
      const navTxtG = lerp(36, 237, t)
      const navTxtB = lerp(99, 247, t)
      const root = document.documentElement
      root.style.setProperty('--nav-bg', `rgba(${navBgR}, ${navBgG}, ${navBgB}, 0.78)`)
      root.style.setProperty('--nav-text', `rgb(${navTxtR}, ${navTxtG}, ${navTxtB})`)
      root.style.setProperty('--nav-border', `rgba(${navTxtR}, ${navTxtG}, ${navTxtB}, 0.25)`)
    }

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(update)
        ticking = true
      }
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      document.body.style.backgroundColor = ''
      document.documentElement.style.backgroundColor = ''
      const root = document.documentElement
      root.style.removeProperty('--nav-bg')
      root.style.removeProperty('--nav-text')
      root.style.removeProperty('--nav-border')
    }
  }, [])
}

const features = [
  {
    id: 'pharmacy',
    label: 'Pharmacy Portal',
    title: 'Your clients see everything. In real time.',
    desc: "Every delivery tracked. Every POD record on demand. Status updates, compliance reporting, and full audit trail — accessible from any browser. Your pharmacy clients never have to call to ask where a delivery is.",
    points: [
      'Live delivery status for every order',
      'On-demand proof of delivery records',
      'Cold chain verification and compliance',
      'Full audit trail for regulatory needs',
    ],
    visual: 'portal',
  },
  {
    id: 'dispatch',
    label: 'Dispatch Portal',
    title: 'Every route. Every driver. One screen.',
    desc: "272 stops across 11 drivers — dispatched before midnight, delivered by 6 PM. Route optimization, cold chain tracking, automated payroll, and real-time driver management. Built by the dispatchers who use it every day.",
    points: [
      'Route optimization with 156 routing rules',
      'Real-time driver tracking and stop distribution',
      'Cold chain package limits enforced per driver',
      'Automated payroll calculated on delivery',
    ],
    visual: 'dispatch',
  },
  {
    id: 'driver',
    label: 'Driver App',
    title: 'Proof of every stop. Before the driver leaves.',
    desc: "GPS-verified location, timestamped photos, digital signatures, geofence confirmation. A four-step proof-of-delivery flow captured at every door. The driver app that turns every delivery into a medical record.",
    points: [
      'Optimized route with turn-by-turn navigation',
      '4-step POD: geofence, photo, signature, note',
      'Cold chain flagging and priority delivery',
      'Real-time ETA and progress tracking',
    ],
    visual: 'phone',
  },
]

export default function Technology() {
  const [ref, inView] = useInView(0.05)
  useTechScrollTransition()

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
            Three connected platforms. One complete system. We built the software that proves every stop — so your pharmacy clients never have to wonder.
          </p>
        </motion.div>
      </div>

      {/* Stacked sticky cards — all share the same containing block so
          they can all pin simultaneously at progressively deeper
          offsets. Card N+1 slides up from below and covers card N's
          body, leaving only card N's label strip visible at the top. */}
      <div className="tech__stack">
        {features.map((f, i) => (
          <article className="tech-card" key={f.id} data-visual={f.visual} style={{ '--i': i }}>
              <div className="container tech-card__inner">
                <div className="tech-card__head">
                  <span className="tech-card__dot" />
                  <span className="tech-card__label">{f.label}</span>
                  <span className="tech-card__index">0{i + 1} / 03</span>
                </div>

                <div className="tech-card__body">
                  <div className="tech-card__copy">
                    <h3 className="tech-card__title">{f.title}</h3>
                    <p className="tech-card__desc">{f.desc}</p>
                    <ul className="tech-card__points">
                      {f.points.map((pt, j) => (
                        <li key={j}>
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                            <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <span>{pt}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className={`tech-card__stage tech-card__stage--${f.visual}`}>
                    {f.visual === 'portal' && <PharmacyPortalDemo />}
                    {f.visual === 'dispatch' && <DispatchPortalDemo />}
                    {f.visual === 'phone' && <DriverAppDemo />}
                  </div>
                </div>
              </div>
          </article>
        ))}
      </div>

      {/* POD proof strip */}
      <div className="container">
        <div className="tech__proof">
          <div className="tech__proof-items">
            {[
              { icon: 'M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z M12 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', label: 'GPS Verified' },
              { icon: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', label: 'Photo Captured' },
              { icon: 'M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z', label: 'Signature Obtained' },
              { icon: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', label: 'Geofence Confirmed' },
            ].map((p, i) => (
              <div className="tech__proof-item" key={i}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  {p.icon.split(' M').map((d, j) => (
                    <path key={j} d={j === 0 ? d : 'M' + d} />
                  ))}
                </svg>
                <span>{p.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
