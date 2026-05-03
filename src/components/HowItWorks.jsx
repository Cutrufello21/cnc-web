import { motion } from 'framer-motion'
import { useInView } from '../hooks/useInView'
import './HowItWorks.css'

const steps = [
  {
    number: '01',
    title: 'You Close. We Start.',
    desc: 'Orders land in our system the moment your pharmacy sends them. No manual uploads, no phone calls, no faxes. Automated and verified before midnight.',
  },
  {
    number: '02',
    title: 'Routed Before Sunrise.',
    desc: 'Every order matched to a local driver using custom routing rules built over seventeen years. Your drivers wake up with a verified route — ready to go.',
  },
  {
    number: '03',
    title: 'Delivered. Verified. Done.',
    desc: 'Photo, GPS, and timestamp on every stop. Cold chain tracked. You see it in your portal the second it happens — confirmed by 6 PM.',
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
