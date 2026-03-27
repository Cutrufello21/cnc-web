import { motion } from 'framer-motion'
import { useInView } from '../hooks/useInView'
import './About.css'

export default function About() {
  const [ref, inView] = useInView(0.2)
  return (
    <section className="about" id="about-us" ref={ref}>
      <div className="container">
        <motion.div className="about__inner"
          initial={{ opacity: 0, y: 30 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6 }}>
          <div className="about__text">
            <p className="about__eyebrow">Who We Are</p>
            <h2 className="about__title">Family-founded. Operator-led.</h2>
            <p className="about__body">
              CNC Delivery was founded by Paul Cutrufello in 2007 with a straightforward
              philosophy: if it helps the patient, do it. That standard hasn't changed.
            </p>
            <p className="about__body">
              Dominic Cutrufello has run day-to-day operations for seven years — personally
              dispatching every route, building every routing rule, and managing every driver
              relationship. When you work with CNC Delivery, you work directly with the person
              running the operation. Not a regional rep. Not a call center. The operator.
            </p>
            <p className="about__body">
              Every decision we make comes back to one question: is this what's best for the
              patient? If the answer is yes, we find a way to do it.
            </p>
            <div className="about__contact">
              <span>Dominic Cutrufello, Operations</span>
              <span className="about__divider">·</span>
              <a href="mailto:dom@cncdeliveryservice.com">dom@cncdeliveryservice.com</a>
              <span className="about__divider">·</span>
              <span>Akron, Ohio</span>
            </div>
          </div>
          <div className="about__badge">
            <span className="about__year">2007</span>
            <span className="about__year-label">Founded</span>
            <span className="about__years">17 years<br />serving NE Ohio</span>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
