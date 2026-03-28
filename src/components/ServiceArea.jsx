import React, { lazy, Suspense } from 'react'
import { motion } from 'framer-motion'
import { useInView } from '../hooks/useInView'
import './ServiceArea.css'

const ServiceMap = lazy(() => import('./ServiceMap.jsx'))

export default function ServiceArea() {
  const [ref, inView] = useInView(0.05)

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
          <h2 className="service__title">Every ZIP we serve. Every day.</h2>
          <p className="service__sub">
            From Cleveland's southern suburbs to Carrollton and Millersburg —
            if your patients live there, we deliver there.
          </p>
        </motion.div>

        <motion.div
          className="service__map"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          {inView && (
            <Suspense fallback={<div className="service__map-placeholder">Loading map...</div>}>
              <ServiceMap />
            </Suspense>
          )}
        </motion.div>

        <motion.p
          className="service__expand"
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.6, delay: 0.7 }}
        >
          Don't see your area?{' '}
          <a href="mailto:dom@cncdeliveryservice.com">Let's talk.</a>{' '}
          We expand routes based on pharmacy partnerships.
        </motion.p>
      </div>
    </section>
  )
}
