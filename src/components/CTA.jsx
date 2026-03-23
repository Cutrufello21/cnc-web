import { motion } from 'framer-motion'
import { useInView } from '../hooks/useInView'
import { Link } from 'react-router-dom'
import './CTA.css'

export default function CTA() {
  const [ref, inView] = useInView(0.3)

  return (
    <section className="cta" id="about" ref={ref}>
      <div className="container">
        <motion.div
          className="cta__card"
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <h2 className="cta__title">Ready to streamline your delivery?</h2>
          <p className="cta__sub">
            Whether you're a pharmacy partner or a driver on our team,
            sign in to access your dashboard.
          </p>
          <div className="cta__actions">
            <Link to="/login" className="cta__btn cta__btn--primary">
              Sign In to Dashboard
            </Link>
            <a href="mailto:dom@cncdeliveryservice.com" className="cta__btn cta__btn--secondary">
              Contact Us
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
