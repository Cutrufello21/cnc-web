import { motion } from 'framer-motion'
import { useInView } from '../hooks/useInView'
import { Link } from 'react-router-dom'
import './CTA.css'

const rows = [
  { label: 'Dispatcher', cnc: 'Named, direct contact — call the owner', national: 'Call center or automated' },
  { label: 'Routing', cnc: '156 rules built from NE Ohio experience', national: 'National geography algorithm' },
  { label: 'Subcontractors', cnc: 'None', national: 'Common' },
  { label: 'Cold chain oversight', cnc: 'Per-driver limits, flagged at intake', national: 'Policy-dependent' },
  { label: 'Escalation', cnc: 'Real-time, same night', national: 'Ticket-based' },
  { label: 'Onboarding', cnc: 'Rules built before your first order ships', national: 'Weeks of configuration' },
  { label: 'Account relationship', cnc: 'Direct with ownership', national: 'Regional rep rotation' },
]

export default function CTA() {
  const [ref, inView] = useInView(0.15)

  return (
    <section className="cta" id="about" ref={ref}>
      <div className="container">
        <motion.div
          className="cta__compare"
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <p className="cta__compare-eyebrow">What Regional Means in Practice</p>
          <h2 className="cta__compare-title">National providers offer scale. We offer accountability.</h2>

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
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="cta__table-label">{r.label}</td>
                    <td className="cta__table-cnc">{r.cnc}</td>
                    <td className="cta__table-national">{r.national}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

        <motion.div
          className="cta__card"
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <h2 className="cta__title">Ready to talk operations?</h2>
          <p className="cta__sub">
            We work with a small number of pharmacy and hospital partners.
            Direct line to ownership. Deliveries run 8 AM–6 PM daily — a window
            we've maintained without exception.
          </p>
          <div className="cta__actions">
            <a href="mailto:dom@cncdeliveryservice.com" className="cta__btn cta__btn--primary">
              Request a Consultation
            </a>
            <Link to="/login" className="cta__btn cta__btn--secondary">
              Partner Sign In
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
