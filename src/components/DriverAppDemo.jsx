import { useState, useEffect, useRef } from 'react'
import './DriverAppDemo.css'

const STEP_DURATION = 3500
const STEPS = ['stopList', 'barcode', 'photo1', 'photo2', 'note', 'nextStop']

export default function DriverAppDemo() {
  const [step, setStep] = useState(0)
  const [active, setActive] = useState(true)
  const [focused, setFocused] = useState(false)
  const phoneRef = useRef(null)

  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => {
      setStep(prev => (prev + 1) % STEPS.length)
    }, STEP_DURATION)
    return () => clearInterval(timer)
  }, [active])

  useEffect(() => {
    const handleKey = (e) => {
      if (!focused) return
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        setActive(false)
        setStep(prev => (prev + 1) % STEPS.length)
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        setActive(false)
        setStep(prev => (prev - 1 + STEPS.length) % STEPS.length)
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        setActive(prev => !prev)
      } else if (e.key >= '1' && e.key <= '6') {
        e.preventDefault()
        setActive(false)
        setStep(parseInt(e.key, 10) - 1)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [focused])

  const currentStep = STEPS[step]

  return (
    <div
      ref={phoneRef}
      className="demo-phone"
      tabIndex={0}
      role="region"
      aria-label="Driver app interactive demo — use arrow keys to navigate, space to pause"
      onMouseEnter={() => { setActive(false); setFocused(true) }}
      onMouseLeave={() => { setActive(true); setFocused(false) }}
      onFocus={() => { setActive(false); setFocused(true) }}
      onBlur={() => setFocused(false)}
    >
      <div className="demo-screen">

        {/* Step 1: Stop List */}
        <div className={`demo-step ${currentStep === 'stopList' ? 'demo-step--active' : ''}`}>
          <div className="demo-status-bar">
            <span>12:07</span>
            <span className="demo-dynamic-island" />
            <span className="demo-status-right">&#9679;&#9679;&#9679; &#128246; &#128267;</span>
          </div>
          <div className="demo-driver-bar">
            <div className="demo-driver-avatar">D</div>
            <div className="demo-driver-meta">
              <div className="demo-driver-name">Dom</div>
              <div className="demo-driver-sub">#55500 <span className="demo-driver-tag">Aultman</span></div>
            </div>
            <div className="demo-bell">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            </div>
          </div>
          <div className="demo-stat-grid">
            <div className="demo-stat-card">
              <div className="demo-stat-num">15</div>
              <div className="demo-stat-lbl">Daily Stops</div>
            </div>
            <div className="demo-stat-card">
              <div className="demo-stat-num" style={{color:'#2563eb'}}>5</div>
              <div className="demo-stat-lbl">Cold Chain</div>
            </div>
            <div className="demo-stat-card">
              <svg width="20" height="16" viewBox="0 0 24 20" fill="none" stroke="#2563eb" strokeWidth="2" style={{margin:'2px auto 4px',display:'block'}}>
                <line x1="4" y1="16" x2="4" y2="10"/><line x1="10" y1="16" x2="10" y2="4"/><line x1="16" y1="16" x2="16" y2="8"/><line x1="22" y1="16" x2="22" y2="2"/>
              </svg>
              <div className="demo-stat-lbl">Weekly</div>
            </div>
          </div>
          <div className="demo-progress-bar">
            <div className="demo-progress-row">
              <span>0/15 delivered</span>
              <span>Done by 3:51 AM</span>
            </div>
            <div className="demo-progress-track"><div className="demo-progress-fill" style={{width:'0%'}} /></div>
          </div>
          <div className="demo-route-row">
            <span className="demo-route-badge">Route optimized</span>
            <span className="demo-reoptimize">Re-optimize</span>
          </div>
          <div className="demo-stops-header">
            <span>STOPS</span>
            <span className="demo-remaining">15 remaining <span className="demo-list-icon">&#9776;</span></span>
          </div>
          <div className="demo-next-card">
            <div className="demo-next-row">
              <span className="demo-next-badge">NEXT STOP</span>
              <span className="demo-next-meta">41 min &middot; 33.3 mi</span>
              <span className="demo-eta-pill">ETA 12:48 AM</span>
            </div>
            <div className="demo-stop-body">
              <div className="demo-stop-num">1</div>
              <div className="demo-stop-info">
                <div className="demo-stop-addr">123 Sample Street</div>
                <div className="demo-stop-city">Demo City, OH 44000</div>
                <div className="demo-stop-name">Sample, Patient A</div>
                <div className="demo-stop-order">Order #DEMO001</div>
              </div>
              <span className="demo-ofd-badge">OUT FOR DELIVERY</span>
            </div>
            <div className="demo-note-row">
              <span className="demo-note-icon">+</span>
              <span>Add delivery note for this address</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" style={{marginLeft:'auto'}}><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            </div>
            <div className="demo-action-row">
              <button className="demo-btn-deliver">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>
                Deliver
              </button>
              <button className="demo-btn-nav">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="#0A2463"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>
                Navigate
              </button>
            </div>
          </div>
          <div className="demo-travel-label">&#124; 5 min &middot; 2.2 mi &middot; ETA 12:55 AM</div>
          <div className="demo-stop-preview">
            <div className="demo-stop-drag">&#8801;</div>
            <div className="demo-stop-num demo-stop-num--muted">2</div>
            <div className="demo-stop-info">
              <div className="demo-stop-addr">456 Example Avenue</div>
              <div className="demo-stop-city">Demo City, OH 44000</div>
              <div className="demo-stop-name">Sample, Patient B</div>
            </div>
            <span className="demo-ofd-badge">OUT FOR DELIVERY</span>
          </div>
          <div className="demo-travel-label">&#124; 2 min &middot; 0.7 mi &middot; ETA 12:59 AM</div>
          <div className="demo-stop-peek">
            <div className="demo-stop-num" style={{background:'#3b82f6'}}>3</div>
            <div className="demo-stop-info">
              <div className="demo-stop-addr" style={{fontSize:10}}>789 Test Boulevard Unit C</div>
              <div className="demo-stop-city">Demo City, OH 44000</div>
            </div>
          </div>
          <div className="demo-bottom-nav">
            <div className="demo-nav-item demo-nav-item--active">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0A2463" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
              <span>Home</span>
            </div>
            <div className="demo-nav-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
              <span>Map</span>
            </div>
            <div className="demo-nav-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>
              <span>Team</span>
            </div>
            <div className="demo-nav-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="8" y2="18"/></svg>
              <span>Sort</span>
            </div>
            <div className="demo-nav-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>
              <span>More</span>
            </div>
          </div>
        </div>

        {/* Step 2: Scan Barcode */}
        <div className={`demo-step ${currentStep === 'barcode' ? 'demo-step--active' : ''}`}>
          <div className="demo-camera-screen">
            <div className="demo-camera-header">
              <span className="demo-x">&times;</span>
              <span className="demo-cam-title">Scan Package Barcode</span>
              <span style={{width:16}} />
            </div>
            <div className="demo-cam-sub">
              <div className="demo-cam-sub-title">Point camera at the package barcode</div>
              <div className="demo-cam-sub-meta">Sample, Patient A &middot; 123 Sample Street</div>
            </div>
            <div className="demo-scan-wrap">
              <div className="demo-scan-frame">
                <img src="/images/demo-bag.jpg" alt="" className="demo-scan-img" />
                <div className="demo-scan-corners">
                  <span /><span /><span /><span />
                </div>
              </div>
            </div>
            <div className="demo-scan-skip">No barcode on package &mdash; Skip</div>
          </div>
        </div>

        {/* Step 3: Photo 1 — preview of where the package was left */}
        <div className={`demo-step ${currentStep === 'photo1' ? 'demo-step--active' : ''}`}>
          <div className="demo-preview-screen">
            <div className="demo-preview-header">
              <div className="demo-preview-title">Photo 1 of 2 &mdash; Where you left the package</div>
              <div className="demo-preview-meta">Sample, Patient A &middot; 123 Sample Street</div>
            </div>
            <div
              className="demo-preview-area"
              style={{ backgroundImage: 'url(/images/demo-porch.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}
            />
            <div className="demo-preview-actions">
              <button className="demo-preview-btn demo-preview-btn--retake">Retake</button>
              <button className="demo-preview-btn demo-preview-btn--use">Use Photo</button>
            </div>
          </div>
        </div>

        {/* Step 4: Photo 2 — preview of the house */}
        <div className={`demo-step ${currentStep === 'photo2' ? 'demo-step--active' : ''}`}>
          <div className="demo-preview-screen">
            <div className="demo-preview-header">
              <div className="demo-preview-title">Photo 2 of 2 &mdash; The house or front door</div>
              <div className="demo-preview-meta">Sample, Patient A &middot; 123 Sample Street</div>
            </div>
            <div
              className="demo-preview-area"
              style={{ backgroundImage: 'url(/images/demo-house.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}
            />
            <div className="demo-preview-actions">
              <button className="demo-preview-btn demo-preview-btn--retake">Retake</button>
              <button className="demo-preview-btn demo-preview-btn--use">Use Photo</button>
            </div>
          </div>
        </div>

        {/* Step 5: Delivery Note (empty / initial) */}
        <div className={`demo-step ${currentStep === 'note' ? 'demo-step--active' : ''}`}>
          <div className="demo-note-screen">
            <div className="demo-note-header">
              <div>
                <div className="demo-note-title">Delivery Note</div>
                <div className="demo-note-name">Sample, Patient A</div>
                <div className="demo-note-addr">123 Sample Street</div>
              </div>
              <span className="demo-note-close">&times;</span>
            </div>
            <div className="demo-note-section-label">WHERE WAS IT LEFT?</div>
            <div className="demo-note-pills">
              <span className="demo-note-pill demo-note-pill--selected">Front door</span>
              <span className="demo-note-pill">Back door</span>
              <span className="demo-note-pill">Handed to patient</span>
              <span className="demo-note-pill">Left with neighbor</span>
              <span className="demo-note-pill">Mailbox</span>
              <span className="demo-note-pill">Other</span>
            </div>
            <div className="demo-note-section-label">ADD DETAILS (OPTIONAL)</div>
            <div className="demo-note-field">
              <span className="demo-note-text">Left at front door</span>
              <span className="demo-char-count">18/200</span>
            </div>
            <div className="demo-note-spacer" />
            <div className="demo-note-footer">
              <button className="demo-note-complete">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>
                Complete Delivery
              </button>
            </div>
          </div>
        </div>

        {/* Step 6: Complete to next stop (overlay + bottom sheet) */}
        <div className={`demo-step ${currentStep === 'nextStop' ? 'demo-step--active' : ''}`}>
          <div className="demo-delivered-bg">
            <div className="demo-delivered-check">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <div className="demo-delivered-title">Stop delivered!</div>
            <div className="demo-delivered-sub">Stop 1 of 15 complete</div>
          </div>
          <div className="demo-sheet">
            <div className="demo-sheet-accent" />
            <div className="demo-sheet-handle" />
            <div className="demo-sheet-label">NEXT STOP</div>
            <div className="demo-sheet-name">Sample, Patient B</div>
            <div className="demo-sheet-addr">456 Example Avenue, Demo City</div>
            <div className="demo-sheet-order">Order #DEMO002</div>
            <div className="demo-sheet-pills">
              <span className="demo-info-pill">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#0A2463" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                40 min
              </span>
              <span className="demo-info-pill">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="#0A2463"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>
                35.6 mi
              </span>
              <span className="demo-info-pill">Stop 2 of 15</span>
            </div>
            <div className="demo-sheet-actions">
              <button className="demo-sheet-skip">Skip</button>
              <button className="demo-sheet-nav">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>
                Navigate to Stop
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
