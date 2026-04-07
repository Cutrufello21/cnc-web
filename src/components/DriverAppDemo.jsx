import { useState, useEffect } from 'react'
import './DriverAppDemo.css'

const STEP_DURATION = 3500
const STEPS = ['stopList', 'delivered', 'nextStop', 'photo1', 'photo2', 'note', 'complete']

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
      <div className="demo-screen">

        {/* Step 1: Stop List */}
        <div className={`demo-step ${currentStep === 'stopList' ? 'demo-step--active' : ''}`}>
          <div className="demo-driver-bar">
            <div className="demo-driver-avatar">D</div>
            <div><div style={{fontWeight:700,fontSize:13,color:'#1a1a2e'}}>Dom</div><div style={{fontSize:9,color:'#94a3b8'}}>#55500 · Both</div></div>
            <div style={{marginLeft:'auto',display:'flex',gap:4}}>
              <div className="demo-stat-pill"><strong>50</strong><span>Daily Stops</span></div>
              <div className="demo-stat-pill"><strong style={{color:'#2563eb'}}>44</strong><span>Cold Chain</span></div>
              <div className="demo-stat-pill" style={{padding:'4px 6px'}}><strong style={{fontSize:12}}>📊</strong><span>Weekly</span></div>
            </div>
          </div>
          <div className="demo-progress-bar">
            <div className="demo-progress-fill" style={{width:'58%'}} />
            <span className="demo-progress-left">29/50 delivered</span>
            <span className="demo-progress-right">Done by 11:15 AM</span>
          </div>
          <div style={{padding:'0 12px',display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
            <span className="demo-route-badge">Route optimized</span>
            <span style={{fontSize:9,color:'#3b82f6'}}>Re-optimize</span>
          </div>
          <div className="demo-route-summary">21 stops → Home<br/><span style={{fontSize:9,color:'#94a3b8'}}>18.9 mi driving distance</span></div>
          <div style={{padding:'0 12px',display:'flex',justifyContent:'space-between',alignItems:'center',margin:'6px 0'}}>
            <span style={{fontSize:10,fontWeight:600,color:'#64748b',textTransform:'uppercase',letterSpacing:0.5}}>Stops</span>
            <span style={{fontSize:9,color:'#94a3b8'}}>21 remaining</span>
          </div>
          <div className="demo-next-card">
            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
              <span className="demo-next-badge">NEXT STOP</span>
              <span style={{fontSize:8,color:'#94a3b8'}}>9 min · 4.3 mi</span>
              <span className="demo-eta-pill">ETA 11:13 AM</span>
            </div>
            <div style={{display:'flex',gap:8,alignItems:'flex-start'}}>
              <div className="demo-stop-num">1</div>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:12,color:'#1a1a2e'}}>17 Socrates Place Apt 17</div>
                <div style={{fontSize:9,color:'#64748b'}}>Akron, OH 44301</div>
                <div style={{fontSize:9,color:'#64748b'}}>Gindraw, Tisha Antionetta</div>
                <div style={{fontSize:8,color:'#94a3b8'}}>Order #13194802</div>
                <div className="demo-cold-tag">❄️ Cold</div>
              </div>
              <span className="demo-cc-badge">COLD CHAIN</span>
            </div>
            <div style={{fontSize:9,color:'#94a3b8',padding:'6px 0',borderTop:'1px solid #f1f5f9',marginTop:8,display:'flex',alignItems:'center',gap:4}}>
              <span>⊕</span> Add delivery note for this address
            </div>
            <div style={{display:'flex',gap:6,marginTop:6}}>
              <button className="demo-btn demo-btn--deliver">✓ Delivered</button>
              <button className="demo-btn demo-btn--navigate">↗ Navigate</button>
            </div>
          </div>
        </div>

        {/* Step 2: Stop Delivered overlay */}
        <div className={`demo-step ${currentStep === 'delivered' ? 'demo-step--active' : ''}`}>
          <div className="demo-delivered-bg">
            <div className="demo-delivered-check">✓</div>
            <div className="demo-delivered-title">Stop delivered!</div>
            <div className="demo-delivered-sub">Stop 45 of 50 complete</div>
            <div style={{display:'flex',gap:6,width:'80%',marginTop:16}}>
              <button className="demo-btn demo-btn--deliver" style={{flex:2}}>✓ Next Stop</button>
              <button className="demo-btn demo-btn--navigate" style={{flex:1,fontSize:10}}>Details</button>
            </div>
          </div>
        </div>

        {/* Step 3: Next Stop sheet */}
        <div className={`demo-step ${currentStep === 'nextStop' ? 'demo-step--active' : ''}`}>
          <div className="demo-delivered-bg" style={{justifyContent:'flex-start',paddingTop:40}}>
            <div className="demo-delivered-check" style={{width:48,height:48,fontSize:22}}>✓</div>
            <div className="demo-delivered-title" style={{fontSize:16}}>Stop delivered!</div>
            <div className="demo-delivered-sub">Stop 45 of 50 complete</div>
          </div>
          <div className="demo-sheet">
            <div className="demo-sheet-handle" />
            <div style={{fontSize:9,fontWeight:600,color:'#94a3b8',textTransform:'uppercase',letterSpacing:0.5,marginBottom:4}}>Next Stop</div>
            <div style={{fontWeight:700,fontSize:14,color:'#1a1a2e'}}>Meckler, Daniel</div>
            <div style={{fontSize:11,color:'#64748b'}}>756 East Waterloo Road, Akron</div>
            <div style={{fontSize:9,color:'#94a3b8'}}>Order #13194355</div>
            <div style={{display:'flex',gap:6,margin:'10px 0'}}>
              <span className="demo-info-pill">⏱ 9 min</span>
              <span className="demo-info-pill">↗ 4.2 mi</span>
              <span className="demo-info-pill">Stop 7 of 50</span>
            </div>
            <div style={{display:'flex',gap:6}}>
              <button style={{flex:0,padding:'8px 16px',borderRadius:8,background:'#f8f9fb',border:'1px solid #e2e8f0',fontSize:11,fontWeight:600,color:'#64748b',cursor:'default',fontFamily:'inherit'}}>Skip</button>
              <button style={{flex:1,padding:'8px 16px',borderRadius:8,background:'#0A2463',border:'none',fontSize:11,fontWeight:600,color:'white',cursor:'default',fontFamily:'inherit'}}>↗ Navigate to Stop</button>
            </div>
          </div>
        </div>

        {/* Step 4: Photo 1 */}
        <div className={`demo-step ${currentStep === 'photo1' ? 'demo-step--active' : ''}`}>
          <div className="demo-camera-screen">
            <div className="demo-camera-header">
              <span style={{fontSize:16}}>✕</span>
              <span style={{fontWeight:600,fontSize:13}}>Take delivery photos</span>
              <span style={{fontSize:14}}>⚡</span>
            </div>
            <div style={{padding:'0 16px',marginBottom:8}}>
              <div style={{fontSize:12,fontWeight:500,color:'rgba(255,255,255,0.9)'}}>Photo 1 of 2 — Where you left the package</div>
              <div style={{fontSize:10,color:'rgba(255,255,255,0.5)'}}>Medlock, Lizabeth · 1410 Brown Street</div>
              <div style={{display:'flex',gap:4,marginTop:6}}>
                <div className="demo-photo-dot" />
                <div className="demo-photo-dot demo-photo-dot--inactive" />
              </div>
            </div>
            <div style={{flex:1}} />
            <div className="demo-shutter">
              <div className="demo-shutter-btn" />
            </div>
          </div>
        </div>

        {/* Step 5: Photo 2 */}
        <div className={`demo-step ${currentStep === 'photo2' ? 'demo-step--active' : ''}`}>
          <div className="demo-camera-screen">
            <div className="demo-camera-header">
              <span style={{fontSize:16}}>✕</span>
              <span style={{fontWeight:600,fontSize:13}}>Take delivery photos</span>
              <span style={{fontSize:14}}>⚡</span>
            </div>
            <div style={{padding:'0 16px',marginBottom:8}}>
              <div style={{fontSize:12,fontWeight:500,color:'rgba(255,255,255,0.9)'}}>Photo 2 of 2 — The house or front door</div>
              <div style={{fontSize:10,color:'rgba(255,255,255,0.5)'}}>Medlock, Lizabeth · 1410 Brown Street</div>
              <div style={{display:'flex',gap:4,marginTop:6}}>
                <div className="demo-photo-dot demo-photo-dot--done" />
                <div className="demo-photo-dot" />
              </div>
            </div>
            <div style={{flex:1}} />
            <div className="demo-shutter">
              <div className="demo-shutter-btn" />
            </div>
          </div>
        </div>

        {/* Step 6: Delivery Note */}
        <div className={`demo-step ${currentStep === 'note' ? 'demo-step--active' : ''}`}>
          <div className="demo-note-screen">
            <div style={{padding:'16px 16px 0'}}>
              <div style={{fontSize:20,fontWeight:700,color:'#1a1a2e',marginBottom:4}}>Where did you leave it?</div>
              <div style={{fontSize:12,color:'#94a3b8',marginBottom:16}}>This message goes to the patient</div>
              <div className="demo-note-pills">
                <span className="demo-note-pill demo-note-pill--selected">Front door</span>
                <span className="demo-note-pill">Back door</span>
                <span className="demo-note-pill">Mailbox</span>
                <span className="demo-note-pill">With neighbor</span>
                <span className="demo-note-pill">Left with patient</span>
                <span className="demo-note-pill">Other</span>
              </div>
              <div className="demo-note-field">
                Front door<span className="demo-cursor" />
                <span className="demo-char-count">10/200</span>
              </div>
            </div>
            <div style={{marginTop:'auto',padding:16}}>
              <button className="demo-complete-btn">Complete Delivery</button>
            </div>
          </div>
        </div>

        {/* Step 7: Delivery Complete */}
        <div className={`demo-step ${currentStep === 'complete' ? 'demo-step--active' : ''}`}>
          <div className="demo-complete-screen">
            <div className="demo-complete-check">✓</div>
            <div style={{fontSize:18,fontWeight:700,color:'#1a1a2e',marginBottom:4}}>Delivery Complete</div>
            <div style={{fontSize:11,color:'#94a3b8',marginBottom:16}}>All proof captured · 10:47 AM</div>
            <div className="demo-pod-summary">
              <div className="demo-pod-row"><span>Patient</span><span>Gindraw, Tisha A.</span></div>
              <div className="demo-pod-row"><span>Address</span><span>17 Socrates Pl, Akron</span></div>
              <div className="demo-pod-row"><span>GPS</span><span style={{fontFamily:'monospace',fontSize:9}}>41.0891°N</span></div>
              <div className="demo-pod-row"><span>Geofence</span><span style={{color:'#10b981',fontWeight:600}}>✓ Verified</span></div>
              <div className="demo-pod-row"><span>Photos</span><span style={{color:'#10b981',fontWeight:600}}>2 of 2</span></div>
              <div className="demo-pod-row"><span>Signature</span><span style={{color:'#10b981',fontWeight:600}}>Captured</span></div>
              <div className="demo-pod-row"><span>Cold Chain</span><span style={{color:'#2563eb',fontWeight:600}}>❄️ Verified</span></div>
              <div className="demo-pod-row"><span>Note</span><span>Front door</span></div>
            </div>
            <button className="demo-btn demo-btn--deliver" style={{width:'100%',marginTop:12}}>Next Stop →</button>
          </div>
        </div>
      </div>

      {/* Step indicator */}
      <div className="demo-dots">
        {STEPS.map((s, i) => (
          <div key={s} className={`demo-dot ${i === step ? 'demo-dot--active' : ''}`} onClick={() => setStep(i)} />
        ))}
      </div>
      <div className="demo-step-labels">
        {['Route', 'Delivered', 'Next', 'Photo 1', 'Photo 2', 'Note', 'POD'].map((label, i) => (
          <span key={i} className={i === step ? 'demo-step-label--active' : ''}>{label}</span>
        ))}
      </div>
    </div>
  )
}
