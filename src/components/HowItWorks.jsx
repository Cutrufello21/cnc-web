import { motion } from 'framer-motion'
import { useInView } from '../hooks/useInView'
import './HowItWorks.css'

const steps = [
  {
    number: '01',
    title: 'Orders In',
    desc: 'Orders transmit from your pharmacy system each evening. Automatically imported, verified, and ready for routing before the next business day.',
  },
  {
    number: '02',
    title: 'Dispatch',
    desc: 'Every order matched to a driver using 156 routing rules built from years on these roads — the night before delivery. Drivers wake up with a complete, verified route already waiting.',
  },
  {
    number: '03',
    title: 'Delivery',
    desc: 'Cold chain packages flagged and prioritized. Routes executed start to finish. Every delivery completed by 6 PM — every single day.',
  },
]

export default function HowItWorks() {
  const [ref, inView] = useInView(0.15)
  return (
    <section className="how" id="how-it-works" ref={ref}>
      <div className="container">
        <motion.div className="how__header"
          initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6 }}>
          <p className="how__eyebrow">The Process</p>
          <h2 className="how__title">From pharmacy to patient. Every step covered.</h2>
        </motion.div>
        <div className="how__steps">
          <div className={`how__connector ${inView ? 'how__connector--active' : ''}`} />
          {steps.map((s, i) => (
            <motion.div className="how__step" key={i}
              initial={{ opacity: 0, y: 30 }} animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.15 * i }}>
              <span className="how__number">{s.number}</span>
              <h3 className="how__step-title">{s.title}</h3>
              <p className="how__step-desc">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
