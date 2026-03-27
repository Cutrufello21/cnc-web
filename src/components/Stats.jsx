import { motion } from 'framer-motion'
import { useInView } from '../hooks/useInView'
import './Stats.css'

const stats = [
  { value: '215,000+', label: 'Verified Deliveries', sub: 'Since 2023' },
  { value: 'Since 2007', label: 'Years in Operation', sub: null },
  { value: '156', label: 'Routing Rules', sub: 'Built for NE Ohio' },
  { value: '8AM–6PM', label: 'Delivery Window', sub: 'Never missed' },
]

export default function Stats() {
  const [ref, inView] = useInView(0.3)
  return (
    <section className="stats" ref={ref}>
      <div className="container">
        <div className="stats__grid">
          {stats.map((s, i) => (
            <motion.div className="stat" key={i}
              initial={{ opacity: 0, scale: 0.9 }} animate={inView ? { opacity: 1, scale: 1 } : {}}
              transition={{ duration: 0.5, delay: 0.1 * i }}>
              <span className="stat__value">{s.value}</span>
              <span className="stat__label">{s.label}</span>
              {s.sub && <span className="stat__sub">{s.sub}</span>}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
