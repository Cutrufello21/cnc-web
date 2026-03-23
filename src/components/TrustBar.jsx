import { motion } from 'framer-motion'
import { useInView } from '../hooks/useInView'
import './TrustBar.css'

export default function TrustBar() {
  const [ref, inView] = useInView(0.3)

  return (
    <section className="trust" ref={ref}>
      <div className="container">
        <motion.div
          className="trust__inner"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <p className="trust__text">
            Trusted by <strong>leading Northeast Ohio pharmacies</strong> to deliver
            <strong> 400+ prescriptions weekly</strong> across the region
          </p>
        </motion.div>
      </div>
    </section>
  )
}
