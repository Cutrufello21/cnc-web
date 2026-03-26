import React, { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import Revenue from './Revenue'
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
      // Get recent daily data for day-to-day analysis
      const [logsRes, stopsRes, timeOffRes] = await Promise.all([
        supabase.from('dispatch_logs').select('*').order('date', { ascending: false }).limit(15),
        supabase.from('daily_stops').select('driver_name, pharmacy, city, zip, cold_chain, delivery_date')
          .order('delivery_date', { ascending: false }).limit(2000),
        supabase.from('time_off_requests').select('driver_name, date_off, status')
          .eq('status', 'approved').gte('date_off', new Date().toISOString().split('T')[0]),
      ])

      const logs = (logsRes.data || []).reverse()
      const today = logs[logs.length - 1]
      const yesterday = logs[logs.length - 2]
      const sameDayLastWeek = logs.find(l => l.delivery_day === today?.delivery_day && l.date !== today?.date)

      // Driver stop counts today
      const todayDate = today?.date || ''
      const todayStops = (stopsRes.data || []).filter(s => s.delivery_date === todayDate)
      const driverCounts = {}
      todayStops.forEach(s => {
        if (!driverCounts[s.driver_name]) driverCounts[s.driver_name] = { total: 0, cc: 0, cities: new Set() }
        driverCounts[s.driver_name].total++
        if (s.cold_chain) driverCounts[s.driver_name].cc++
        if (s.city) driverCounts[s.driver_name].cities.add(s.city)
      })

      const sorted = Object.entries(driverCounts).sort((a, b) => b[1].total - a[1].total)
      const heaviest = sorted[0]
      const lightest = sorted[sorted.length - 1]
      const avg = sorted.length ? Math.round(sorted.reduce((s, d) => s + d[1].total, 0) / sorted.length) : 0

      // Imbalance detection
      const imbalanced = sorted.filter(([, d]) => Math.abs(d.total - avg) / avg > 0.4)

      // Cold chain concentration
      const ccDrivers = sorted.filter(([, d]) => d.cc > 0).map(([name, d]) => `${name} (${d.cc})`)

      // Compare to yesterday and same day last week
      const todayTotal = today?.orders_processed || 0
      const yesterdayTotal = yesterday?.orders_processed || 0
      const sameDayTotal = sameDayLastWeek?.orders_processed || 0
      const vsYesterday = yesterdayTotal ? Math.round(((todayTotal - yesterdayTotal) / yesterdayTotal) * 100) : 0
      const vsSameDay = sameDayTotal ? Math.round(((todayTotal - sameDayTotal) / sameDayTotal) * 100) : 0

      // Upcoming time off
      const upcoming = (timeOffRes.data || []).slice(0, 5)

      // ZIP frequency today
      const zipCounts = {}
      todayStops.forEach(s => { zipCounts[s.zip] = (zipCounts[s.zip] || 0) + 1 })
      const hotZips = Object.entries(zipCounts).sort((a, b) => b[1] - a[1]).slice(0, 3)

      const lines = []

      lines.push(`TODAY (${today?.delivery_day || '—'} ${today?.date || ''}):`)
      lines.push(`• ${todayTotal} orders — ${today?.shsp_orders || 0} SHSP, ${today?.aultman_orders || 0} Aultman`)
      if (vsYesterday) lines.push(`• ${vsYesterday >= 0 ? '+' : ''}${vsYesterday}% vs yesterday (${yesterdayTotal})`)
      if (vsSameDay) lines.push(`• ${vsSameDay >= 0 ? '+' : ''}${vsSameDay}% vs last ${today?.delivery_day} (${sameDayTotal})`)
      lines.push('')

      lines.push('DRIVER LOADS:')
      if (heaviest) lines.push(`• Heaviest: ${heaviest[0]} with ${heaviest[1].total} stops`)
      if (lightest && sorted.length > 1) lines.push(`• Lightest: ${lightest[0]} with ${lightest[1].total} stops`)
      lines.push(`• Average: ${avg} stops/driver (${sorted.length} active)`)
      if (imbalanced.length > 0) {
        lines.push(`• ⚠ Imbalanced: ${imbalanced.map(([n, d]) => `${n} (${d.total})`).join(', ')} — ${imbalanced.length > 0 && imbalanced[0][1].total > avg ? 'consider redistributing' : 'may need more stops'}`)
      }
      lines.push('')

      if (ccDrivers.length > 0) {
        lines.push('COLD CHAIN:')
        lines.push(`• ${today?.cold_chain || 0} total — ${ccDrivers.join(', ')}`)
        lines.push('')
      }

      if (hotZips.length > 0) {
        lines.push('BUSIEST ZIPS TODAY:')
        lines.push(`• ${hotZips.map(([z, c]) => `${z} (${c} orders)`).join(', ')}`)
        lines.push('')
      }

      if (today?.unassigned_count > 0) {
        lines.push('⚠ UNASSIGNED:')
        lines.push(`• ${today.unassigned_count} orders unassigned — check routing rules`)
        lines.push('')
      }

      if (upcoming.length > 0) {
        lines.push('UPCOMING TIME OFF:')
        upcoming.forEach(r => {
          const d = new Date(r.date_off + 'T12:00:00')
          lines.push(`• ${r.driver_name} — ${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`)
        })
      }

      setInsights(lines.join('\n'))
    } catch (err) {
      setInsights(`Error: ${err.message}`)
    } finally {
      setLoadingInsights(false)
    }
  }

  async function loadPayroll() {
    setLoading(true)
    try {
      // Get current week's Monday (use local date, not UTC)
      const now = new Date()
      const dayOfWeek = now.getDay()
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
      const monday = new Date(now)
      monday.setDate(now.getDate() + mondayOffset)
      const weekOf = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`

      const [payrollRes, driversRes, reconRes] = await Promise.all([
        supabase.from('payroll').select('*').eq('week_of', weekOf),
        supabase.from('drivers').select('*'),
        supabase.from('stop_reconciliation').select('*').eq('week_of', weekOf),
      ])

      // Build reconciliation lookup: { driverName: { Mon: { actual, locked }, ... } }
      const reconMap = {}
      ;(reconRes.data || []).forEach(r => {
        if (!reconMap[r.driver_name]) reconMap[r.driver_name] = {}
        reconMap[r.driver_name][r.day] = { actual: r.actual_stops, locked: r.locked, approved: r.approved, id: r.id }
      })

      const driverMap = {}
      ;(driversRes.data || []).forEach(d => { driverMap[d.driver_name] = d })

      const drivers = (payrollRes.data || []).map(p => {
        const d = driverMap[p.driver_name] || {}
        const mon = p.mon || 0, tue = p.tue || 0, wed = p.wed || 0
        const thu = p.thu || 0, fri = p.fri || 0
        const weekTotal = mon + tue + wed + thu + fri
        const willCalls = p.will_calls || 0
        const officeFee = parseFloat(d.office_fee) || 0
        const flatSalary = d.flat_salary ? parseFloat(d.flat_salary) : null
        const rateMth = parseFloat(d.rate_mth) || 0
        const rateWf = parseFloat(d.rate_wf) || 0

        let calculatedPay = 0
        if (flatSalary) {
          calculatedPay = flatSalary
        } else if (rateMth || rateWf) {
          const mthStops = mon + tue + thu
          const wfStops = wed + fri
          calculatedPay = (mthStops * rateMth) + (wfStops * rateWf) + (willCalls * 9)
          if (weekTotal > 0 || willCalls > 0) calculatedPay += officeFee
          else calculatedPay = 0
        }

        return {
          name: p.driver_name, id: p.driver_number,
          mon, tue, wed, thu, fri, weekTotal, willCalls, officeFee,
          rate: (rateMth || rateWf) ? { mth: rateMth, wf: rateWf } : null,
          flatSalary,
          calculatedPay: Math.round(calculatedPay * 100) / 100,
          sheetPay: parseFloat(p.weekly_pay) || 0,
          isBrad: p.driver_name === 'Brad',
          isFlat: !!flatSalary,
          rowIndex: p.id,
          recon: reconMap[p.driver_name] || null,
        }
      })

      const grandTotal = drivers.reduce((sum, d) => sum + d.calculatedPay, 0)

      setData({
        drivers,
        grandTotal: Math.round(grandTotal * 100) / 100,
        sheetTotal: drivers.reduce((sum, d) => sum + d.sheetPay, 0),
        weekOf: `${monday.getMonth() + 1}/${monday.getDate()}/${monday.getFullYear()}`,
        weekEnding: (() => {
          const sat = new Date(monday)
          sat.setDate(sat.getDate() + 5)
          return `${sat.getMonth() + 1}/${sat.getDate()}/${sat.getFullYear()}`
        })(),
      })
    } catch (err) {
      console.error('Payroll error:', err)
      setData(null)
    }
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
          <p style="color:rgba(255,255,255,0.6);margin:4px 0 0;font-size:14px">Payroll — Week Ending ${data?.weekEnding || today}</p>
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
      // 1. Send email to accountant via Google Apps Script webhook
      const weDate = data.weekEnding || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      const emailRes = await fetch('https://script.google.com/macros/s/AKfycbxw2xx2atYfnEfGzCaTmkDShmt96D1JsLFSckScOndB94RV2IGev63fpS7Ndc0GqSHWWQ/exec', {
        method: 'POST',
        body: JSON.stringify({
          action: 'email',
          to: 'mcutrufello2121@gmail.com',
          subject: `CC Delivery Payroll — Week Ending ${weDate}`,
          html: buildPayrollHtml(insights),
        }),
      })

      if (!emailRes.ok) {
        const errText = await emailRes.text()
        throw new Error(`Email failed: ${errText}`)
      }

      setApproved(true)
      showToast('Payroll approved and sent to accountant')
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

      {/* Driver Reconciliation */}
      {/* ReconSection temporarily removed — will rebuild */}

      {/* Revenue */}
      <Revenue weekOf={(() => {
        const now = new Date()
        const dow = now.getDay()
        const off = dow === 0 ? -6 : 1 - dow
        const mon = new Date(now)
        mon.setDate(mon.getDate() + off)
        return `${mon.getFullYear()}-${String(mon.getMonth()+1).padStart(2,'0')}-${String(mon.getDate()).padStart(2,'0')}`
      })()} driverPayroll={adjustedTotal} />

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

function ReconSection({ drivers }) {
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  const driversWithRecon = drivers.filter(d => d.recon && Object.keys(d.recon).length > 0)
  const [approved, setApproved] = useState({})

  useEffect(() => {
    // Check which drivers already have approved recon
    const map = {}
    driversWithRecon.forEach(d => {
      const allApproved = Object.values(d.recon).every(r => r.approved)
      if (allApproved && Object.keys(d.recon).length > 0) map[d.name] = true
    })
    setApproved(map)
  }, [drivers])

  async function handleApprove(driverName, reconEntries) {
    const ids = Object.values(reconEntries).filter(r => r.id).map(r => r.id)
    for (const id of ids) {
      await supabase.from('stop_reconciliation').update({ approved: true }).eq('id', id)
    }
    setApproved(prev => ({ ...prev, [driverName]: true }))
  }

  if (driversWithRecon.length === 0) return null

  return (
    <div className="pay__recon">
      <h3 className="pay__recon-title">Driver Reconciliation</h3>
      <p className="pay__recon-sub">Drivers reported their actual stop counts. Review and approve below.</p>
      <div className="pay__recon-table-wrap">
        <table className="pay__recon-table">
          <thead>
            <tr>
              <th>Driver</th>
              {DAYS.map(d => <th key={d} colSpan={2}>{d}</th>)}
              <th>Status</th>
              <th></th>
            </tr>
            <tr className="pay__recon-subhead">
              <th></th>
              {DAYS.map(d => (
                <React.Fragment key={d}>
                  <th>Disp</th>
                  <th>Actual</th>
                </React.Fragment>
              ))}
              <th></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {driversWithRecon.map(d => {
              let totalDisp = 0, totalActual = 0, hasAll = true
              DAYS.forEach(day => {
                const disp = d[day.toLowerCase()] || 0
                totalDisp += disp
                if (d.recon[day]?.actual != null) totalActual += d.recon[day].actual
                else hasAll = false
              })
              const totalDiff = totalActual - totalDisp
              const isApproved = approved[d.name]

              return (
                <tr key={d.name} className={isApproved ? 'pay__recon-row--approved' : ''}>
                  <td className="pay__recon-name">{d.name}</td>
                  {DAYS.map(day => {
                    const disp = d[day.toLowerCase()] || 0
                    const r = d.recon[day]
                    const actual = r?.actual
                    const hasActual = actual != null
                    const diff = hasActual ? actual - disp : null

                    return (
                      <React.Fragment key={day}>
                        <td className="pay__recon-num">{disp}</td>
                        <td className={`pay__recon-num ${!hasActual ? 'pay__recon-empty' : diff === 0 ? 'pay__recon-ok' : diff < 0 ? 'pay__recon-under' : 'pay__recon-over'}`}>
                          {hasActual ? (
                            <>
                              {actual}
                              {diff !== 0 && <span className="pay__recon-diff">({diff > 0 ? `+${diff}` : diff})</span>}
                              {r?.locked && <span className="pay__recon-lock" title="Locked by driver">🔒</span>}
                            </>
                          ) : '—'}
                        </td>
                      </React.Fragment>
                    )
                  })}
                  <td className="pay__recon-status">
                    {hasAll && totalDiff === 0 ? (
                      <span className="pay__recon-badge pay__recon-badge--ok">✓ Match</span>
                    ) : hasAll ? (
                      <span className={`pay__recon-badge ${totalDiff < 0 ? 'pay__recon-badge--under' : 'pay__recon-badge--over'}`}>
                        {totalDiff > 0 ? `+${totalDiff}` : totalDiff}
                      </span>
                    ) : (
                      <span className="pay__recon-badge pay__recon-badge--pending">Pending</span>
                    )}
                  </td>
                  <td>
                    {isApproved ? (
                      <span className="pay__recon-approved-tag">Approved</span>
                    ) : (
                      <button className="pay__recon-approve-btn" onClick={() => handleApprove(d.name, d.recon)}>
                        Approve
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
// rebuild 1774498926
