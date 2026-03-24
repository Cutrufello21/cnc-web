import { useState, useEffect } from 'react'
import './Payroll.css'

export default function Payroll() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [edits, setEdits] = useState({}) // { "driverName:field": value }
  const [saving, setSaving] = useState(null)
  const [approved, setApproved] = useState(false)
  const [approving, setApproving] = useState(false)
  const [toast, setToast] = useState(null)
  const [insights, setInsights] = useState(null)
  const [loadingInsights, setLoadingInsights] = useState(false)

  useEffect(() => { loadPayroll() }, [])

  async function loadInsights() {
    setLoadingInsights(true)
    try {
      const res = await fetch('/api/ai-insights')
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setInsights(d.insights)
    } catch (err) {
      setInsights(`Error loading insights: ${err.message}`)
    } finally {
      setLoadingInsights(false)
    }
  }

  async function loadPayroll() {
    setLoading(true)
    try {
      // Fetch both: payroll rates/config and snapshot for accumulated stops
      const [payrollRes, snapshotRes] = await Promise.all([
        fetch('/api/payroll'),
        fetch('/api/payroll?snapshot=true'),
      ])
      const payroll = await payrollRes.json()
      const snapshot = await snapshotRes.json()

      // Merge snapshot stops into payroll drivers
      if (snapshot.drivers) {
        const snapMap = {}
        snapshot.drivers.forEach(d => { snapMap[d.name] = d })

        payroll.drivers = payroll.drivers.map(d => {
          const snap = snapMap[d.name]
          if (snap) {
            // Use snapshot values (accumulated) instead of sheet values (may be cleared)
            return {
              ...d,
              mon: Math.max(d.mon, snap.Mon || 0),
              tue: Math.max(d.tue, snap.Tue || 0),
              wed: Math.max(d.wed, snap.Wed || 0),
              thu: Math.max(d.thu, snap.Thu || 0),
              fri: Math.max(d.fri, snap.Fri || 0),
              weekTotal: Math.max(d.weekTotal, snap.weekTotal || 0),
            }
          }
          return d
        })

        payroll.weekOf = snapshot.weekOf
      }

      setData(payroll)
    } catch { setData(null) }
    finally { setLoading(false) }
  }

  function showToast(msg, isErr) {
    setToast({ msg, isErr })
    setTimeout(() => setToast(null), 3000)
  }

  function handleEdit(driverName, field, value) {
    setEdits(prev => ({ ...prev, [`${driverName}:${field}`]: value }))
  }

  function getEditedValue(driverName, field, original) {
    const key = `${driverName}:${field}`
    return key in edits ? edits[key] : original
  }

  function hasEdits(driverName, field) {
    return `${driverName}:${field}` in edits
  }

  async function saveEdit(driver, field) {
    const key = `${driver.name}:${field}`
    const value = edits[key]
    if (value === undefined) return

    setSaving(key)
    try {
      const res = await fetch('/api/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverRow: driver.rowIndex, field, value }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)

      // Clear edit and reload
      setEdits(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      showToast(`${driver.name} ${field} updated`)
      await loadPayroll()
    } catch (err) {
      showToast(`Error: ${err.message}`, true)
    } finally {
      setSaving(null)
    }
  }

  function buildPayrollHtml(aiInsights) {
    if (!data?.drivers) return ''
    const rows = data.drivers.map(d => {
      const pay = getAdjustedPay(d)
      const total = getAdjustedTotal(d)
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:500">${d.name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${d.id}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${getDayValue(d, 'Mon')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${getDayValue(d, 'Tue')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${getDayValue(d, 'Wed')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${getDayValue(d, 'Thu')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${getDayValue(d, 'Fri')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;font-weight:700">${total}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:700">$${pay.toFixed(2)}</td>
      </tr>`
    }).join('')

    const grandTotal = data.drivers.reduce((s, d) => s + getAdjustedPay(d), 0)
    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

    return `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;max-width:700px;margin:0 auto">
        <div style="background:#0A2463;padding:24px 32px;border-radius:12px 12px 0 0">
          <h1 style="color:#6495ED;margin:0;font-size:20px">CNC Delivery</h1>
          <p style="color:rgba(255,255,255,0.6);margin:4px 0 0;font-size:14px">Weekly Payroll — ${today}</p>
        </div>
        <div style="padding:24px 32px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead>
              <tr style="background:#f9fafb">
                <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;border-bottom:2px solid #e5e7eb">Driver</th>
                <th style="padding:10px 12px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;border-bottom:2px solid #e5e7eb">ID</th>
                <th style="padding:10px 12px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;border-bottom:2px solid #e5e7eb">Mon</th>
                <th style="padding:10px 12px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;border-bottom:2px solid #e5e7eb">Tue</th>
                <th style="padding:10px 12px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;border-bottom:2px solid #e5e7eb">Wed</th>
                <th style="padding:10px 12px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;border-bottom:2px solid #e5e7eb">Thu</th>
                <th style="padding:10px 12px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;border-bottom:2px solid #e5e7eb">Fri</th>
                <th style="padding:10px 12px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;border-bottom:2px solid #e5e7eb">Total</th>
                <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#0A2463;border-bottom:2px solid #e5e7eb;background:#eef4ff">Pay</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr style="background:#f9fafb;border-top:2px solid #e5e7eb">
                <td colspan="8" style="padding:12px;font-weight:700;font-size:14px">TOTAL</td>
                <td style="padding:12px;text-align:right;font-weight:700;font-size:16px;color:#0A2463">$${grandTotal.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
          ${aiInsights ? `
          <div style="margin-top:28px;padding-top:24px;border-top:2px solid #6495ED">
            <h2 style="font-size:16px;color:#0A2463;margin:0 0 16px;font-weight:700">AI Insights — What the data is telling us</h2>
            <div style="font-size:13px;color:#374151;line-height:1.7;white-space:pre-wrap">${aiInsights.replace(/\n/g, '<br/>')}</div>
          </div>
          ` : ''}
          <p style="margin-top:20px;font-size:12px;color:#9ca3af">Sent from CNC Delivery Platform</p>
        </div>
      </div>
    `
  }

  async function handleApprove() {
    setApproving(true)
    try {
      // 1. Mark as approved
      const approveRes = await fetch('/api/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      })
      if (!approveRes.ok) throw new Error('Approval failed')

      // 2. Fetch AI insights
      let aiInsights = null
      try {
        const insightsRes = await fetch('/api/ai-insights')
        if (insightsRes.ok) {
          const insightsData = await insightsRes.json()
          aiInsights = insightsData.insights
          setInsights(aiInsights)
        }
      } catch {
        // AI insights are optional — don't block the email
      }

      // 3. Send email to accountant
      const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      const emailRes = await fetch('/api/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'email',
          to: 'mcutrufello2121@gmail.com',
          subject: `CNC Delivery — Weekly Payroll ${today}`,
          html: buildPayrollHtml(aiInsights),
        }),
      })
      const emailData = await emailRes.json()
      if (!emailRes.ok) throw new Error(emailData.error)

      // 3. Reset snapshot for next week
      await fetch('/api/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset-snapshot' }),
      })

      setApproved(true)
      showToast('Payroll approved and sent to accountant — snapshot cleared for next week')
    } catch (err) {
      showToast(`Error: ${err.message}`, true)
    } finally {
      setApproving(false)
    }
  }

  // Get edited day values
  function getDayValue(driver, day) {
    return parseInt(getEditedValue(driver.name, day, driver[day.toLowerCase()])) || 0
  }

  function getAdjustedTotal(driver) {
    return getDayValue(driver, 'Mon') + getDayValue(driver, 'Tue') + getDayValue(driver, 'Wed') + getDayValue(driver, 'Thu') + getDayValue(driver, 'Fri')
  }

  // Calculate adjusted pay for edited values
  function getAdjustedPay(driver) {
    if (driver.isFlat) return driver.flatSalary
    if (driver.isBrad) {
      const edited = getEditedValue(driver.name, 'Weekly Pay', driver.sheetPay)
      return parseFloat(edited) || 0
    }
    const willCalls = parseInt(getEditedValue(driver.name, 'Will Calls', driver.willCalls)) || 0
    const rate = driver.rate
    if (!rate) return driver.calculatedPay

    const mon = getDayValue(driver, 'Mon')
    const tue = getDayValue(driver, 'Tue')
    const wed = getDayValue(driver, 'Wed')
    const thu = getDayValue(driver, 'Thu')
    const fri = getDayValue(driver, 'Fri')
    const mthStops = mon + tue + thu
    const wfStops = wed + fri
    const total = mon + tue + wed + thu + fri

    let pay = (mthStops * rate.mth) + (wfStops * rate.wf) + (willCalls * 9)
    if (total > 0 || willCalls > 0) {
      pay += driver.officeFee
    } else {
      pay = 0
    }
    return Math.round(pay * 100) / 100
  }

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
          <h3 className="pay__title">Weekly Payroll</h3>
          <p className="pay__sub">
            {data.weekOf ? `Week of ${data.weekOf}` : 'Review and adjust before sending to accountant'}
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

      {/* Payroll table */}
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
                    {d.isFlat ? 'Flat' : d.isBrad ? 'Manual' : d.rate ? `$${d.rate.mth}/${d.rate.wf}` : '—'}
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

                  {/* Editable Weekly Pay (Brad only, or override) */}
                  <td className="pay__cell-pay">
                    {d.isBrad ? (
                      <div className="pay__edit-wrap">
                        <span className="pay__dollar">$</span>
                        <input
                          type="number"
                          className="pay__edit-input pay__edit-input--pay"
                          value={getEditedValue(d.name, 'Weekly Pay', d.sheetPay || '')}
                          onChange={(e) => handleEdit(d.name, 'Weekly Pay', e.target.value)}
                          onBlur={() => hasEdits(d.name, 'Weekly Pay') && saveEdit(d, 'Weekly Pay')}
                          onKeyDown={(e) => e.key === 'Enter' && hasEdits(d.name, 'Weekly Pay') && saveEdit(d, 'Weekly Pay')}
                          placeholder="0"
                        />
                        {saving === `${d.name}:Weekly Pay` && <span className="pay__saving">...</span>}
                      </div>
                    ) : (
                      <span className={payDiffers ? 'pay__adjusted' : ''}>
                        ${adjustedPay.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    )}
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
        <span>Brad: manual entry</span>
      </div>

      {/* AI Insights */}
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
    </div>
  )
}
