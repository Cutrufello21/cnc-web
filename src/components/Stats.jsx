import { motion } from 'framer-motion'
import { useInView } from '../hooks/useInView'
import './Stats.css'

const stats = [
  { value: '20,000+', label: 'Deliveries Completed' },
  { value: '200+', label: 'ZIP Codes Served' },
  { value: '16', label: 'Active Drivers' },
  { value: '99.5%', label: 'On-Time Rate' },
]

export default function Stats() {
  const [ref, inView] = useInView(0.3)

  return (
    <section className="stats" ref={ref}>
      <div className="container">
        <div className="stats__grid">
          {stats.map((s, i) => (
            <motion.div
              className="stat"
              key={i}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={inView ? { opacity: 1, scale: 1 } : {}}
              transition={{ duration: 0.5, delay: 0.1 * i }}
            >
              <span className="stat__value">{s.value}</span>
              <span className="stat__label">{s.label}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
