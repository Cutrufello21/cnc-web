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

  useEffect(() => { loadPayroll() }, [])

  async function loadPayroll() {
    setLoading(true)
    try {
      const res = await fetch('/api/payroll')
      setData(await res.json())
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

  async function handleApprove() {
    setApproving(true)
    try {
      const res = await fetch('/api/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setApproved(true)
      showToast('Payroll approved and ready to send')
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
          <p className="pay__sub">Review and adjust before sending to accountant</p>
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
    </div>
  )
}
