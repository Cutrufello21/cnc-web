import { supabase } from './_lib/supabase.js'
import { parseBody } from './_lib/sheets.js'

// GET /api/payroll — returns payroll data with calculated pay

export default async function handler(req, res) {
  if (req.method === 'GET') return handleGet(req, res)
  if (req.method === 'POST') return handlePost(req, res)
  return res.status(405).json({ error: 'Method not allowed' })
}

async function handleGet(req, res) {
  try {
    // Get current week's Monday
    const now = new Date()
    const dayOfWeek = now.getDay()
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const monday = new Date(now)
    monday.setDate(now.getDate() + mondayOffset)
    const weekOf = monday.toISOString().split('T')[0]

    // Fetch payroll and driver data in parallel
    const [payrollRes, driversRes] = await Promise.all([
      supabase.from('payroll').select('*').eq('week_of', weekOf),
      supabase.from('drivers').select('*').eq('active', true),
    ])

    if (payrollRes.error) throw payrollRes.error

    const payrollMap = {}
    ;(payrollRes.data || []).forEach(p => { payrollMap[p.driver_name] = p })

    // Include ALL active drivers who get paid in any way
    const activeDrivers = (driversRes.data || []).filter(d => {
      return d.driver_name !== 'Demo Driver'
    })

    // Auto-create payroll rows for drivers missing them (one at a time to avoid batch failures)
    const missingDrivers = activeDrivers.filter(d => !payrollMap[d.driver_name])
    for (const d of missingDrivers) {
      try {
        const { data: inserted, error: insertErr } = await supabase.from('payroll').insert({
          driver_name: d.driver_name,
          driver_number: d.driver_number || '',
          week_of: weekOf,
          mon: 0, tue: 0, wed: 0, thu: 0, fri: 0,
          week_total: 0, will_calls: 0, weekly_pay: 0,
        }).select()
        if (insertErr) console.error(`[payroll] auto-create ${d.driver_name}:`, insertErr.message)
        if (inserted?.[0]) payrollMap[d.driver_name] = inserted[0]
      } catch (e) {
        console.error(`[payroll] auto-create ${d.driver_name}:`, e.message)
      }
      // Even if insert fails, ensure driver appears with zeroes
      if (!payrollMap[d.driver_name]) {
        payrollMap[d.driver_name] = { driver_name: d.driver_name, driver_number: d.driver_number, mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, will_calls: 0, weekly_pay: 0 }
      }
    }

    const drivers = activeDrivers.map(d => {
      const p = payrollMap[d.driver_name] || {}
      const mon = p.mon || 0, tue = p.tue || 0, wed = p.wed || 0
      const thu = p.thu || 0, fri = p.fri || 0
      const weekTotal = mon + tue + wed + thu + fri
      const willCalls = p.will_calls || 0
      const officeFee = parseFloat(d.office_fee) || 0
      const flatSalary = d.flat_salary ? parseFloat(d.flat_salary) : null
      const rateMth = parseFloat(d.rate_mth) || 0
      const rateWf = parseFloat(d.rate_wf) || 0

      const wcRate = parseFloat(d.will_call_rate) || 9
      let calculatedPay = 0
      if (flatSalary) {
        calculatedPay = flatSalary
      } else if (rateMth || rateWf) {
        const mthStops = mon + tue + thu
        const wfStops = wed + fri
        calculatedPay = (mthStops * rateMth) + (wfStops * rateWf) + (willCalls * wcRate)
        if (weekTotal > 0 || willCalls > 0) {
          calculatedPay += officeFee
        } else {
          calculatedPay = 0
        }
      } else if (willCalls > 0) {
        // Will-call-only drivers (like Brad) — no base rate, paid per PM delivery
        calculatedPay = willCalls * wcRate + officeFee
      }

      const sheetPay = parseFloat(p.weekly_pay) || 0

      return {
        name: d.driver_name,
        id: d.driver_number,
        mon, tue, wed, thu, fri,
        weekTotal, willCalls, officeFee,
        rate: (rateMth || rateWf) ? { mth: rateMth, wf: rateWf } : null,
        flatSalary,
        calculatedPay: Math.round(calculatedPay * 100) / 100,
        sheetPay,
        isBrad: d.driver_name === 'Brad',
        isFlat: !!flatSalary,
        rowIndex: p.id || null,
      }
    })

    const grandTotal = drivers.reduce((sum, d) => sum + d.calculatedPay, 0)

    return res.status(200).json({
      drivers,
      grandTotal: Math.round(grandTotal * 100) / 100,
      sheetTotal: drivers.reduce((sum, d) => sum + d.sheetPay, 0),
    })
  } catch (err) {
    console.error('[payroll GET]', err.message)
    return res.status(500).json({ error: err.message })
  }
}

// POST /api/payroll — update a driver's pay or will calls
async function handlePost(req, res) {
  const data = await parseBody(req)

  if (data.action === 'approve') {
    return res.status(200).json({ success: true, approvedAt: new Date().toISOString() })
  }

  if (data.action === 'reset-snapshot') {
    return res.status(200).json({ success: true, message: 'Snapshot reset' })
  }

  const { driverRow, field, value } = data
  if (!driverRow || !field) {
    return res.status(400).json({ error: 'Missing driverRow or field' })
  }

  const fieldMap = {
    'Will Calls': 'will_calls',
    'Weekly Pay': 'weekly_pay',
    'Mon': 'mon', 'Tue': 'tue', 'Wed': 'wed', 'Thu': 'thu', 'Fri': 'fri',
  }

  const col = fieldMap[field]
  if (!col) return res.status(400).json({ error: `Invalid field: ${field}` })

  try {
    const updateVal = col === 'weekly_pay' ? parseFloat(value) || 0 : parseInt(value) || 0
    const { error } = await supabase.from('payroll').update({ [col]: updateVal }).eq('id', driverRow)
    if (error) throw error

    // Recalculate week_total if a day column was updated
    if (['mon', 'tue', 'wed', 'thu', 'fri'].includes(col)) {
      const { data: row } = await supabase.from('payroll').select('mon,tue,wed,thu,fri').eq('id', driverRow).single()
      if (row) {
        const total = (row.mon || 0) + (row.tue || 0) + (row.wed || 0) + (row.thu || 0) + (row.fri || 0)
        await supabase.from('payroll').update({ week_total: total }).eq('id', driverRow)
      }
    }

    return res.status(200).json({ success: true, field, value })
  } catch (err) {
    console.error('[payroll POST]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
