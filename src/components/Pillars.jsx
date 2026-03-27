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
    title: 'Cold Chain, Uncompromised',
    desc: "Every temperature-sensitive package is flagged at intake, tracked through delivery, and governed by strict per-driver limits. We don't guess — we verify.",
  },
  {
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
    title: 'Dispatched the Night Before.',
    desc: "Every order sorted, assigned, and waiting in the driver portal before midnight. Deliveries run 8 AM–6 PM daily. We've never missed that window. We've never returned a late delivery.",
  },
  {
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
    title: 'We Know This Region',
    desc: "156 routing rules built from years of real delivery experience — not a national algorithm. Every pharmacy-to-driver assignment reflects how Northeast Ohio actually works. When you bring us a new route, we build the rules before your first order ships.",
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
          <p className="pillars__eyebrow">What We Do Differently</p>
          <h2 className="pillars__title">Designed around the delivery. Not the other way around.</h2>
          <p className="pillars__sub">
            Seventeen years without delivering anything except medications.
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
