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
      const rates = {
        mon: parseFloat(d.rate_mon) || 0, tue: parseFloat(d.rate_tue) || 0,
        wed: parseFloat(d.rate_wed) || 0, thu: parseFloat(d.rate_thu) || 0,
        fri: parseFloat(d.rate_fri) || 0,
      }
      const hasRates = Object.values(rates).some(r => r > 0)

      let calculatedPay = 0
      if (flatSalary) {
        calculatedPay = flatSalary
      } else if (hasRates) {
        calculatedPay = (mon * rates.mon) + (tue * rates.tue) + (wed * rates.wed) + (thu * rates.thu) + (fri * rates.fri) + (willCalls * 9)
        if (weekTotal > 0 || willCalls > 0) {
          calculatedPay += officeFee
        } else {
          calculatedPay = 0
        }
      }

      const sheetPay = parseFloat(p.weekly_pay) || 0

      return {
        name: p.driver_name,
        id: p.driver_number,
        mon, tue, wed, thu, fri,
        weekTotal, willCalls, officeFee,
        rate: (rateMth || rateWf) ? { mth: rateMth, wf: rateWf } : null,
        flatSalary,
        calculatedPay: Math.round(calculatedPay * 100) / 100,
        sheetPay,
        isFlat: !!flatSalary,
        rowIndex: p.id,
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

    // Any edit to a day count or will_calls also re-snapshots week_total +
    // weekly_pay so the driver app's Pay History stays in sync with what
    // dispatch sees live. Without this, weekly_pay only updates on Approve &
    // Send, leaving stale values after any post-approval correction.
    // (e.g., Adam was paid $1,282 but driver app showed $980.50 because his
    // Fri count was edited after the original approval.)
    if (['mon', 'tue', 'wed', 'thu', 'fri', 'will_calls'].includes(col)) {
      const { data: row } = await supabase.from('payroll')
        .select('mon,tue,wed,thu,fri,will_calls,driver_name')
        .eq('id', driverRow).single()
      if (row) {
        const total = (row.mon || 0) + (row.tue || 0) + (row.wed || 0) + (row.thu || 0) + (row.fri || 0)
        const { data: driverRec } = await supabase.from('drivers')
          .select('flat_salary,office_fee,will_call_rate,rate_mon,rate_tue,rate_wed,rate_thu,rate_fri')
          .eq('driver_name', row.driver_name).single()
        const weeklyPay = computeWeeklyPay(row, driverRec)
        await supabase.from('payroll')
          .update({ week_total: total, weekly_pay: weeklyPay })
          .eq('id', driverRow)
      }
    }

    return res.status(200).json({ success: true, field, value })
  } catch (err) {
    console.error('[payroll POST]', err.message)
    return res.status(500).json({ error: err.message })
  }
}

// Mirror of getAdjustedPay in src/hooks/usePayrollData.js — kept identical so
// the snapshot equals what the dispatcher sees in the payroll grid.
function computeWeeklyPay(row, driver) {
  if (!driver) return 0
  const mon = row.mon || 0, tue = row.tue || 0, wed = row.wed || 0, thu = row.thu || 0, fri = row.fri || 0
  const wc = row.will_calls || 0
  const total = mon + tue + wed + thu + fri
  const flatSalary = parseFloat(driver.flat_salary) || 0
  const officeFee = parseFloat(driver.office_fee) || 0
  const wcRate = parseFloat(driver.will_call_rate) || 9
  let pay = 0
  if (flatSalary > 0) {
    pay = (total > 0 || wc > 0) ? flatSalary : 0
  } else {
    const rm = parseFloat(driver.rate_mon) || 0
    const rt = parseFloat(driver.rate_tue) || 0
    const rw = parseFloat(driver.rate_wed) || 0
    const rh = parseFloat(driver.rate_thu) || 0
    const rf = parseFloat(driver.rate_fri) || 0
    pay = mon * rm + tue * rt + wed * rw + thu * rh + fri * rf + wc * wcRate
    if (total > 0 || wc > 0) pay += officeFee
  }
  return Math.round(pay * 100) / 100
}
