/* Infographic slides that sit alongside the live demos inside each
   Technology card's carousel. Each slide is a simple two-column
   layout: copy on the left, animated visual on the right. No
   external dependencies — all SVG/CSS. */
import './TechSlides.css'

/* ---------- Pharmacy Portal slides ---------- */

export function PharmacyRealtimeSlide() {
  return (
    <div className="slide-info">
      <div className="slide-info__copy">
        <div className="slide-info__eyebrow">Live status, every order</div>
        <h4 className="slide-info__title">Your clients never have to call to ask where a delivery is.</h4>
        <p className="slide-info__desc">
          Every stop updates in real time the moment a driver checks in, loads, or delivers. Pharmacy staff see the same truth your dispatcher sees — no phone tag, no guessing.
        </p>
        <div className="slide-info__stat">
          <span className="slide-info__stat-num">334</span>
          <span className="slide-info__stat-unit">active stops today</span>
        </div>
      </div>
      <div className="slide-info__visual">
        <div className="pulse-map">
          <div className="pulse-map__hub" />
          {[...Array(7)].map((_, i) => (
            <span key={i} className="pulse-map__ping" style={{ '--i': i }} />
          ))}
        </div>
      </div>
    </div>
  )
}

export function PharmacyPodSlide() {
  return (
    <div className="slide-info">
      <div className="slide-info__copy">
        <div className="slide-info__eyebrow">POD records on demand</div>
        <h4 className="slide-info__title">Every delivery is a medical-grade receipt.</h4>
        <p className="slide-info__desc">
          Geofence confirmation, timestamped photo, digital signature, and driver note — pulled in seconds when audit, compliance, or a patient asks.
        </p>
        <div className="slide-info__stat">
          <span className="slide-info__stat-num">0.3s</span>
          <span className="slide-info__stat-unit">average record retrieval</span>
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
          <div className="pod-card__row"><span>GPS</span><span className="pod-card__mono">41.0814° N · 81.5190° W</span></div>
          <div className="pod-card__row"><span>Time</span><span className="pod-card__mono">08:14:23 AM</span></div>
          <div className="pod-card__row"><span>Geofence</span><span className="pod-card__ok">Confirmed</span></div>
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
        <h4 className="slide-info__title">Delivered inside the validated window. Every time.</h4>
        <p className="slide-info__desc">
          Cold packages are flagged at intake, capped per driver, and delivered inside the manufacturer's validated packaging window. Packed at night, picked up before dawn, delivered by mid-morning — no stop slips past its deadline.
        </p>
        <div className="slide-info__stat">
          <span className="slide-info__stat-num">0</span>
          <span className="slide-info__stat-unit">out-of-window deliveries · 114 today</span>
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
        <div className="slide-info__eyebrow">Full audit trail</div>
        <h4 className="slide-info__title">Every action. Every timestamp. Every driver.</h4>
        <p className="slide-info__desc">
          Regulators, compliance officers, and pharmacy directors get the same immutable log. Not a report — the actual record, exported on demand.
        </p>
        <div className="slide-info__stat">
          <span className="slide-info__stat-num">100%</span>
          <span className="slide-info__stat-unit">deliveries logged since 2023</span>
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

export function DispatchRulesSlide() {
  const rules = [
    'Cold chain first',
    'Priority patients',
    'Route density',
    'Driver capacity',
    'Time windows',
    'Cluster by ZIP',
    'Rx hand-off',
    'Traffic patterns',
    'Cold cap per driver',
  ]
  return (
    <div className="slide-info">
      <div className="slide-info__copy">
        <div className="slide-info__eyebrow">156 routing rules</div>
        <h4 className="slide-info__title">Built from years on these roads — not an algorithm guessing.</h4>
        <p className="slide-info__desc">
          Every rule came from a real dispatch decision a human made at 2 AM. National algorithms can't replicate that.
        </p>
        <div className="slide-info__stat">
          <span className="slide-info__stat-num">156</span>
          <span className="slide-info__stat-unit">rules in production</span>
        </div>
      </div>
      <div className="slide-info__visual">
        <div className="rule-chips">
          {rules.map((r, i) => (
            <span className="rule-chip" key={r} style={{ '--i': i }}>{r}</span>
          ))}
          <span className="rule-chip rule-chip--more">+147 more</span>
        </div>
      </div>
    </div>
  )
}

export function DispatchStopsSlide() {
  const drivers = [
    { name: 'Adam',  stops: 51 },
    { name: 'Alex',  stops: 34 },
    { name: 'Bobby', stops: 31 },
    { name: 'Dom',   stops: 14 },
    { name: 'Josh',  stops: 32 },
    { name: 'Kasey', stops: 24 },
    { name: 'Laura', stops: 25 },
    { name: 'Mike',  stops: 29 },
    { name: 'Sara',  stops: 18 },
    { name: 'Tara',  stops: 21 },
    { name: 'Brad',  stops: 9  },
  ]
  const max = Math.max(...drivers.map((d) => d.stops))
  return (
    <div className="slide-info">
      <div className="slide-info__copy">
        <div className="slide-info__eyebrow">Stop distribution</div>
        <h4 className="slide-info__title">272 stops, 11 drivers — balanced by cold chain, not by count.</h4>
        <p className="slide-info__desc">
          Stops are distributed by package density, cold chain limits, and ZIP geometry — not divided evenly. Every driver's capacity is honored.
        </p>
        <div className="slide-info__stat">
          <span className="slide-info__stat-num">272</span>
          <span className="slide-info__stat-unit">stops · 11 drivers</span>
        </div>
      </div>
      <div className="slide-info__visual">
        <div className="bar-chart">
          {drivers.map((d) => (
            <div className="bar-chart__row" key={d.name}>
              <span className="bar-chart__name">{d.name}</span>
              <div className="bar-chart__track">
                <div className="bar-chart__bar" style={{ width: `${(d.stops / max) * 100}%` }} />
              </div>
              <span className="bar-chart__count">{d.stops}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function DispatchPayrollSlide() {
  return (
    <div className="slide-info">
      <div className="slide-info__copy">
        <div className="slide-info__eyebrow">Payroll automation</div>
        <h4 className="slide-info__title">Payroll calculated the moment a delivery completes.</h4>
        <p className="slide-info__desc">
          Every stop, every cold chain surcharge, every route bonus — rolled up per driver automatically. No spreadsheets. No disputes. Payroll is ready when the day ends.
        </p>
        <div className="slide-info__stat">
          <span className="slide-info__stat-num">0</span>
          <span className="slide-info__stat-unit">manual payroll entries</span>
        </div>
      </div>
      <div className="slide-info__visual">
        <div className="payroll-flow">
          <div className="payroll-flow__col">
            <div className="payroll-flow__col-label">STOPS COMPLETED</div>
            <div className="payroll-flow__item">Anderson, J.</div>
            <div className="payroll-flow__item">Brown, S.</div>
            <div className="payroll-flow__item">Chen, W.</div>
            <div className="payroll-flow__item">Davis, E.</div>
            <div className="payroll-flow__item">Garcia, C.</div>
          </div>
          <div className="payroll-flow__arrow">
            <svg width="40" height="16" viewBox="0 0 40 16" fill="none">
              <path d="M0 8 H34 M28 2 L34 8 L28 14" stroke="#60A5FA" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="payroll-flow__col">
            <div className="payroll-flow__col-label">DRIVER PAY · TODAY</div>
            <div className="payroll-flow__pay"><span>Dom</span><span>$284.00</span></div>
            <div className="payroll-flow__pay"><span>Mike</span><span>$312.50</span></div>
            <div className="payroll-flow__pay"><span>Sara</span><span>$226.75</span></div>
            <div className="payroll-flow__pay"><span>Adam</span><span>$358.25</span></div>
            <div className="payroll-flow__pay"><span>Alex</span><span>$268.00</span></div>
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
