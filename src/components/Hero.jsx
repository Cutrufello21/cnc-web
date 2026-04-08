import { motion } from 'framer-motion'
import HeroMap from './HeroMap'
import './Hero.css'

export default function Hero() {
  return (
    <section className="hero">
      <HeroMap />
      <div className="hero__overlay" />
      <div className="container hero__content">
        <motion.p className="hero__eyebrow"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          Northeast Ohio · Since 2007
        </motion.p>
        <motion.h1 className="hero__headline"
          initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.1 }}>
          Reliable delivery.<br />
          Every prescription.<br />
          <span className="hero__accent">Every day.</span>
        </motion.h1>
        <motion.p className="hero__sub"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.25 }}>
          Dispatched the night before.<br />
          In patients' hands by 6 PM &mdash; every single day.
        </motion.p>
        <motion.div className="hero__actions"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.4 }}>
          <a href="#coverage" className="hero__btn hero__btn--primary">View Coverage Area</a>
          <a href="#contact" className="hero__btn hero__btn--secondary">Request a Consultation</a>
        </motion.div>
      </div>
    </section>
  )
}
