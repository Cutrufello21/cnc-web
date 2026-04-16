import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { dbUpdate } from '../../lib/db'
import Revenue from './Revenue'
import PLTab from './PLTab'
import usePayrollData from '../../hooks/usePayrollData'
import './Payroll.css'

export default function Payroll() {
  const [showRevenue, setShowRevenue] = useState(false)
  const [weekOffset, setWeekOffset] = useState(0)
  const [paySubTab, setPaySubTab] = useState('payroll')
  const [settlements, setSettlements] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const [showPL, setShowPL] = useState(false)


  const [allPayroll, setAllPayroll] = useState([])

  async function loadSettlements() {
    const [settRes, payRes, drvRes] = await Promise.all([
      supabase.from('settlements').select('*').order('week_of', { ascending: false }).limit(1000),
      supabase.from('payroll').select('driver_name, week_of, mon, tue, wed, thu, fri, will_calls').order('week_of', { ascending: false }).limit(1000),
      supabase.from('drivers').select('driver_name, rate_mth, rate_wf, office_fee, flat_salary'),
    ])
    setSettlements(settRes.data || [])

    // Calculate pay for each payroll row
    const drvMap = {}
    ;(drvRes.data || []).forEach(d => { drvMap[d.driver_name] = d })
    const payRows = (payRes.data || []).map(p => {
      const d = drvMap[p.driver_name] || {}
      const mon = p.mon || 0, tue = p.tue || 0, wed = p.wed || 0, thu = p.thu || 0, fri = p.fri || 0
      const wc = p.will_calls || 0
      const flat = d.flat_salary ? parseFloat(d.flat_salary) : null
      const rm = parseFloat(d.rate_mth) || 0, rw = parseFloat(d.rate_wf) || 0
      const of_ = parseFloat(d.office_fee) || 0
      let pay = 0
      if (flat) { pay = flat }
      else if (rm || rw) { const wcr = parseFloat(d.will_call_rate) || 9; pay = (mon + tue + thu) * rm + (wed + fri) * rw + wc * wcr; if (mon + tue + wed + thu + fri > 0 || wc > 0) pay += of_ }
      return { driver_name: p.driver_name, week_of: p.week_of, pay: Math.round(pay * 100) / 100 }
    })
    setAllPayroll(payRows)
  }

  useEffect(() => { loadSettlements() }, [])

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadResult(null)
    try {
      const res = await fetch('/api/upload-settlement', {
        method: 'POST',
        body: await file.arrayBuffer(),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error)
      setUploadResult(result)
      // Auto-log revenue to company ledger
      if (result.totalRevenue > 0) {
        try {
          const { data: lastLedger } = await supabase.from('company_ledger').select('running_balance').order('created_at', { ascending: false }).limit(1).single()
          const currentBal = lastLedger ? parseFloat(lastLedger.running_balance) : 0
          const weekRange = result.weeks?.length > 0 ? `${result.weeks[0]} to ${result.weeks[result.weeks.length - 1]}` : ''
          await supabase.from('company_ledger').insert({
            date: new Date().toISOString().split('T')[0],
            type: 'income',
            description: `OpenForce settlement — ${weekRange}`,
            amount: result.totalRevenue,
            running_balance: Math.round((currentBal + result.totalRevenue) * 100) / 100,
          })
          // ledger refreshes in PLTab
        } catch (ledgerErr) { console.warn('Ledger sync:', ledgerErr.message) }
      }
      loadSettlements()
    } catch (err) {
      setUploadResult({ error: err.message })
    }
    setUploading(false)
    e.target.value = ''
  }

  // Payroll data, editing, approval — managed by usePayrollData hook
  const {
    data, loading, reconApproved, edits, saving, approved, approving,
    toast, insights, loadingInsights, expandedDriver, setExpandedDriver,
    loadPayroll, loadInsights, showToast, handleEdit, getEditedValue,
    hasEdits, saveEdit, buildPayrollHtml, handleApprove,
    getDayValue, getAdjustedTotal, getAdjustedPay,
  } = usePayrollData({ weekOffset, loadSettlements })

  if (loading) return <div className="pay__loading"><div className="dispatch__spinner" />Loading payroll...</div>
  if (!data) return <div className="pay__loading">Failed to load payroll</div>

  const adjustedTotal = data.drivers.reduce((sum, d) => sum + getAdjustedPay(d), 0)

  return (
    <div className="pay">
      {toast && (
        <div className={`pay__toast ${toast.isErr ? 'pay__toast--err' : ''}`}>{toast.msg}</div>
      )}

      {/* Header */}
      <div className="pay__header">
        <div>
          <div className="pay__week-nav">
            <button className="pay__week-btn" onClick={() => setWeekOffset(w => w - 1)} title="Previous week">‹</button>
            <h3 className="pay__title">Weekly Payroll</h3>
            <button className="pay__week-btn" onClick={() => setWeekOffset(w => w + 1)} title="Next week">›</button>
            {weekOffset !== 0 && (
              <button className="pay__week-today" onClick={() => setWeekOffset(0)}>Today</button>
            )}
          </div>
          <p className="pay__sub">
            {data.weekEnding ? `Week Ending ${data.weekEnding}` : 'Review and adjust before sending to accountant'}
            {' — '}accumulated Mon-Fri, clears after approval
          </p>
        </div>
        <div className="pay__header-right">
          <div className="pay__grand-total">
            <span className="pay__grand-label">Total Payroll</span>
            <span className="pay__grand-value">${adjustedTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
          </div>
          <button
            className={`pay__approve ${approved ? 'pay__approve--done' : ''}`}
            onClick={handleApprove}
            disabled={approving || approved}
          >
            {approved ? 'Approved' : approving ? 'Approving...' : 'Approve & Send'}
          </button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 2, background: '#F0F2F7', padding: 3, borderRadius: 12, marginBottom: 20, width: 'fit-content' }}>
        {[['payroll', 'Payroll'], ['revenue', 'Revenue'], ['pl', 'P&L']].map(([key, label]) => (
          <button key={key} onClick={() => setPaySubTab(key)} style={{
            padding: '8px 20px', fontSize: 13, fontWeight: paySubTab === key ? 600 : 500,
            color: paySubTab === key ? '#0B1E3D' : '#9BA5B4', background: paySubTab === key ? '#fff' : 'transparent',
            borderRadius: 10, border: 'none', cursor: 'pointer', transition: 'all 0.15s',
            boxShadow: paySubTab === key ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
          }}>{label}</button>
        ))}
      </div>

      {/* Payroll table */}
      {paySubTab === 'payroll' && <>
      <div className="pay__table-wrap">
        <table className="pay__table">
          <thead>
            <tr>
              <th>Driver</th>
              <th>ID</th>
              <th className="pay__th-num">Mon</th>
              <th className="pay__th-num">Tue</th>
              <th className="pay__th-num">Wed</th>
              <th className="pay__th-num">Thu</th>
              <th className="pay__th-num">Fri</th>
              <th className="pay__th-num">Total</th>
              <th className="pay__th-num">Rate</th>
              <th className="pay__th-num">Will Calls</th>
              <th className="pay__th-num">Office Fee</th>
              <th className="pay__th-num pay__th-pay">Weekly Pay</th>
            </tr>
          </thead>
          <tbody>
            {data.drivers.map((d) => {
              const adjustedPay = getAdjustedPay(d)
              const payDiffers = Math.abs(adjustedPay - d.sheetPay) > 0.01 && d.sheetPay > 0
              const wcEdited = hasEdits(d.name, 'Will Calls')

              return (
                <tr key={d.name} className={d.isFlat ? 'pay__row--flat' : ''}>
                  <td className="pay__cell-name">{d.name}</td>
                  <td className="pay__cell-id">{d.id}</td>
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(day => {
                    const orig = d[day.toLowerCase()]
                    const dayEdited = hasEdits(d.name, day)
                    return (
                      <td key={day} className="pay__cell-edit">
                        {d.isFlat && d.name === 'Paul' ? '—' : (
                          <input
                            type="number"
                            className={`pay__edit-input pay__edit-input--day ${dayEdited ? 'pay__edit-input--changed' : ''}`}
                            value={getEditedValue(d.name, day, orig || '')}
                            onChange={(e) => handleEdit(d.name, day, e.target.value)}
                            onBlur={() => dayEdited && saveEdit(d, day)}
                            onKeyDown={(e) => e.key === 'Enter' && dayEdited && saveEdit(d, day)}
                            min="0"
                            placeholder="0"
                          />
                        )}
                      </td>
                    )
                  })}
                  <td className="pay__cell-num pay__cell-total">{getAdjustedTotal(d)}</td>
                  <td className="pay__cell-rate">
                    {d.isFlat ? 'Flat' : d.rate ? `$${d.rate.mth}/${d.rate.wf}` : '—'}
                  </td>

                  {/* Editable Will Calls */}
                  <td className="pay__cell-edit">
                    {d.isFlat ? '—' : (
                      <div className="pay__edit-wrap">
                        <input
                          type="number"
                          className={`pay__edit-input ${wcEdited ? 'pay__edit-input--changed' : ''}`}
                          value={getEditedValue(d.name, 'Will Calls', d.willCalls || '')}
                          onChange={(e) => handleEdit(d.name, 'Will Calls', e.target.value)}
                          onBlur={() => wcEdited && saveEdit(d, 'Will Calls')}
                          onKeyDown={(e) => e.key === 'Enter' && wcEdited && saveEdit(d, 'Will Calls')}
                          min="0"
                          placeholder="0"
                        />
                        {saving === `${d.name}:Will Calls` && <span className="pay__saving">...</span>}
                      </div>
                    )}
                  </td>

                  <td className={`pay__cell-num ${d.officeFee < 0 ? 'pay__cell-fee' : ''}`}>
                    {d.officeFee ? `$${d.officeFee}` : '—'}
                  </td>

                  <td className="pay__cell-pay">
                    <span className={payDiffers ? 'pay__adjusted' : ''}>
                      ${adjustedPay.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="pay__footer">
              <td colSpan={7}>TOTAL</td>
              <td className="pay__cell-num pay__cell-total">
                {data.drivers.reduce((s, d) => s + d.weekTotal, 0)}
              </td>
              <td></td>
              <td className="pay__cell-num">
                {data.drivers.reduce((s, d) => s + (parseInt(getEditedValue(d.name, 'Will Calls', d.willCalls)) || 0), 0)}
              </td>
              <td className="pay__cell-num pay__cell-fee">
                ${data.drivers.reduce((s, d) => s + d.officeFee, 0)}
              </td>
              <td className="pay__cell-pay pay__cell-grand">
                ${adjustedTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Rate reference */}
      <div className="pay__legend">
        <span>Rate format: Mon/Tue/Thu rate / Wed/Fri rate</span>
        <span>Will Calls: $9 each</span>
        <span>Flat: Mark $1,550 · Dom $2,500 · Paul $2,000</span>
      </div>

      {/* Driver Reconciliation */}
      {/* ReconSection temporarily removed — will rebuild */}

      {/* Reconciliation */}
      {(() => {
        const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
        const withRecon = (data.drivers || []).filter(d => d.recon && Object.keys(d.recon).length > 0)
        if (withRecon.length === 0) return null

        async function approveDriver(name, recon) {
          // Mark reconciliation rows as approved
          const ids = Object.values(recon).filter(r => r.id).map(r => r.id)
          for (const id of ids) {
            await dbUpdate('stop_reconciliation', { approved: true }, { id })
          }

          // Override payroll with driver's reported actual stop counts
          const driver = data.drivers.find(d => d.name === name)
          if (driver) {
            const dayFieldMap = { Mon: 'Mon', Tue: 'Tue', Wed: 'Wed', Thu: 'Thu', Fri: 'Fri' }
            for (const [day, field] of Object.entries(dayFieldMap)) {
              if (recon[day]?.actual != null) {
                await fetch('/api/payroll', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ driverRow: driver.rowIndex, field, value: recon[day].actual }),
                })
              }
            }
          }

          setReconApproved(prev => ({ ...prev, [name]: true }))
          await loadPayroll()
        }

        return (
          <div className="pay__recon">
            <h3 className="pay__recon-title">Driver Reconciliation ({withRecon.length} of {data.drivers.length} submitted)</h3>
            <p className="pay__recon-sub">Drivers reported their actual stop counts. Review and approve below.</p>
            <div className="pay__recon-table-wrap">
              <table className="pay__recon-table">
                <thead>
                  <tr>
                    <th>Driver</th>
                    {DAYS.map(d => <th key={d}>{d}</th>)}
                    <th>Diff</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {withRecon.map(d => {
                    let totalDisp = 0, totalActual = 0, complete = true
                    DAYS.forEach(day => {
                      totalDisp += d[day.toLowerCase()] || 0
                      if (d.recon[day]?.actual != null) totalActual += d.recon[day].actual
                      else complete = false
                    })
                    const diff = totalActual - totalDisp
                    const isApproved = reconApproved[d.name] || (Object.values(d.recon).length > 0 && Object.values(d.recon).every(r => r.approved))

                    return (
                      <tr key={d.name} className={isApproved ? 'pay__recon-row--approved' : ''}>
                        <td className="pay__recon-name">{d.name}</td>
                        {DAYS.map(day => {
                          const disp = d[day.toLowerCase()] || 0
                          const actual = d.recon[day]?.actual
                          const has = actual != null
                          const dd = has ? actual - disp : null
                          return (
                            <td key={day} className={`pay__recon-num ${!has ? 'pay__recon-empty' : dd === 0 ? 'pay__recon-ok' : dd < 0 ? 'pay__recon-under' : 'pay__recon-over'}`}>
                              {has ? `${actual}` : '—'}
                              {has && dd !== 0 ? <span className="pay__recon-diff"> ({dd > 0 ? '+' : ''}{dd})</span> : ''}
                            </td>
                          )
                        })}
                        <td className={`pay__recon-num ${!complete ? '' : diff === 0 ? 'pay__recon-ok' : diff < 0 ? 'pay__recon-under' : 'pay__recon-over'}`}>
                          {complete ? (diff === 0 ? 'Match' : (diff > 0 ? `+${diff}` : diff)) : 'Pending'}
                        </td>
                        <td>
                          {isApproved
                            ? <span className="pay__recon-approved-tag">Approved</span>
                            : <button className="pay__recon-approve-btn" onClick={() => approveDriver(d.name, d.recon)}>Approve</button>
                          }
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}

      </>}

      {/* Revenue sub-tab */}
      {paySubTab === 'revenue' && (
        <div style={{ background: '#fff', border: '1px solid #F0F2F7', borderRadius: 16, padding: 24 }}>
          <Revenue weekOf={(() => {
            const now = new Date()
            const dow = now.getDay()
            const off = dow === 0 ? -6 : 1 - dow
            const mon = new Date(now)
            mon.setDate(mon.getDate() + off)
            return `${mon.getFullYear()}-${String(mon.getMonth()+1).padStart(2,'0')}-${String(mon.getDate()).padStart(2,'0')}`
          })()} driverPayroll={adjustedTotal} />
        </div>
      )}

      {/* AI Insights — show on payroll tab */}
      {paySubTab === 'payroll' && <>
      <div className="pay__insights">
        <div className="pay__insights-header">
          <h3 className="pay__insights-title">AI Insights</h3>
          {!insights && !loadingInsights && (
            <button className="pay__insights-btn" onClick={loadInsights}>
              Generate Insights
            </button>
          )}
        </div>
        {loadingInsights && (
          <div className="pay__insights-loading">
            <div className="dispatch__spinner" />
            <span>Analyzing delivery data...</span>
          </div>
        )}
        {insights && (
          <div className="pay__insights-content">
            {insights.split('\n').map((line, i) => {
              if (line.match(/^(KEY INSIGHTS|ANOMALIES|RECOMMENDATIONS|PREDICTION):/)) {
                return <h4 key={i} className="pay__insights-section">{line.replace(':', '')}</h4>
              }
              if (line.startsWith('•')) {
                return <p key={i} className="pay__insights-bullet">{line}</p>
              }
              if (line.trim()) {
                return <p key={i} className="pay__insights-text">{line}</p>
              }
              return null
            })}
          </div>
        )}
        <p className="pay__insights-note">AI insights are included in the payroll email when you Approve & Send</p>
      </div>
      </>}

      {paySubTab === 'pl' && <PLTab payrollData={data} />}
    </div>
  )
}

