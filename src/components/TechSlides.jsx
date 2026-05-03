/* Infographic slides that sit alongside the live demos inside each
   Technology card's carousel. Each slide is a simple two-column
   layout: copy on the left, animated visual on the right. Most
   slides are pure SVG/CSS; the Dispatch Local slide uses Mapbox
   via the TechLocalMap component. */
import { useEffect, useRef, useState } from 'react'
import TechLocalMap from './TechLocalMap'
import './TechSlides.css'

/* ---------- Pharmacy Portal slides ---------- */

/* Simulated live status feed — new delivery updates appear every
   ~2.8 s, slide in from the bottom, older ones scroll up and fade.
   Uses Sample addresses (no real PHI). The feed loops after all
   events have played, so the card never goes static. */
const FEED_EVENTS = [
  { status: 'pickup',    driver: 'Alex',     text: 'Picked up 4 orders from SHSP',     time: '5:32 AM' },
  { status: 'transit',   driver: 'Bobby',    text: 'En route to 425 Springbrook Dr',    time: '5:48 AM' },
  { status: 'delivered', driver: 'Bobby',     text: 'Delivered to 425 Springbrook Dr',   time: '5:54 AM' },
  { status: 'pickup',    driver: 'Tara',      text: 'Picked up 6 orders from Aultman',   time: '5:58 AM' },
  { status: 'delivered', driver: 'Alex',      text: 'Delivered to 211 2nd St SW',        time: '6:03 AM' },
  { status: 'transit',   driver: 'Nicholas',  text: 'En route to 755 5th St SW',         time: '6:07 AM' },
  { status: 'delivered', driver: 'Tara',      text: 'Delivered to 836 2nd St SE',        time: '6:12 AM' },
  { status: 'delivered', driver: 'Nicholas',  text: 'Delivered to 755 5th St SW',        time: '6:18 AM' },
  { status: 'transit',   driver: 'Mike',      text: 'En route — ETA 8 min',              time: '6:22 AM' },
  { status: 'delivered', driver: 'Mike',       text: 'Delivered to 1791 Goshen Hill Rd',  time: '6:30 AM' },
  { status: 'pickup',    driver: 'Nick',       text: 'Picked up 5 orders from SHSP',     time: '6:34 AM' },
  { status: 'delivered', driver: 'Alex',      text: 'Delivered to 869 2nd St SE',        time: '6:41 AM' },
]

