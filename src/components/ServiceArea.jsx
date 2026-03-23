import { motion } from 'framer-motion'
import { useInView } from '../hooks/useInView'
import './ServiceArea.css'

const regions = [
  { name: 'Akron', desc: 'All Akron ZIP codes and surrounding suburbs' },
  { name: 'Canton', desc: 'Canton metro, North Canton, Massillon' },
  { name: 'Falls Route', desc: 'Cuyahoga Falls, Stow, Tallmadge, Kent' },
  { name: 'West', desc: 'Wadsworth, Rittman, Lodi, Seville' },
  { name: 'Northwest', desc: 'Medina, Bath, Copley, Fairlawn' },
  { name: 'East', desc: 'Aurora, Streetsboro, Ravenna, Hudson' },
  { name: 'Southeast', desc: 'Alliance, Louisville, Minerva' },
  { name: 'Southwest', desc: 'Barberton, Green, Uniontown' },
]

export default function ServiceArea() {
  const [ref, inView] = useInView(0.15)

  return (
    <section className="service" id="coverage" ref={ref}>
      <div className="container">
        <motion.div
          className="service__header"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <p className="service__eyebrow">Coverage Area</p>
          <h2 className="service__title">Northeast Ohio, covered</h2>
          <p className="service__sub">
            From Medina to Minerva, our routes span the entire region.
            Eight dedicated zones ensure every patient gets timely delivery.
          </p>
        </motion.div>

        <div className="service__grid">
          {regions.map((r, i) => (
            <motion.div
              className="region"
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.4, delay: 0.08 * i }}
            >
              <div className="region__dot" />
              <div>
                <h4 className="region__name">{r.name}</h4>
                <p className="region__desc">{r.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
