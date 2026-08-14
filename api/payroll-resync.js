import { supabase } from './_lib/supabase.js'

// POST /api/payroll-resync
// Body: { week_of: "YYYY-MM-DD" }
// Counts daily_stops fresh, recomputes pay using each active driver's rates,
// and writes mon/tue/wed/thu/fri/week_total/weekly_pay to the payroll table
// (creating rows that don't exist yet). Returns per-driver success/failure so
// the dispatcher UI can surface errors instead of swallowing them.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  let body
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' })
  }

  const { week_of } = body || {}
  if (!week_of || !/^\d{4}-\d{2}-\d{2}$/.test(week_of)) {
    return res.status(400).json({ error: 'week_of (YYYY-MM-DD) required' })
  }

  try {
    // Build the five delivery dates (Mon..Fri starting at week_of).
    const monday = new Date(week_of + 'T12:00:00')
    const dateAt = (offset) => {
      const d = new Date(monday)
      d.setDate(monday.getDate() + offset)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    const dates = { mon: dateAt(0), tue: dateAt(1), wed: dateAt(2), thu: dateAt(3), fri: dateAt(4) }
    const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri']

    // Fetch active drivers, existing payroll rows, and stops per day in parallel.
    const [driversRes, payrollRes, ...dayResults] = await Promise.all([
      supabase.from('drivers').select('*').eq('active', true),
      supabase.from('payroll').select('*').eq('week_of', week_of),
      ...dayKeys.map(k =>
        supabase.from('daily_stops')
          .select('driver_name')
          .eq('delivery_date', dates[k])
          .not('status', 'eq', 'DELETED')
          .limit(2000)
      ),
    ])

    if (driversRes.error) throw driversRes.error
    if (payrollRes.error) throw payrollRes.error

    // Count stops per driver per day.
    const counts = {}
    dayResults.forEach((res, idx) => {
      const k = dayKeys[idx]
      ;(res.data || []).forEach(s => {
        if (!s.driver_name) return
        if (!counts[s.driver_name]) counts[s.driver_name] = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 }
        counts[s.driver_name][k]++
      })
    })

    const payrollByName = {}
    ;(payrollRes.data || []).forEach(p => { payrollByName[p.driver_name] = p })

    const results = []
    for (const d of (driversRes.data || [])) {
      if (d.driver_name === 'Demo Driver') continue
      const c = counts[d.driver_name] || { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 }
      const total = c.mon + c.tue + c.wed + c.thu + c.fri
      const existing = payrollByName[d.driver_name]
      const willCalls = existing?.will_calls || 0
      const flatSalary = parseFloat(d.flat_salary) || 0
      const officeFee = parseFloat(d.office_fee) || 0
      const wcRate = parseFloat(d.will_call_rate) || 9

      let pay = 0
      if (flatSalary > 0) {
        pay = (total > 0 || willCalls > 0) ? flatSalary : 0
      } else {
        const rm = parseFloat(d.rate_mon) || 0
        const rt = parseFloat(d.rate_tue) || 0
        const rw = parseFloat(d.rate_wed) || 0
        const rh = parseFloat(d.rate_thu) || 0
        const rf = parseFloat(d.rate_fri) || 0
        pay = c.mon * rm + c.tue * rt + c.wed * rw + c.thu * rh + c.fri * rf + willCalls * wcRate
        if (total > 0 || willCalls > 0) pay += officeFee
      }
      pay = Math.round(pay * 100) / 100

      const row = {
        week_of,
        driver_name: d.driver_name,
        mon: c.mon, tue: c.tue, wed: c.wed, thu: c.thu, fri: c.fri,
        week_total: total,
        will_calls: willCalls,
        weekly_pay: pay,
      }

      try {
        if (existing?.id) {
          const { error } = await supabase.from('payroll').update(row).eq('id', existing.id)
          if (error) throw error
        } else {
          const { error } = await supabase.from('payroll').insert(row)
          if (error) throw error
        }
        results.push({ driver_name: d.driver_name, total, weekly_pay: pay, ok: true })
      } catch (e) {
        results.push({ driver_name: d.driver_name, total, weekly_pay: pay, ok: false, error: e.message })
      }
    }

    const failed = results.filter(r => !r.ok)
    return res.status(200).json({
      week_of,
      synced: results.length - failed.length,
      failed: failed.length,
      errors: failed.map(f => ({ driver: f.driver_name, error: f.error })),
      drivers: results,
    })
  } catch (err) {
    console.error('[payroll-resync]', err)
    return res.status(500).json({ error: err.message })
  }
}
