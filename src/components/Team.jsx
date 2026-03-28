import { motion } from 'framer-motion'
import { useInView } from '../hooks/useInView'
import './Team.css'

const team = [
  {
    initials: 'PC',
    name: 'Paul Cutrufello',
    title: 'Founder & Owner',
    desc: 'Founded CNC Delivery in 2007. His standard was simple — always ask what\'s best for the patient, even when the outcome seems unreachable. That question still drives every decision we make.',
  },
  {
    initials: 'MC',
    name: 'Mark Cutrufello',
    title: 'Director of Operations',
    desc: 'Built the operational foundation of this business before modern routing software existed — paper logs, handwritten records, direct communication. Still actively involved in daily operations and every major decision.',
  },
  {
    initials: 'DC',
    name: 'Dominic Cutrufello',
    title: 'Operations Manager & Business Development',
    desc: 'Personally dispatches every route and manages every driver relationship. Seven years running day-to-day operations while leading the company\'s growth and new partnerships.',
  },
  {
    initials: 'MiC',
    name: 'Mia Cutrufello',
    title: 'Client Relations & Partnership Outreach',
    desc: 'Leads client relationship strategy and partnership development. Focused on connecting pharmacy and hospital decision-makers with the right solutions for their delivery needs.',
  },
  {
    initials: 'KE',
    name: 'Kelly Evans',
    title: 'Client Relations & Partnership Outreach',
    desc: 'Drives outreach and relationship-building with pharmacy and hospital leaders across Northeast Ohio. Focused on long-term partnerships built on trust and operational reliability.',
  },
]

export default function Team() {
  const [ref, inView] = useInView(0.1)
  return (
    <section className="team" id="team" ref={ref}>
      <div className="container">
        <motion.div className="team__header"
          initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6 }}>
          <p className="team__eyebrow">Our Team</p>
          <h2 className="team__title">The people behind the operation.</h2>
          <p className="team__sub">
            Family-founded and operator-led. Every person on this team is personally
            invested in the outcome of every delivery.
          </p>
        </motion.div>

        <div className="team__grid">
          {team.map((member, i) => (
            <motion.div className="team__card" key={i}
              initial={{ opacity: 0, y: 30 }} animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.1 * i }}>
              <div className="team__avatar">
                <span className="team__initials">{member.initials}</span>
              </div>
              <h3 className="team__name">{member.name}</h3>
              <p className="team__role">{member.title}</p>
              <p className="team__desc">{member.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
