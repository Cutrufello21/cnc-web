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
   120Hz smoothness. */
function useTechScrollTransition() {
  useEffect(() => {
    const el = document.querySelector('.tech')
    if (!el) return

    // White → dark navy (matches PharmacyPortalDemo background).
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
      if (rect.top >= vh) {
        t = 0 // not entered yet
      } else if (rect.top > 0) {
        // Entering: top travels vh → 0 across one viewport of scroll
        t = 1 - rect.top / vh
      } else if (rect.bottom >= vh) {
        t = 1 // fully occupying the viewport
      } else if (rect.bottom > 0) {
        // Exiting: bottom travels vh → 0
        t = rect.bottom / vh
      } else {
        t = 0 // fully past
      }

      t = smoothstep(Math.max(0, Math.min(1, t)))
      const r = lerp(FROM[0], TO[0], t)
      const g = lerp(FROM[1], TO[1], t)
      const b = lerp(FROM[2], TO[2], t)
      const color = `rgb(${r}, ${g}, ${b})`
      document.body.style.backgroundColor = color
      document.documentElement.style.backgroundColor = color

      // Drive navbar colors in sync via CSS variables. At t=0 the nav
      // is the existing solid-light state; at t=1 it matches the deep
      // navy section so the visitor feels inside the product shell.
      const navBgR = lerp(255, 5, t)
      const navBgG = lerp(255, 16, t)
      const navBgB = lerp(255, 31, t)
      // Link / logo text: dark navy (#0A2463, rgb 10,36,99) at t=0
      // → near-white (#E6EDF7, rgb 230,237,247) at t=1.
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
    image: '/images/pharmacy-portal.png',
    imageAlt: 'CNC Delivery Pharmacy Portal showing delivery tracking dashboard',
    isPortal: true,
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
    image: '/images/dispatch-portal.png',
    imageAlt: 'CNC Delivery Dispatch Portal showing driver assignments and route optimization',
    isDispatch: true,
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
    image: '/images/driver-app.png',
    imageAlt: 'CNC Delivery Driver App showing stop list and delivery flow',
    isPhone: true,
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

        {features.map((f, i) => (
          <Feature key={f.id} feature={f} index={i} inView={inView} />
        ))}

        {/* POD proof strip */}
        <motion.div
          className="tech__proof"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.6 }}
        >
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
        </motion.div>
      </div>
    </section>
  )
}

function Feature({ feature: f, index: i, inView }) {
  const reversed = i % 2 === 1
  const fullWidth = f.isPortal || f.isDispatch

  if (fullWidth) {
    return (
      <motion.div
        className="tech-feature tech-feature--fullwidth"
        initial={{ opacity: 0, y: 40 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6, delay: 0.15 * i }}
      >
        <div className="tech-feature__content">
          <p className="tech-feature__label">{f.label}</p>
          <h3 className="tech-feature__title">{f.title}</h3>
          <p className="tech-feature__desc">{f.desc}</p>
          <div className="tech-feature__points">
            {f.points.map((pt, j) => (
              <div className="tech-feature__point" key={j}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>{pt}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="tech-feature__image">
          {f.isPortal ? <PharmacyPortalDemo /> : <DispatchPortalDemo />}
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      className={`tech-feature ${reversed ? 'tech-feature--reversed' : ''}`}
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay: 0.15 * i }}
    >
      <div className={`tech-feature__image ${f.isPhone ? 'tech-feature__image--phone' : ''}`}>
        {f.isPhone ? <DriverAppDemo /> : <img src={f.image} alt={f.imageAlt} loading="lazy" />}
      </div>
      <div className="tech-feature__content">
        <p className="tech-feature__label">{f.label}</p>
        <h3 className="tech-feature__title">{f.title}</h3>
        <p className="tech-feature__desc">{f.desc}</p>
        <div className="tech-feature__points">
          {f.points.map((pt, j) => (
            <div className="tech-feature__point" key={j}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>{pt}</span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
