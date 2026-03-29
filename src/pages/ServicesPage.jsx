import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import './ServicesPage.css'

const fade = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 } }

const coreServices = [
  {
    title: 'Prescription & Pharmacy Delivery',
    items: [
      'Daily scheduled delivery to patients across Northeast Ohio',
      'Same-day urgent and add-on order handling',
      'Residential, facility, and long-term care delivery',
      'Signature capture and proof of delivery',
      'HIPAA-compliant handling with BAA available',
    ],
  },
  {
    title: 'Cold Chain Management',
    items: [
      'Temperature-sensitive packages flagged at intake',
      'Per-driver cold chain limits enforced automatically',
      'Priority routing for cold chain orders',
      'Chain-of-custody tracking from pharmacy to patient',
    ],
  },
  {
    title: 'Nightly Dispatch Operations',
    items: [
      'Orders sorted, assigned, and routed before midnight',
      'All deliveries completed by 6 PM next business day',
      '156+ ZIP-level routing rules built from 17 years of regional data',
      'Real-time reassignment and load balancing across drivers',
    ],
  },
  {
    title: 'Dedicated Driver Network',
    items: [
      '20+ vetted, long-term drivers — not gig workers or temp labor',
      'Average driver tenure of 5+ years (longest: 16 years)',
      'Trained specifically for healthcare delivery — not general courier work',
      'Named drivers assigned to consistent routes',
    ],
  },
]

const operations = [
  {
    title: 'Same-Day Escalation',
    desc: 'Misaddressed orders, missed stops, last-minute adds — resolved same day with direct access to operations leadership.',
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
  },
  {
    title: 'Onboarding in Days',
    desc: 'Routes configured before your first order. Typical onboarding is 3-5 business days from signed agreement to first delivery.',
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  },
  {
    title: 'Reporting & Visibility',
    desc: 'Daily volume, pharmacy-level breakdowns, driver performance, cold chain compliance — available on request or through your own dashboard.',
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  },
  {
    title: 'Coverage Flexibility',
    desc: 'Service area expands based on partnership needs. Current coverage spans Cleveland southern suburbs through Carrollton and Millersburg.',
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  },
]

export default function ServicesPage() {
  return (
    <>
      <Navbar />
      <main className="services-page">
        {/* Hero */}
        <section className="sp__hero">
          <div className="container">
            <motion.p className="sp__eyebrow" {...fade} transition={{ duration: 0.5 }}>
              Our Services
            </motion.p>
            <motion.h1 className="sp__title" {...fade} transition={{ duration: 0.5, delay: 0.1 }}>
              What CNC Delivery Provides
            </motion.h1>
            <motion.p className="sp__subtitle" {...fade} transition={{ duration: 0.5, delay: 0.2 }}>
              End-to-end pharmacy delivery operations for hospitals, health systems, and specialty pharmacies across Northeast Ohio.
            </motion.p>
          </div>
        </section>

        {/* Core Services */}
        <section className="sp__core">
          <div className="container">
            <div className="sp__core-grid">
              {coreServices.map((svc, i) => (
                <motion.div
                  className="sp__card"
                  key={i}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-50px' }}
                  transition={{ duration: 0.4, delay: i * 0.1 }}
                >
                  <h3 className="sp__card-title">{svc.title}</h3>
                  <ul className="sp__checklist">
                    {svc.items.map((item, j) => (
                      <li key={j} className="sp__check-item">
                        <svg className="sp__check-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Operations */}
        <section className="sp__ops">
          <div className="container">
            <motion.h2
              className="sp__section-title"
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4 }}
            >
              How We Operate
            </motion.h2>
            <div className="sp__ops-grid">
              {operations.map((op, i) => (
                <motion.div
                  className="sp__op"
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-50px' }}
                  transition={{ duration: 0.4, delay: i * 0.08 }}
                >
                  <div className="sp__op-icon">{op.icon}</div>
                  <div>
                    <h3 className="sp__op-title">{op.title}</h3>
                    <p className="sp__op-desc">{op.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="sp__cta">
          <div className="container">
            <motion.div
              className="sp__cta-box"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="sp__cta-title">Ready to talk?</h2>
              <p className="sp__cta-desc">
                We'll scope your volume, configure routes for your service area, and have a delivery plan ready within a week.
              </p>
              <a href="/#contact" className="sp__cta-btn">Get in Touch</a>
            </motion.div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
