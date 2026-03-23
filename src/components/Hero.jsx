import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import './Hero.css'

export default function Hero() {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const handleMove = (e) => {
      const rect = el.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width - 0.5) * 20
      const y = ((e.clientY - rect.top) / rect.height - 0.5) * 20
      el.style.setProperty('--mouse-x', `${x}px`)
      el.style.setProperty('--mouse-y', `${y}px`)
    }
    el.addEventListener('mousemove', handleMove)
    return () => el.removeEventListener('mousemove', handleMove)
  }, [])

  return (
    <section className="hero" ref={ref}>
      <div className="hero__bg" />
      <div className="container hero__content">
        <motion.p
          className="hero__eyebrow"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          Northeast Ohio's Trusted Pharmacy Courier
        </motion.p>

        <motion.h1
          className="hero__headline"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
        >
          Medication delivered
          <br />
          <span className="hero__accent">with care.</span>
        </motion.h1>

        <motion.p
          className="hero__sub"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.25 }}
        >
          Temperature-controlled, same-day prescription delivery from pharmacy to doorstep.
          Serving 200+ ZIP codes across Akron, Canton, and surrounding communities.
        </motion.p>

        <motion.div
          className="hero__actions"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          <a href="#coverage" className="hero__btn hero__btn--primary">
            View Coverage Area
          </a>
          <a href="#services" className="hero__btn hero__btn--secondary">
            Learn More
          </a>
        </motion.div>
      </div>
    </section>
  )
}
