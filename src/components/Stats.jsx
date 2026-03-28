import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { useInView } from '../hooks/useInView'
import './Stats.css'

function useCountUp(end, duration = 2000, start = false) {
  const [value, setValue] = useState(0)
  const rafRef = useRef(null)

  useEffect(() => {
    if (!start) return
    const startTime = performance.now()
    function animate(now) {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      // ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(eased * end))
      if (progress < 1) rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [start, end, duration])

  return value
}

function CountingStat({ target, suffix = '', prefix = '', label, sub, inView, delay }) {
  const count = useCountUp(target, 2000, inView)
  return (
    <motion.div className="stat"
      initial={{ opacity: 0, scale: 0.9 }} animate={inView ? { opacity: 1, scale: 1 } : {}}
      transition={{ duration: 0.5, delay }}>
      <span className="stat__value">{prefix}{inView ? count.toLocaleString() : '0'}{suffix}</span>
      <span className="stat__label">{label}</span>
      {sub && <span className="stat__sub">{sub}</span>}
    </motion.div>
  )
}

function TextStat({ value, label, sub, inView, delay }) {
  return (
    <motion.div className="stat"
      initial={{ opacity: 0, scale: 0.9 }} animate={inView ? { opacity: 1, scale: 1 } : {}}
      transition={{ duration: 0.5, delay }}>
      <span className="stat__value">{value}</span>
      <span className="stat__label">{label}</span>
      {sub && <span className="stat__sub">{sub}</span>}
    </motion.div>
  )
}

export default function Stats() {
  const [ref, inView] = useInView(0.3)
  return (
    <section className="stats" ref={ref}>
      <div className="container">
        <div className="stats__grid">
          <CountingStat target={215000} suffix="+" label="Verified Deliveries" sub="Since 2023" inView={inView} delay={0} />
          <TextStat value="Since 2007" label="Years in Operation" inView={inView} delay={0.1} />
          <CountingStat target={100} suffix="%" label="Owner-Operated" sub="Direct accountability" inView={inView} delay={0.2} />
          <TextStat value="8AM–6PM" label="Delivery Window" sub="Never missed" inView={inView} delay={0.3} />
        </div>
      </div>
    </section>
  )
}
