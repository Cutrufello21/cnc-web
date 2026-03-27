import { motion } from 'framer-motion'
import { useInView } from '../hooks/useInView'
import './HowItWorks.css'

const steps = [
  {
    num: '01',
    title: 'Orders In',
    desc: 'Prescriptions are transmitted nightly from the pharmacy system. Orders are automatically imported, reviewed, and queued for routing before the next business day.',
  },
  {
    num: '02',
    title: 'Dispatch',
    desc: '156 ZIP-based routing rules automatically assign every order to the right driver — the night before delivery. By the time drivers wake up, their complete route is already waiting in the portal. Last-minute changes push only to affected drivers.',
  },
  {
    num: '03',
    title: 'Delivery',
    desc: "Drivers pick up from the pharmacy and execute their assigned routes. Cold chain packages are flagged and prioritized. Deliveries run 8 AM–6 PM — a window we've never missed.",
  },
]

export default function HowItWorks() {
  const [ref, inView] = useInView(0.15)

  return (
    <section className="how" ref={ref}>
      <div className="container">
        <motion.div
          className="how__header"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <p className="how__eyebrow">The Process</p>
          <h2 className="how__title">From pharmacy to patient. Every step covered.</h2>
        </motion.div>

        <div className="how__grid">
          {steps.map((s, i) => (
            <motion.div
              className="how__step"
              key={i}
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.15 * i }}
            >
              <div className="how__num">{s.num}</div>
              <h3 className="how__step-title">{s.title}</h3>
              <p className="how__step-desc">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
