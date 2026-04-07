import { useState, useEffect } from 'react'
import './DriverAppDemo.css'

const STEP_DURATION = 3000 // ms per step
const STEPS = [
  'stopList',
  'arriving',
  'photoCapture',
  'signature',
  'note',
  'complete',
]

export default function DriverAppDemo() {
  const [step, setStep] = useState(0)
  const [active, setActive] = useState(true)

  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => {
      setStep(prev => (prev + 1) % STEPS.length)
    }, STEP_DURATION)
    return () => clearInterval(timer)
  }, [active])

  const currentStep = STEPS[step]

  return (
    <div className="demo-phone" onMouseEnter={() => setActive(false)} onMouseLeave={() => setActive(true)}>
      {/* Status bar */}
      <div className="demo-status-bar">
        <span className="demo-time">10:47</span>
        <div className="demo-notch" />
        <div className="demo-signals">
          <svg width="14" height="10" viewBox="0 0 14 10"><rect x="0" y="6" width="2" height="4" rx="0.5" fill="rgba(0,0,0,0.3)"/><rect x="3" y="4" width="2" height="6" rx="0.5" fill="rgba(0,0,0,0.3)"/><rect x="6" y="2" width="2" height="8" rx="0.5" fill="rgba(0,0,0,0.5)"/><rect x="9" y="0" width="2" height="10" rx="0.5" fill="rgba(0,0,0,0.5)"/></svg>
          <div className="demo-battery"><div className="demo-battery-fill" /></div>
        </div>
      </div>

      {/* Screen content */}
      <div className="demo-screen">
        {/* Step 1: Stop List */}
        <div className={`demo-step ${currentStep === 'stopList' ? 'demo-step--active' : ''}`}>
          <div className="demo-driver-bar">
            <div className="demo-driver-avatar">D</div>
            <div><div style={{fontWeight:700,fontSize:13,color:'#1a1a2e'}}>Dom</div><div style={{fontSize:9,color:'#94a3b8'}}>#55500 · Both</div></div>
            <div style={{marginLeft:'auto',display:'flex',gap:6}}>
              <div className="demo-stat-pill"><strong>21</strong><span>Stops</span></div>
              <div className="demo-stat-pill"><strong style={{color:'#2563eb'}}>44</strong><span>Cold</span></div>
            </div>
          </div>
          <div className="demo-progress-bar">
            <div className="demo-progress-fill" style={{width:'58%'}} />
            <span className="demo-progress-left">29/50 delivered</span>
            <span className="demo-progress-right">Done by 11:15</span>
          </div>
          <div className="demo-next-card">
            <div className="demo-next-badge">NEXT STOP</div>
            <div style={{display:'flex',gap:4,fontSize:9,color:'#94a3b8',marginBottom:6}}>
              <span>9 min · 4.3 mi</span>
              <span className="demo-eta-pill">ETA 11:13 AM</span>
            </div>
            <div style={{fontWeight:700,fontSize:13,color:'#1a1a2e'}}>17 Socrates Place Apt 17</div>
            <div style={{fontSize:10,color:'#64748b'}}>Akron, OH 44301</div>
            <div style={{fontSize:10,color:'#64748b'}}>Gindraw, Tisha Antionetta</div>
            <div className="demo-cold-tag">❄️ Cold</div>
            <div style={{display:'flex',gap:6,marginTop:10}}>
              <button className="demo-btn demo-btn--deliver">✓ Delivered</button>
              <button className="demo-btn demo-btn--navigate">↗ Navigate</button>
            </div>
          </div>
        </div>

        {/* Step 2: Arriving / Geofence */}
        <div className={`demo-step ${currentStep === 'arriving' ? 'demo-step--active' : ''}`}>
          <div className="demo-pod-header">
            <div className="demo-pod-steps">
              <div className="demo-pod-step demo-pod-step--active">Geofence</div>
              <div className="demo-pod-step">Photo</div>
              <div className="demo-pod-step">Signature</div>
              <div className="demo-pod-step">Note</div>
            </div>
          </div>
          <div className="demo-geo-area">
            <div className="demo-geo-ring demo-geo-ring--pulse" />
            <div className="demo-geo-pin">📍</div>
          </div>
          <div className="demo-geo-card">
            <div className="demo-geo-check">✓</div>
            <div>
              <div style={{fontWeight:600,fontSize:12,color:'#1a1a2e'}}>Geofence verified · 42 ft</div>
              <div style={{fontSize:10,color:'#94a3b8',fontFamily:'monospace'}}>41.0891° N, 81.5123° W</div>
            </div>
          </div>
        </div>

        {/* Step 3: Photo Capture */}
        <div className={`demo-step ${currentStep === 'photoCapture' ? 'demo-step--active' : ''}`}>
          <div className="demo-pod-header">
            <div className="demo-pod-steps">
              <div className="demo-pod-step demo-pod-step--done">Geofence</div>
              <div className="demo-pod-step demo-pod-step--active">Photo</div>
              <div className="demo-pod-step">Signature</div>
              <div className="demo-pod-step">Note</div>
            </div>
          </div>
          <div className="demo-camera">
            <div className="demo-viewfinder">
              <div className="demo-viewfinder-corners" />
              <div className="demo-viewfinder-text">Align package in frame</div>
            </div>
            <div style={{display:'flex',gap:8,padding:'12px 16px'}}>
              <button className="demo-capture-btn">📦 Package</button>
              <button className="demo-capture-btn demo-capture-btn--done">🏠 Door ✓</button>
            </div>
            <div style={{textAlign:'center',fontSize:9,color:'#94a3b8',paddingBottom:8}}>Both photos required</div>
          </div>
        </div>

        {/* Step 4: Signature */}
        <div className={`demo-step ${currentStep === 'signature' ? 'demo-step--active' : ''}`}>
          <div className="demo-pod-header">
            <div className="demo-pod-steps">
              <div className="demo-pod-step demo-pod-step--done">Geofence</div>
              <div className="demo-pod-step demo-pod-step--done">Photo</div>
              <div className="demo-pod-step demo-pod-step--active">Signature</div>
              <div className="demo-pod-step">Note</div>
            </div>
          </div>
          <div className="demo-sig-area">
            <div className="demo-sig-label">SIGNATURE</div>
            <div className="demo-sig-pad">
              <svg className="demo-sig-line" viewBox="0 0 220 60" fill="none">
                <path d="M10 40 Q30 10 50 35 Q70 55 90 30 Q110 10 130 40 Q150 55 170 25 Q185 15 200 35" stroke="#334155" strokeWidth="2" fill="none" strokeLinecap="round" />
              </svg>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',padding:'8px 0'}}>
              <span style={{fontSize:10,color:'#94a3b8'}}>Sign above</span>
              <button style={{fontSize:10,color:'#3b82f6',background:'none',border:'none',cursor:'pointer'}}>Clear</button>
            </div>
          </div>
          <button className="demo-btn demo-btn--deliver" style={{margin:'0 16px',width:'calc(100% - 32px)'}}>Confirm Signature</button>
        </div>

        {/* Step 5: Delivery Note */}
        <div className={`demo-step ${currentStep === 'note' ? 'demo-step--active' : ''}`}>
          <div className="demo-pod-header">
            <div className="demo-pod-steps">
              <div className="demo-pod-step demo-pod-step--done">Geofence</div>
              <div className="demo-pod-step demo-pod-step--done">Photo</div>
              <div className="demo-pod-step demo-pod-step--done">Signature</div>
              <div className="demo-pod-step demo-pod-step--active">Note</div>
            </div>
          </div>
          <div style={{padding:'16px'}}>
            <div className="demo-note-pills">
              <span className="demo-note-pill demo-note-pill--active">Front door</span>
              <span className="demo-note-pill">Back door</span>
              <span className="demo-note-pill">Mailbox</span>
              <span className="demo-note-pill">With neighbor</span>
            </div>
            <div className="demo-note-field">
              Left at front door per patient request<span className="demo-cursor" />
            </div>
          </div>
          <button className="demo-btn demo-btn--deliver" style={{margin:'12px 16px 0',width:'calc(100% - 32px)'}}>Complete Delivery</button>
        </div>

        {/* Step 6: Delivery Complete */}
        <div className={`demo-step ${currentStep === 'complete' ? 'demo-step--active' : ''}`}>
          <div className="demo-complete">
            <div className="demo-checkmark">✓</div>
            <div className="demo-complete-title">Delivered</div>
            <div className="demo-complete-summary">
              <div className="demo-summary-row"><span>Patient</span><span>Gindraw, Tisha A.</span></div>
              <div className="demo-summary-row"><span>Address</span><span>17 Socrates Pl, Akron</span></div>
              <div className="demo-summary-row"><span>GPS</span><span style={{fontFamily:'monospace',fontSize:9}}>41.0891°N, 81.5123°W</span></div>
              <div className="demo-summary-row"><span>Geofence</span><span style={{color:'#10b981',fontWeight:600}}>✓ Verified · 42 ft</span></div>
              <div className="demo-summary-row"><span>Photos</span><span style={{color:'#10b981',fontWeight:600}}>2 captured</span></div>
              <div className="demo-summary-row"><span>Signature</span><span style={{color:'#10b981',fontWeight:600}}>Obtained</span></div>
              <div className="demo-summary-row"><span>Cold Chain</span><span style={{color:'#2563eb',fontWeight:600}}>❄️ Verified</span></div>
              <div className="demo-summary-row"><span>Time</span><span>10:47 AM</span></div>
            </div>
            <button className="demo-btn demo-btn--deliver" style={{width:'100%',marginTop:10}}>Next Stop →</button>
          </div>
        </div>
      </div>

      {/* Step indicator dots */}
      <div className="demo-dots">
        {STEPS.map((s, i) => (
          <div key={s} className={`demo-dot ${i === step ? 'demo-dot--active' : ''}`} onClick={() => setStep(i)} />
        ))}
      </div>

      {/* Step labels */}
      <div className="demo-step-labels">
        {['Route', 'Geofence', 'Photo', 'Signature', 'Note', 'Complete'].map((label, i) => (
          <span key={i} className={i === step ? 'demo-step-label--active' : ''}>{label}</span>
        ))}
      </div>
    </div>
  )
}
