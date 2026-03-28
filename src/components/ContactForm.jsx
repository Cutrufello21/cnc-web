import { useState } from 'react'
import { motion } from 'framer-motion'
import { useInView } from '../hooks/useInView'
import './ContactForm.css'

const CONTACT_API = '/api/actions'

export default function ContactForm() {
  const [ref, inView] = useInView(0.15)
  const [form, setForm] = useState({ name: '', organization: '', email: '', phone: '', message: '' })
  const [status, setStatus] = useState('idle') // idle | sending | sent | error

  function update(field) {
    return (e) => setForm(prev => ({ ...prev, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setStatus('sending')
    try {
      const resp = await fetch(CONTACT_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'contact_form',
          name: form.name,
          organization: form.organization,
          email: form.email,
          phone: form.phone,
          message: form.message,
        }),
      })
      if (!resp.ok) throw new Error('Failed')
      setStatus('sent')
      setForm({ name: '', organization: '', email: '', phone: '', message: '' })
    } catch {
      setStatus('error')
    }
  }

  return (
    <section className="contact" id="contact" ref={ref}>
      <div className="container">
        <div className="contact__inner">
          <motion.div className="contact__info"
            initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6 }}>
            <p className="contact__eyebrow">Get in Touch</p>
            <h2 className="contact__title">Request a Consultation</h2>
            <p className="contact__desc">
              Tell us about your delivery needs. We'll follow up directly —
              usually within the same business day.
            </p>
            <div className="contact__direct">
              <div className="contact__direct-item">
                <span className="contact__direct-label">Phone</span>
                <a href="tel:+13306346260">(330) 634-6260</a>
              </div>
              <div className="contact__direct-item">
                <span className="contact__direct-label">Email</span>
                <a href="mailto:dom@cncdeliveryservice.com">dom@cncdeliveryservice.com</a>
              </div>
              <div className="contact__direct-item">
                <span className="contact__direct-label">Location</span>
                <span>Akron, Ohio</span>
              </div>
            </div>
          </motion.div>

          <motion.form className="contact__form" onSubmit={handleSubmit}
            initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6, delay: 0.15 }}>

            {status === 'sent' ? (
              <div className="contact__success">
                <h3>Thank you.</h3>
                <p>We received your message and will follow up shortly.</p>
              </div>
            ) : (
              <>
                <div className="contact__row">
                  <div className="contact__field">
                    <label htmlFor="cf-name">Name</label>
                    <input id="cf-name" type="text" value={form.name} onChange={update('name')} required placeholder="Your name" />
                  </div>
                  <div className="contact__field">
                    <label htmlFor="cf-org">Organization</label>
                    <input id="cf-org" type="text" value={form.organization} onChange={update('organization')} placeholder="Pharmacy or hospital name" />
                  </div>
                </div>
                <div className="contact__row">
                  <div className="contact__field">
                    <label htmlFor="cf-email">Email</label>
                    <input id="cf-email" type="email" value={form.email} onChange={update('email')} required placeholder="you@company.com" />
                  </div>
                  <div className="contact__field">
                    <label htmlFor="cf-phone">Phone</label>
                    <input id="cf-phone" type="tel" value={form.phone} onChange={update('phone')} placeholder="(555) 555-5555" />
                  </div>
                </div>
                <div className="contact__field">
                  <label htmlFor="cf-msg">Message</label>
                  <textarea id="cf-msg" value={form.message} onChange={update('message')} required rows={4}
                    placeholder="Tell us about your delivery needs — volume, service area, timeline, etc." />
                </div>
                <button type="submit" className="contact__submit" disabled={status === 'sending'}>
                  {status === 'sending' ? 'Sending...' : 'Send Message'}
                </button>
                {status === 'error' && (
                  <p className="contact__error">Something went wrong. Please try again or call us directly.</p>
                )}
              </>
            )}
          </motion.form>
        </div>
      </div>
    </section>
  )
}
