import { motion } from 'framer-motion'
import { useInView } from '../hooks/useInView'
import './Team.css'

const team = [
  {
    initials: 'PC',
    name: 'Paul Cutrufello',
    title: 'Founder & Owner',
    desc: 'Founded CNC Delivery in 2007 with a standard that has never wavered: if it helps the patient, do it. If we can, we will. That principle has guided every leader of this operation since — and it hasn\'t changed.',
  },
  {
    initials: 'MC',
    name: 'Mark Cutrufello',
    title: 'Operations Manager',
    desc: 'A foundational figure in building CNC Delivery into the operation it is today. Mark manages day-to-day operational logistics, driver coordination, and route execution — bringing decades of hands-on experience to every decision.',
  },
  {
    initials: 'DC',
    name: 'Dominic Cutrufello',
    title: 'Director of Operations & Business Development',
    desc: 'Directs the full scope of CNC Delivery\'s operations — from strategic planning and system development to personally overseeing nightly dispatch. Dominic manages driver relationships, routing infrastructure, and leads the company\'s growth and new partnership development across Northeast Ohio.',
  },
  {
    initials: 'MiC',
    name: 'Mia Cutrufello',
    title: 'Client Relations & Partnership Outreach',
    desc: 'Manages client relationships and drives strategic partnership development. Mia serves as a primary point of contact for pharmacy and hospital leadership, ensuring partners have direct, responsive support at every stage of the relationship.',
  },
  {
    initials: 'KE',
    name: 'Kelly Evans',
    title: 'Client Relations & Partnership Outreach',
    desc: 'Leads outreach and relationship-building efforts with pharmacy and hospital decision-makers across Northeast Ohio. Kelly focuses on establishing long-term partnerships grounded in trust, operational reliability, and shared commitment to patient outcomes.',
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
