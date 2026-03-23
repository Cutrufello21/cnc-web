import { motion } from 'framer-motion'
import { useInView } from '../hooks/useInView'
import './Pillars.css'

const pillars = [
  {
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
    title: 'Cold Chain Integrity',
    desc: 'Temperature-controlled delivery from pharmacy to patient. Every cold chain package is flagged, tracked, and prioritized for time-sensitive medications.',
  },
  {
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
    title: 'Same-Day Dispatch',
    desc: 'Orders processed nightly with automated routing. Prescriptions picked up in the evening are on doorsteps by the next morning.',
  },
  {
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
        <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        <path d="M21 21v-2a4 4 0 0 0-3-3.87" />
      </svg>
    ),
    title: '16 Dedicated Drivers',
    desc: 'A professional fleet covering every corner of our service area. Each driver knows their route, their patients, and the importance of what they carry.',
  },
]

export default function Pillars() {
  const [ref, inView] = useInView(0.15)

  return (
    <section className="pillars" id="services" ref={ref}>
      <div className="container">
        <motion.div
          className="pillars__header"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <p className="pillars__eyebrow">Why CNC Delivery</p>
          <h2 className="pillars__title">Built for pharmacy logistics</h2>
          <p className="pillars__sub">
            Every part of our operation is designed around one goal: getting medication
            to patients safely, reliably, and on time.
          </p>
        </motion.div>

        <div className="pillars__grid">
          {pillars.map((p, i) => (
            <motion.div
              className="pillar"
              key={i}
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.15 * i }}
            >
              <div className="pillar__icon">{p.icon}</div>
              <h3 className="pillar__title">{p.title}</h3>
              <p className="pillar__desc">{p.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
