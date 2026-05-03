import { motion } from 'framer-motion'
import { useInView } from '../hooks/useInView'
import './Pillars.css'

const pillars = [
  {
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
    title: 'Tomorrow by 6 PM. Every Order. Every Day.',
    desc: "Next-day is our standard. Same-day is our edge. Reliable overnight delivery across Northeast Ohio, with same-day capacity for urgent prescriptions. Built in, not bolted on.",
  },
  {
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
    title: 'Real-Time Proof of Delivery.',
    desc: "Photo, GPS coordinates, and timestamp on every stop. If a patient calls saying it never arrived — you have the proof before you hang up the phone.",
  },
  {
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
    title: 'Built for Northeast Ohio.',
    desc: "Seventeen years of routes mapped, refined, and running. New client? Your routes are ready before your first order arrives.",
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
            Seventeen years. One thing: medications.
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
