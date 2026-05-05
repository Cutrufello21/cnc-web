import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useTenant } from '../context/TenantContext'

export default function usePayrollData({ weekOffset, loadSettlements }) {
  const { tenant } = useTenant()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [reconApproved, setReconApproved] = useState({})
  const [edits, setEdits] = useState({})
  const [saving, setSaving] = useState(null)
  const [approved, setApproved] = useState(false)
  const [approving, setApproving] = useState(false)
  const [toast, setToast] = useState(null)
  const [insights, setInsights] = useState(null)
  const [loadingInsights, setLoadingInsights] = useState(false)
  const [expandedDriver, setExpandedDriver] = useState(null)

  useEffect(() => { loadPayroll() }, [weekOffset])

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
    setEdits({}) // Clear edits when switching weeks
    const tenantId = tenant?.id
    try {
      // Get target week's Monday (use local date, not UTC)
      const now = new Date()
      const dayOfWeek = now.getDay()
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
      const monday = new Date(now)
      monday.setDate(now.getDate() + mondayOffset + (weekOffset * 7))
      const weekOf = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`

      // Calculate week date range (Mon-Fri)
      const friday = new Date(monday)
      friday.setDate(monday.getDate() + 4)
      const fridayStr = `${friday.getFullYear()}-${String(friday.getMonth() + 1).padStart(2, '0')}-${String(friday.getDate()).padStart(2, '0')}`

      // Build date strings for each day Mon-Fri
      const weekDates = []
      for (let i = 0; i < 5; i++) {
        const d = new Date(monday)
        d.setDate(monday.getDate() + i)
        weekDates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
      }
      const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri']

      // Fetch each day separately to avoid Supabase 1000-row cap
      const [payrollRes, driversRes, reconRes, ...dailyResults] = await Promise.all([
        supabase.from('payroll').select('*').eq('week_of', weekOf),
        supabase.from('drivers').select('*'),
        supabase.from('stop_reconciliation').select('*').eq('week_of', weekOf).then(r => r).catch(() => ({ data: [] })),
        ...weekDates.map(date =>
          supabase.from('daily_stops').select('driver_name')
            .eq('delivery_date', date)
            .not('status', 'eq', 'DELETED')
            .limit(1000)
        ),
      ])

      // Count PACKAGES per driver per day (total rows, not unique addresses)
      // Drivers get paid per package delivered
      const actualStops = {}
      dailyResults.forEach((res, dayIdx) => {
        const dayKey = dayKeys[dayIdx]
        ;(res.data || []).forEach(s => {
          if (!s.driver_name) return
          if (!actualStops[s.driver_name]) actualStops[s.driver_name] = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 }
          actualStops[s.driver_name][dayKey]++
        })
      })

      const reconMap = {}
      const afternoonTotals = {}
      ;(reconRes.data || []).forEach(r => {
        if (!reconMap[r.driver_name]) reconMap[r.driver_name] = {}
        reconMap[r.driver_name][r.day] = { actual: r.actual_stops, locked: !!r.locked, approved: !!r.approved, id: r.id }
        if (r.afternoon_stops) {
          afternoonTotals[r.driver_name] = (afternoonTotals[r.driver_name] || 0) + r.afternoon_stops
        }
      })

      const driverMap = {}
      ;(driversRes.data || []).forEach(d => { driverMap[d.driver_name] = d })

      // Build payroll lookup from existing rows
      const payrollByName = {}
      ;(payrollRes.data || []).forEach(p => { payrollByName[p.driver_name] = p })

      // Include ALL active drivers (not just those with payroll rows)
      const activeDrivers = (driversRes.data || []).filter(d => d.active && d.driver_name !== 'Demo Driver')

      const drivers = activeDrivers.map(d => {
        const p = payrollByName[d.driver_name] || {}
        const actual = actualStops[d.driver_name]
        const recon = reconMap[d.driver_name] || {}
        // Priority: approved reconciliation > daily_stops auto-count
        // Manual edits are handled via getAdjustedPay/getDayValue (edits state)
        // and persist to payroll table via saveEdit
        const autoVal = (dayShort) => actual ? (actual[dayShort.toLowerCase()] || 0) : 0
        const pickDay = (dayShort) => {
          if (recon[dayShort]?.approved && recon[dayShort]?.actual != null) return recon[dayShort].actual
          return autoVal(dayShort)
        }
        const mon = pickDay('Mon')
        const tue = pickDay('Tue')
        const wed = pickDay('Wed')
        const thu = pickDay('Thu')
        const fri = pickDay('Fri')
        const weekTotal = mon + tue + wed + thu + fri
        // Locked reconciliation afternoon totals are authoritative; payroll.will_calls is fallback
        const willCalls = afternoonTotals[d.driver_name] != null ? afternoonTotals[d.driver_name] : (p.will_calls || 0)
        const officeFee = parseFloat(d.office_fee) || 0
        const flatSalary = d.flat_salary ? parseFloat(d.flat_salary) : null
        const rates = {
          mon: parseFloat(d.rate_mon) || 0,
          tue: parseFloat(d.rate_tue) || 0,
          wed: parseFloat(d.rate_wed) || 0,
          thu: parseFloat(d.rate_thu) || 0,
          fri: parseFloat(d.rate_fri) || 0,
        }
        const hasRates = Object.values(rates).some(r => r > 0)
        const wcRate = parseFloat(d.will_call_rate) || 9

        let calculatedPay = 0
        if (flatSalary) {
          calculatedPay = flatSalary
        } else if (hasRates) {
          calculatedPay = (mon * rates.mon) + (tue * rates.tue) + (wed * rates.wed) + (thu * rates.thu) + (fri * rates.fri) + (willCalls * wcRate)
          if (weekTotal > 0 || willCalls > 0) calculatedPay += officeFee
          else calculatedPay = 0
        } else if (willCalls > 0) {
          calculatedPay = willCalls * wcRate + officeFee
        }

        // Shadow per-stop rate for flat drivers — what they'd earn if paid per stop.
        // Mark/Dom: $9/stop + $10/will-call. Others: stored rates if any, else $7/$9.
        const isOperator = d.driver_name === 'Mark' || d.driver_name === 'Dom'
        const shadowStopRate = isOperator ? 9 : 7
        const shadowWcRate = isOperator ? 10 : (wcRate || 9)
        const shadowRates = (!isOperator && hasRates)
          ? rates
          : { mon: shadowStopRate, tue: shadowStopRate, wed: shadowStopRate, thu: shadowStopRate, fri: shadowStopRate }

        return {
          name: d.driver_name, id: d.driver_number,
          mon, tue, wed, thu, fri, weekTotal, willCalls, officeFee,
          rates: hasRates ? rates : null, wcRate,
          shadowRates, shadowWcRate,
          flatSalary,
          calculatedPay: Math.round(calculatedPay * 100) / 100,
          sheetPay: parseFloat(p.weekly_pay) || 0,
          isFlat: !!flatSalary,
          rowIndex: p.id || null,
          recon: reconMap[d.driver_name] || null,
        }
      })

      const grandTotal = drivers.reduce((sum, d) => sum + d.calculatedPay, 0)

      // Ensure all non-flat drivers have a payroll row (for will_calls, edits, etc.)
      const newDriverRows = drivers
        .filter(d => !d.isFlat && !payrollByName[d.name])
        .map(d => ({ week_of: weekOf, driver_name: d.name, tenant_id: tenantId }))
      if (newDriverRows.length > 0) {
        await supabase.from('payroll').insert(newDriverRows)
      }
      // Re-fetch IDs so edits work for all drivers
      const { data: freshRows } = await supabase.from('payroll').select('id, driver_name').eq('week_of', weekOf)
      if (freshRows) {
        const idMap = {}
        freshRows.forEach(r => { idMap[r.driver_name] = r.id })
        drivers.forEach(d => { if (idMap[d.name]) d.rowIndex = idMap[d.name] })
      }

      // Load manual overrides from localStorage (keyed by week)
      try {
        const saved = JSON.parse(localStorage.getItem(`payroll_edits_${weekOf}`) || '{}')
        if (Object.keys(saved).length > 0) {
          setEdits(prev => ({ ...saved, ...prev }))
        }
      } catch {}

      setData({
        drivers,
        grandTotal: Math.round(grandTotal * 100) / 100,
        sheetTotal: drivers.reduce((sum, d) => sum + d.sheetPay, 0),
        weekOf: `${monday.getMonth() + 1}/${monday.getDate()}/${monday.getFullYear()}`,
        _weekOfDate: weekOf,
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

      // Persist day overrides to localStorage so they survive page reloads
      if (['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(field) && data?.weekOf) {
        const weekKey = `payroll_edits_${data._weekOfDate}`
        const saved = JSON.parse(localStorage.getItem(weekKey) || '{}')
        saved[`${driver.name}:${field}`] = parseInt(value) || 0
        localStorage.setItem(weekKey, JSON.stringify(saved))
      }
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
    const tenantId = tenant?.id
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

      // 2. Sync payroll costs to settlements table for P&L tracking
      try {
        const weekOf = data.weekOf // "M/D/YYYY"
        const [m, d, y] = weekOf.split('/')
        const mondayStr = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
        // Find matching OpenForce week (Friday before this Monday, within 5 days)
        const monday = new Date(mondayStr + 'T12:00:00')
        const friday = new Date(monday); friday.setDate(friday.getDate() - 3)
        const ofWeek = `${friday.getFullYear()}-${String(friday.getMonth()+1).padStart(2,'0')}-${String(friday.getDate()).padStart(2,'0')}`

        const nameMap = { 'Theressa': 'Theresa', 'Robert': 'Bobby', 'Dominic': 'Dom' }
        for (const driver of data.drivers) {
          const pay = getAdjustedPay(driver)
          if (pay <= 0) continue
          const plName = nameMap[driver.name] || driver.name
          const { data: existing } = await supabase.from('settlements')
            .select('id').eq('week_of', ofWeek).eq('driver_name', plName).single()
          if (existing) {
            await supabase.from('settlements').update({ cost: pay }).eq('id', existing.id).eq('tenant_id', tenantId)
          } else {
            await supabase.from('settlements').insert({ week_of: ofWeek, driver_name: plName, revenue: 0, cost: pay, source: 'payroll-auto', tenant_id: tenantId })
          }
        }
      } catch (syncErr) { console.warn('Settlement sync:', syncErr.message) }

      // Auto-log payroll expense to company ledger
      try {
        const { data: lastLedger } = await supabase.from('company_ledger').select('running_balance').order('created_at', { ascending: false }).limit(1).single()
        const currentBal = lastLedger ? parseFloat(lastLedger.running_balance) : 0
        const weLabel = data.weekEnding || 'current week'
        await supabase.from('company_ledger').insert({
          date: new Date().toISOString().split('T')[0],
          type: 'expense',
          description: `Driver payroll — WE ${weLabel}`,
          amount: -adjustedTotal,
          running_balance: Math.round((currentBal - adjustedTotal) * 100) / 100,
          tenant_id: tenantId,
        })
      } catch (ledgerErr) { console.warn('Ledger sync:', ledgerErr.message) }

      setApproved(true)
      showToast('Payroll approved and sent to accountant')
      loadSettlements()
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
    const willCalls = parseInt(getEditedValue(driver.name, 'Will Calls', driver.willCalls)) || 0
    const rates = driver.rates
    if (!rates) return driver.calculatedPay

    const mon = getDayValue(driver, 'Mon')
    const tue = getDayValue(driver, 'Tue')
    const wed = getDayValue(driver, 'Wed')
    const thu = getDayValue(driver, 'Thu')
    const fri = getDayValue(driver, 'Fri')
    const total = mon + tue + wed + thu + fri

    let pay = (mon * rates.mon) + (tue * rates.tue) + (wed * rates.wed) + (thu * rates.thu) + (fri * rates.fri) + (willCalls * (driver.wcRate || 9))
    if (total > 0 || willCalls > 0) {
      pay += driver.officeFee
    } else {
      pay = 0
    }
    return Math.round(pay * 100) / 100
  }

  // Shadow per-stop pay for flat drivers — what they'd earn if paid per stop.
  // Returns null for non-flat drivers (their actual pay is already per-stop).
  function getPerStopShadow(driver) {
    if (!driver.isFlat) return null
    const rates = driver.shadowRates
    if (!rates) return null
    const mon = getDayValue(driver, 'Mon')
    const tue = getDayValue(driver, 'Tue')
    const wed = getDayValue(driver, 'Wed')
    const thu = getDayValue(driver, 'Thu')
    const fri = getDayValue(driver, 'Fri')
    const willCalls = parseInt(getEditedValue(driver.name, 'Will Calls', driver.willCalls)) || 0
    const wcRate = driver.shadowWcRate || 9
    const pay = (mon * rates.mon) + (tue * rates.tue) + (wed * rates.wed) + (thu * rates.thu) + (fri * rates.fri) + (willCalls * wcRate)
    return Math.round(pay * 100) / 100
  }

  return {
    data, loading, reconApproved, edits, saving, approved, approving,
    toast, insights, loadingInsights, expandedDriver, setExpandedDriver,
    loadPayroll, loadInsights, showToast, handleEdit, getEditedValue,
    hasEdits, saveEdit, buildPayrollHtml, handleApprove,
    getDayValue, getAdjustedTotal, getAdjustedPay, getPerStopShadow,
  }
}