function LiveFeed() {
  const [rows, setRows] = useState([])
  const counter = useRef(0)

  useEffect(() => {
    // Seed with first 3 immediately so the card isn't empty
    const seed = FEED_EVENTS.slice(0, 3).map((e, i) => ({ ...e, _k: i }))
    setRows(seed)
    counter.current = 3

    const interval = setInterval(() => {
      const evt = FEED_EVENTS[counter.current % FEED_EVENTS.length]
      const _k = counter.current
      counter.current++
      setRows((prev) => [...prev.slice(-5), { ...evt, _k }])
    }, 2800)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="live-feed">
      <div className="live-feed__hdr">
        <span className="live-feed__hdr-dot" />
        <span>Live Updates</span>
      </div>
      <div className="live-feed__list">
        {rows.map((e) => (
          <div key={e._k} className={`live-feed__row live-feed__row--${e.status}`}>
            <span className={`live-feed__dot live-feed__dot--${e.status}`} />
            <div className="live-feed__body">
              <span className="live-feed__driver">{e.driver}</span>
              <span className="live-feed__text">{e.text}</span>
            </div>
            <span className="live-feed__time">{e.time}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function PharmacyRealtimeSlide() {
  return (
    <div className="slide-info">
      <div className="slide-info__copy">
        <div className="slide-info__eyebrow">See every delivery</div>
        <h4 className="slide-info__title">Know where every order is. Without picking up the phone.</h4>
        <p className="slide-info__desc">
          Every stop updates the moment a driver picks up, arrives, or delivers. Your staff sees the same thing our dispatcher sees — so when a patient calls asking where their meds are, the answer is already on the screen.
        </p>
        <div className="slide-info__stat">
          <span className="slide-info__stat-num">0</span>
          <span className="slide-info__stat-unit">phone calls to us for a status update</span>
        </div>
      </div>
      <div className="slide-info__visual">
        <LiveFeed />
      </div>
    </div>
  )
}

export function PharmacyPodSlide() {
  return (
    <div className="slide-info">
      <div className="slide-info__copy">
        <div className="slide-info__eyebrow">Proof of every delivery</div>
        <h4 className="slide-info__title">Photo, signature, and location for every stop. Pulled up in one click.</h4>
        <p className="slide-info__desc">
          When a patient calls to say they didn't get their prescription, or an inspector asks for documentation, the full delivery record is one click away: who signed for it, what time, where, and a photo of the package at the door.
        </p>
        <div className="slide-info__stat">
          <span className="slide-info__stat-num">1 click</span>
          <span className="slide-info__stat-unit">to pull any delivery record</span>
        </div>
      </div>
      <div className="slide-info__visual">
        <div className="pod-card">
          <div className="pod-card__header">
            <div className="pod-card__title">Delivery Record</div>
            <div className="pod-card__badge">VERIFIED</div>
          </div>
          <div className="pod-card__photo">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(148,163,184,0.4)" strokeWidth="1.5">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </div>
          <div className="pod-card__row"><span>Delivered to</span><span className="pod-card__mono">Anderson, James M</span></div>
          <div className="pod-card__row"><span>Time</span><span className="pod-card__mono">08:14:23 AM</span></div>
          <div className="pod-card__row"><span>Location</span><span className="pod-card__ok">Confirmed at door</span></div>
          <div className="pod-card__row"><span>Signature</span><span className="pod-card__ok">Captured</span></div>
        </div>
      </div>
    </div>
  )
}

export function PharmacyColdChainSlide() {
  return (
    <div className="slide-info">
      <div className="slide-info__copy">
        <div className="slide-info__eyebrow">Cold chain window</div>
        <h4 className="slide-info__title">Cold meds delivered inside the packaging window. Every time.</h4>
        <p className="slide-info__desc">
          Cold packages are flagged when they leave the pharmacy, limited per driver, and delivered before the insulated packaging reaches its time limit. No meds sitting in a warm van. No temperature excursions.
        </p>
        <div className="slide-info__stat">
          <span className="slide-info__stat-num">0</span>
          <span className="slide-info__stat-unit">cold deliveries past the window · 114 today</span>
        </div>
      </div>
      <div className="slide-info__visual">
        <div className="cold-window">
          <div className="cold-window__label">12-HOUR VALIDATED WINDOW</div>
          <div className="cold-window__track">
            <div className="cold-window__fill" />
            <div className="cold-window__marker cold-window__marker--packed" style={{ left: '0%' }}>
              <span className="cold-window__dot" />
              <span className="cold-window__tag">PACKED · 9:00 PM</span>
            </div>
            <div className="cold-window__marker cold-window__marker--pickup" style={{ left: '41%' }}>
              <span className="cold-window__dot" />
              <span className="cold-window__tag">PICKUP · 5:30 AM</span>
            </div>
            <div className="cold-window__marker cold-window__marker--delivered" style={{ left: '77%' }}>
              <span className="cold-window__dot cold-window__dot--ok" />
              <span className="cold-window__tag cold-window__tag--ok">DELIVERED · 8:14 AM</span>
            </div>
            <div className="cold-window__marker cold-window__marker--close" style={{ left: '100%' }}>
              <span className="cold-window__dot cold-window__dot--close" />
              <span className="cold-window__tag cold-window__tag--close">WINDOW CLOSES · 9:00 AM</span>
            </div>
          </div>
          <div className="cold-window__legend">
            <span><span className="cold-window__swatch cold-window__swatch--ok" /> Delivered in window</span>
            <span><span className="cold-window__swatch cold-window__swatch--margin" /> Safety margin</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export function PharmacyAuditSlide() {
  const events = [
    { t: '06:02 AM', label: 'Route dispatched', who: 'System' },
    { t: '08:14 AM', label: 'Anderson, J. — Delivered', who: 'Dom' },
    { t: '08:26 AM', label: 'Brown, S. — Delivered', who: 'Dom' },
    { t: '08:39 AM', label: 'Chen, W. — Delivered', who: 'Mike' },
    { t: '08:51 AM', label: 'Davis, E. — Delivered', who: 'Mike' },
    { t: '09:04 AM', label: 'Garcia, C. — Delivered', who: 'Sara' },
  ]
  return (
    <div className="slide-info">
      <div className="slide-info__copy">
        <div className="slide-info__eyebrow">The record you can hand to a regulator</div>
        <h4 className="slide-info__title">Every delivery. Every driver. Every timestamp. All of it.</h4>
        <p className="slide-info__desc">
          When a regulator or your compliance team asks for delivery records, you don't generate a report — you hand them the actual log. Searchable, exportable, and complete going back to 2023.
        </p>
        <div className="slide-info__stat">
          <span className="slide-info__stat-num">100%</span>
          <span className="slide-info__stat-unit">of deliveries logged since 2023</span>
        </div>
      </div>
      <div className="slide-info__visual">
        <div className="audit-list">
          {events.map((e, i) => (
            <div className="audit-list__row" key={i}>
              <span className="audit-list__dot" />
              <span className="audit-list__time">{e.t}</span>
              <span className="audit-list__label">{e.label}</span>
              <span className="audit-list__who">{e.who}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ---------- Dispatch Portal slides ---------- */

export function DispatchHandoffSlide() {
  const steps = [
    { time: 'CUTOVER',   label: 'Orders received', sub: '~6 PM' },
    { time: 'OVERNIGHT', label: 'Routes built',    sub: 'by midnight' },
    { time: 'DAWN',      label: 'Drivers loaded',  sub: '5–6 AM' },
    { time: 'BY 6 PM',   label: 'Delivered',       sub: 'every day' },
  ]
  return (
    <div className="slide-info">
      <div className="slide-info__copy">
        <div className="slide-info__eyebrow">The handoff</div>
        <h4 className="slide-info__title">You send us the orders. We handle the rest.</h4>
        <p className="slide-info__desc">
          At cutover, your pharmacy sends us the day's prescriptions. By midnight, every order is matched to a driver, routed, and ready. By 6 AM, drivers are loaded. By 6 PM, every patient has their meds in hand. You never touch a route, a driver, or a map.
        </p>
        <div className="slide-info__stat">
          <span className="slide-info__stat-num">0</span>
          <span className="slide-info__stat-unit">routes you have to build</span>
        </div>
      </div>
      <div className="slide-info__visual">
        <div className="handoff-flow">
          {steps.map((s, i) => (
            <div className="handoff-flow__step" key={i}>
              <div className="handoff-flow__node">
                <span className="handoff-flow__dot" />
                {i < steps.length - 1 && <span className="handoff-flow__line" />}
              </div>
              <div className="handoff-flow__body">
                <div className="handoff-flow__time">{s.time}</div>
                <div className="handoff-flow__label">{s.label}</div>
                <div className="handoff-flow__sub">{s.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function DispatchLocalSlide() {
  return (
    <div className="slide-info">
      <div className="slide-info__copy">
        <div className="slide-info__eyebrow">Local expertise</div>
        <h4 className="slide-info__title">We know Summit, Stark, Portage, and Tuscarawas by heart.</h4>
        <p className="slide-info__desc">
          Which complexes need a buzzer code. Which patients we've learned to deliver to — not just deliver for. Seventeen years of that knowledge builds your route tonight.
        </p>
        <div className="slide-info__stat">
          <span className="slide-info__stat-num">1.3M+</span>
          <span className="slide-info__stat-unit">deliveries across NE Ohio since 2007</span>
        </div>
      </div>
      <div className="slide-info__visual">
        <TechLocalMap />
      </div>
    </div>
  )
}

export function DispatchAdaptSlide() {
  return (
    <div className="slide-info">
      <div className="slide-info__copy">
        <div className="slide-info__eyebrow">When things change</div>
        <h4 className="slide-info__title">Rush order? Reroute? Driver swap? One call — and it's handled.</h4>
        <p className="slide-info__desc">
          Plans change. A patient needs insulin an hour earlier. A cold chain stop has to move to a different driver. When you call CNC dispatch, you get Mark or Dom — a Cutrufello on the other end of the line, not a ticket queue. We re-solve the day in real time so your patients don't wait.
        </p>
        <div className="slide-info__stat">
          <span className="slide-info__stat-num">2007</span>
          <span className="slide-info__stat-unit">same family answering the phone since</span>
        </div>
      </div>
      <div className="slide-info__visual">
        <div className="adapt-diagram">
          <div className="adapt-diagram__col">
            <div className="adapt-diagram__col-label">BEFORE</div>
            <div className="adapt-diagram__row"><span className="adapt-diagram__num">1</span>Brown, S.<span className="adapt-diagram__time">8:26 AM</span></div>
            <div className="adapt-diagram__row"><span className="adapt-diagram__num">2</span>Chen, W.<span className="adapt-diagram__time">8:39 AM</span></div>
            <div className="adapt-diagram__row"><span className="adapt-diagram__num">3</span>Davis, E.<span className="adapt-diagram__time">8:51 AM</span></div>
            <div className="adapt-diagram__row"><span className="adapt-diagram__num">4</span>Garcia, C.<span className="adapt-diagram__time">9:04 AM</span></div>
          </div>
          <div className="adapt-diagram__arrow">
            <svg width="32" height="14" viewBox="0 0 32 14" fill="none">
              <path d="M0 7 H26 M22 2 L26 7 L22 12" stroke="#60A5FA" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="adapt-diagram__col">
            <div className="adapt-diagram__col-label adapt-diagram__col-label--rush">+ RUSH ORDER</div>
            <div className="adapt-diagram__row"><span className="adapt-diagram__num">1</span>Brown, S.<span className="adapt-diagram__time">8:26 AM</span></div>
            <div className="adapt-diagram__row adapt-diagram__row--rush"><span className="adapt-diagram__rush">RUSH</span>Ward, M.<span className="adapt-diagram__time">8:32 AM</span></div>
            <div className="adapt-diagram__row"><span className="adapt-diagram__num">2</span>Chen, W.<span className="adapt-diagram__time">8:41 AM</span></div>
            <div className="adapt-diagram__row"><span className="adapt-diagram__num">3</span>Davis, E.<span className="adapt-diagram__time">8:53 AM</span></div>
            <div className="adapt-diagram__row"><span className="adapt-diagram__num">4</span>Garcia, C.<span className="adapt-diagram__time">9:06 AM</span></div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------- Driver App slides ---------- */

export function DriverPodBreakdownSlide() {
  const steps = [
    { label: 'Geofence', desc: 'GPS confirms driver is within 50 ft of the patient address' },
    { label: 'Photo',    desc: 'Timestamped package photo captured on arrival' },
    { label: 'Signature',desc: 'Patient or caregiver signs on screen' },
    { label: 'Note',     desc: 'Optional delivery note — left at door, handed direct, etc.' },
  ]
  return (
    <div className="slide-info">
      <div className="slide-info__copy">
        <div className="slide-info__eyebrow">4-step POD flow</div>
        <h4 className="slide-info__title">Every door. Every time. Four locked steps.</h4>
        <p className="slide-info__desc">
          A driver cannot close a delivery without completing all four. The phone enforces it so the pharmacy, the patient, and the audit trail all get the same proof.
        </p>
      </div>
      <div className="slide-info__visual">
        <div className="step-stack">
          {steps.map((s, i) => (
            <div className="step-stack__item" key={s.label}>
              <div className="step-stack__num">{i + 1}</div>
              <div>
                <div className="step-stack__label">{s.label}</div>
                <div className="step-stack__desc">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function DriverColdPrioritySlide() {
  return (
    <div className="slide-info">
      <div className="slide-info__copy">
        <div className="slide-info__eyebrow">Cold chain priority</div>
        <h4 className="slide-info__title">Cold packages jump the queue — automatically.</h4>
        <p className="slide-info__desc">
          The moment a driver opens a cold-flagged stop, the app reorders the route to deliver it first. Temperature stays in range. Compliance stays clean.
        </p>
        <div className="slide-info__stat">
          <span className="slide-info__stat-num">0</span>
          <span className="slide-info__stat-unit">cold chain violations since launch</span>
        </div>
      </div>
      <div className="slide-info__visual">
        <div className="cold-stack">
          <div className="cold-stack__item cold-stack__item--cold">
            <span className="cold-stack__badge">COLD</span>
            <span className="cold-stack__name">Chen, W.</span>
            <span className="cold-stack__eta">8:39 AM · Priority</span>
          </div>
          <div className="cold-stack__item">
            <span className="cold-stack__name">Anderson, J.</span>
            <span className="cold-stack__eta">8:52 AM</span>
          </div>
          <div className="cold-stack__item">
            <span className="cold-stack__name">Brown, S.</span>
            <span className="cold-stack__eta">9:06 AM</span>
          </div>
          <div className="cold-stack__item">
            <span className="cold-stack__name">Davis, E.</span>
            <span className="cold-stack__eta">9:21 AM</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export function DriverEtaSlide() {
  return (
    <div className="slide-info">
      <div className="slide-info__copy">
        <div className="slide-info__eyebrow">Real-time ETA + progress</div>
        <h4 className="slide-info__title">Dispatch and pharmacy see the route breathe.</h4>
        <p className="slide-info__desc">
          Progress updates stop by stop, ETA recalculates continuously, and the pharmacy portal reflects it instantly. The whole system stays on the same clock.
        </p>
        <div className="slide-info__stat">
          <span className="slide-info__stat-num">6:00 PM</span>
          <span className="slide-info__stat-unit">every day, every driver, every route</span>
        </div>
      </div>
      <div className="slide-info__visual">
        <div className="progress-ring">
          <svg viewBox="0 0 140 140">
            <circle cx="70" cy="70" r="60" stroke="rgba(96,165,250,0.15)" strokeWidth="10" fill="none" />
            <circle
              cx="70"
              cy="70"
              r="60"
              stroke="#60A5FA"
              strokeWidth="10"
              fill="none"
              strokeLinecap="round"
              strokeDasharray="377"
              strokeDashoffset="94"
              transform="rotate(-90 70 70)"
            />
          </svg>
          <div className="progress-ring__label">
            <div className="progress-ring__pct">75%</div>
            <div className="progress-ring__sub">of route complete</div>
          </div>
        </div>
      </div>
    </div>
  )
}
