import { motion } from 'framer-motion'
import { useInView } from '../hooks/useInView'
import './About.css'

export default function About() {
  const [ref, inView] = useInView(0.2)
  return (
    <section className="about" id="about-us" ref={ref}>
      <div className="container">
        <motion.div className="about__header"
          initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6 }}>
          <p className="about__eyebrow">Who We Are</p>
          <h2 className="about__title">Family-founded. Operator-led.</h2>
        </motion.div>

        <div className="about__inner">
          <div className="about__text">
            <motion.p className="about__body"
              initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6, delay: 0.1 }}>
              CNC Delivery was founded by Paul Cutrufello in 2007 with a simple standard:
              if it helps the patient, do it. That standard has been carried forward by every
              person who has run this operation — and it hasn't changed.
            </motion.p>

            <div className="about__blocks">
              <motion.div className="about__block"
                initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.5, delay: 0.15 }}>
                <h3 className="about__block-title">Built before the software existed.</h3>
                <p className="about__block-body">
                  Before modern routing tools and automated dispatch, Mark Cutrufello built
                  the operational foundation of this business by hand — paper logs, handwritten
                  tracking, direct communication. Every delivery, every route, every record
                  managed manually. That foundation still exists today. Mark remains actively
                  involved in daily operations, and we stay in constant communication throughout
                  the day — reviewing routes, solving problems, and making real-time decisions
                  together. We're not relying solely on software. We're combining it with
                  years of real-world knowledge that no system can replicate.
                </p>
              </motion.div>

              <motion.div className="about__block"
                initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.5, delay: 0.2 }}>
                <h3 className="about__block-title">Every dispatch, personally managed.</h3>
                <p className="about__block-body">
                  Dominic Cutrufello has run day-to-day operations for seven years — personally
                  dispatching every route, building every routing rule, and managing every
                  driver relationship. Every night starts with validating every stop before
                  anything gets assigned. Cleaning data, flagging cold chain and signature
                  requirements, checking for duplicates. Routes are built using ZIP structure,
                  geography, and real-world experience — not just software optimization.
                  By the time drivers walk in the next morning, every route is ready.
                  No confusion. No guessing.
                </p>
              </motion.div>

              <motion.div className="about__block"
                initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.5, delay: 0.25 }}>
                <h3 className="about__block-title">Our drivers know things no algorithm does.</h3>
                <p className="about__block-body">
                  Many of our drivers have been with us for 3 to 16 years. They don't just
                  follow routes — they understand them. They know which apartment complexes
                  have confusing layouts, which facilities require specific entry points, and
                  which customers have preferences that aren't written down. They know when
                  certain areas get backed up and how to sequence stops to avoid delays a
                  routing system would never anticipate. An algorithm can map a route.
                  Our drivers know how to run it.
                </p>
              </motion.div>

              <motion.div className="about__block"
                initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.5, delay: 0.3 }}>
                <h3 className="about__block-title">Problems get solved in real time.</h3>
                <p className="about__block-body">
                  Wrong address, missed stop, last-minute add — we handle it on the spot.
                  Drivers communicate directly with dispatch. Decisions get made immediately.
                  If a patient needs medication same-day, we don't push it to the next cycle.
                  We assess where drivers are, reroute if needed, and get it done.
                  No tickets. No waiting queues. No excuses.
                </p>
              </motion.div>

              <motion.div className="about__block"
                initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.5, delay: 0.35 }}>
                <h3 className="about__block-title">A national company runs on process. We run on accountability.</h3>
                <p className="about__block-body">
                  When you work with CNC Delivery, you work directly with the people
                  running the operation. Not a regional rep. Not a call center.
                  The operators — with seventeen years of context behind every decision.
                  If it's what's best for the patient, we find a way to do it.
                </p>
              </motion.div>
            </div>

            <motion.div className="about__contact"
              initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}} transition={{ duration: 0.6, delay: 0.5 }}>
              <span>Dominic Cutrufello, Director of Operations</span>
              <span className="about__divider">·</span>
              <a href="tel:+13306346260">(330) 634-6260</a>
              <span className="about__divider">·</span>
              <a href="mailto:dom@cncdeliveryservice.com">dom@cncdeliveryservice.com</a>
              <span className="about__divider">·</span>
              <span>Akron, Ohio</span>
            </motion.div>
          </div>

          <motion.div className="about__badge"
            initial={{ opacity: 0, scale: 0.95 }} animate={inView ? { opacity: 1, scale: 1 } : {}} transition={{ duration: 0.6, delay: 0.2 }}>
            <div className="about__badge-block">
              <span className="about__year">2007</span>
              <span className="about__year-label">Founded</span>
            </div>
            <div className="about__badge-divider" />
            <div className="about__badge-block">
              <span className="about__stat">17</span>
              <span className="about__stat-label">Years serving<br />Northeast Ohio</span>
            </div>
            <div className="about__badge-divider" />
            <div className="about__badge-block">
              <span className="about__stat">1.3M+</span>
              <span className="about__stat-label">Deliveries<br />since founding</span>
            </div>
            <div className="about__badge-divider" />
            <div className="about__badge-block">
              <span className="about__stat">16 yrs</span>
              <span className="about__stat-label">Longest-tenured<br />driver</span>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
