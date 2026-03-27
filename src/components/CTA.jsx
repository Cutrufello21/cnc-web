import { motion } from 'framer-motion'
import { useInView } from '../hooks/useInView'
import { Link } from 'react-router-dom'
import './CTA.css'

const rows = [
  ['Dispatcher', 'Named, direct contact', 'Call center or ticket queue'],
  ['Routing', 'Rules built for NE Ohio', 'National algorithm'],
  ['Subcontractors', 'None — ever', 'Common practice'],
  ['Cold chain', 'Per-driver limits, flagged at intake', 'Policy varies by region'],
  ['Escalation', 'Real-time, same day', 'Ticket-based response'],
  ['Onboarding', 'Routes ready before day one', 'Weeks of configuration'],
  ['Relationship', 'Direct with ownership', 'Regional rep rotation'],
]

export default function CTA() {
  const [ref, inView] = useInView(0.15)
  return (
    <section className="cta" id="about" ref={ref}>
      <div className="container">
        <motion.div className="cta__compare"
          initial={{ opacity: 0, y: 30 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6 }}>
          <p className="cta__eyebrow">What Regional Means in Practice</p>
          <h2 className="cta__compare-title">National providers offer scale.<br />We offer accountability.</h2>
          <div className="cta__table-wrap">
            <table className="cta__table">
              <thead>
                <tr>
                  <th></th>
                  <th>CNC Delivery</th>
                  <th>National Providers</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, cnc, nat], i) => (
                  <tr key={i}>
                    <td className="cta__table-label">{label}</td>
                    <td className="cta__table-cnc">{cnc}</td>
                    <td className="cta__table-nat">{nat}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

        <motion.div className="cta__card"
          initial={{ opacity: 0, y: 30 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6, delay: 0.2 }}>
          <h2 className="cta__title">Ready to talk operations?</h2>
          <p className="cta__sub">
            We work with a small number of pharmacy and hospital partners.
            Direct line to ownership. 8 AM–6 PM delivery window — maintained without exception.
          </p>
          <div className="cta__actions">
            <a href="mailto:dom@cncdeliveryservice.com" className="cta__btn cta__btn--primary">Request a Consultation</a>
            <Link to="/login" className="cta__btn cta__btn--secondary">Partner Sign In</Link>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
