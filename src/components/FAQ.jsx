import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useInView } from '../hooks/useInView'
import './FAQ.css'

const faqs = [
  {
    q: 'What geographic area do you serve — and can you expand?',
    a: 'We currently operate across Northeast Ohio, covering Akron, Canton, and surrounding markets with established route structures already in place. Expansion isn\'t theoretical for us — it\'s operational. When a new partner comes on, we evaluate delivery density, service windows, and workflow requirements, then stand up routes that align with their operation. We don\'t force partners into a rigid structure. We are fully capable of expanding service areas quickly and reliably when the need is there.',
  },
  {
    q: 'What happens if a delivery is missed or a patient isn\'t home?',
    a: 'We don\'t treat that as a failed delivery — we treat it as a service recovery moment. Drivers verify the address, attempt contact, and check delivery notes for instructions. Dispatch is contacted in real time, we coordinate directly with the pharmacy, and same-day reattempts are made when possible. If not, the delivery is scheduled as next-day priority. Everything is documented with scan data, timestamps, and delivery photos so there\'s full visibility at every step.',
  },
  {
    q: 'How do you handle same-day or urgent medication requests?',
    a: 'We\'re built for it — not reacting to it. We run structured routes but maintain flexibility for on-demand dispatch, mid-route insertions, and dedicated urgent runs when required. Because dispatch and drivers are in constant communication, we can adjust routes in real time without disrupting the entire system. Urgent requests are assessed immediately and resolved the same day wherever possible.',
  },
  {
    q: 'What does onboarding look like for a new pharmacy partner?',
    a: 'Simple, fast, and hands-on. Typical timeline is a few days to one week. We start by understanding your workflow — order format, volume, and delivery windows. From there we map your delivery geography into our routing structure, set up your intake method, and run test routes if needed. We go live with active monitoring from our dispatch team and stay closely involved to fine-tune performance. We don\'t disappear after launch.',
  },
  {
    q: 'How do you handle cold chain medications?',
    a: 'Cold chain is treated with strict handling standards from pickup to delivery. Packages are clearly labeled and separated at pickup. Drivers are trained to identify and prioritize cold chain deliveries, and temperature-controlled storage is maintained throughout transit. These orders are flagged in our system for extra visibility from dispatch and routed for minimal transit time — no unnecessary stops, no delays.',
  },
  {
    q: 'How do orders come in — do you integrate with pharmacy systems?',
    a: 'Right now, most intake comes through structured spreadsheets or secure email, which allows us to move quickly and stay flexible across different partner workflows. We are actively building out more direct system integrations including order intake, tracking visibility, and pharmacy communication tools. Our goal is to meet partners where they are today while offering a more advanced platform as we grow.',
  },
  {
    q: 'How are your drivers vetted and trained?',
    a: 'This is one of our biggest differentiators. Every driver goes through background checks and is trained specifically for healthcare delivery — not general courier work. We emphasize accuracy over speed, patient sensitivity, and delivery verification through scanning and photo confirmation. Ongoing protocol reinforcement is standard. Many of our drivers have been with us for 3 to 16 years, which creates the kind of consistency you simply don\'t get with high-turnover courier networks.',
  },
  {
    q: 'What happens if a driver calls out?',
    a: 'We plan for that before it happens. Routes are structured so stops can be redistributed quickly when needed. We maintain backup coverage and flexible drivers, and dispatch can rebalance stops across nearby routes in real time. Because we control our operation locally, we don\'t rely on a national queue or escalation process — we solve it immediately.',
  },
  {
    q: 'How does billing and reporting work?',
    a: 'We keep it clean and transparent. Our per-delivery pricing model is aligned with your volume and geography. Weekly invoicing includes detailed delivery breakdowns covering delivery counts, completion confirmation, and exception tracking. We can also tailor reporting to match what your internal team needs. No surprises, no hidden fees.',
  },
  {
    q: 'Are you HIPAA compliant? Do you sign BAAs?',
    a: 'Yes. We operate with HIPAA compliance standards across all of our processes — secure handling of patient information, controlled access to delivery data, and driver training on privacy and compliance. We are fully willing to execute Business Associate Agreements with our partners. BAA available upon request.',
  },
]

export default function FAQ() {
  const [open, setOpen] = useState(null)
  const [ref, inView] = useInView(0.1)

  return (
    <section className="faq" id="faq" ref={ref}>
      <div className="container">
        <motion.div className="faq__header"
          initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6 }}>
          <p className="faq__eyebrow">FAQ</p>
          <h2 className="faq__title">Questions we get from pharmacy and hospital leaders.</h2>
          <p className="faq__sub">
            Straightforward answers to the questions that matter in a real partnership conversation.
          </p>
        </motion.div>

        <motion.div className="faq__list"
          initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6, delay: 0.2 }}>
          {faqs.map((faq, i) => (
            <div className={`faq__item ${open === i ? 'faq__item--open' : ''}`} key={i}>
              <button className="faq__question" onClick={() => setOpen(open === i ? null : i)}>
                <span>{faq.q}</span>
                <span className="faq__icon">{open === i ? '−' : '+'}</span>
              </button>
              <AnimatePresence>
                {open === i && (
                  <motion.div className="faq__answer"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}>
                    <p>{faq.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
