import { supabase } from './_lib/supabase.js'
import { fetchRange, DAILY_SHEETS } from './_lib/sheets.js'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default async function handler(req, res) {
  const driverEmail = req.query.email?.toLowerCase()
  if (!driverEmail) return res.status(400).json({ error: 'Missing email' })

  // Look up driver from Supabase
  const { data: driverRow, error: driverErr } = await supabase.from('drivers')
    .select('*').eq('email', driverEmail).single()

  if (driverErr || !driverRow) return res.status(403).json({ error: 'Driver not found' })

  const driverName = driverRow.driver_name
  const driverId = driverRow.driver_number
  const tabName = `${driverName} - ${driverId}`

  // Determine today's delivery day
  const todayIdx = new Date().getDay()
  const todayName = DAYS[todayIdx]
  const sheetId = DAILY_SHEETS[todayName]

  // Weekends — no delivery
  if (!sheetId) {
    return res.status(200).json({
      approved: false, noDeliveryToday: true,
      deliveryDay: todayName, driverName, driverId,
      stops: [], weekTotal: 0,
    })
  }

  try {
    // Fetch daily stops from Sheets (still live there) + Supabase data in parallel
    const [driverRows, logsRes, payrollRes] = await Promise.all([
      fetchRange(sheetId, `'${tabName}'!A1:I200`).catch(() => []),
      supabase.from('dispatch_logs').select('*').order('date', { ascending: false }).limit(10),
      supabase.from('payroll').select('*').eq('driver_name', driverName)
        .order('week_of', { ascending: false }).limit(1),
    ])

    // Determine approval status from dispatch logs
    const today = new Date()
    const todayStr = today.toLocaleDateString('en-US', {
      month: '2-digit', day: '2-digit', year: 'numeric',
    })
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toLocaleDateString('en-US', {
      month: '2-digit', day: '2-digit', year: 'numeric',
    })

    let approved = false
    for (const log of (logsRes.data || [])) {
      if (log.delivery_day === todayName && log.status === 'Complete') {
        const logDate = new Date(log.date).toLocaleDateString('en-US', {
          month: '2-digit', day: '2-digit', year: 'numeric',
        })
        if (logDate === todayStr || logDate === yesterdayStr) {
          approved = true
          break
        }
      }
    }

    // Parse driver stops from daily sheet
    let stops = []
    if (driverRows.length > 1) {
      const headers = driverRows[0].map((h) => h.trim())
      stops = driverRows.slice(1)
        .filter((row) => row.some((cell) => cell?.trim()))
        .map((row, idx) => {
          const obj = { _index: idx }
          headers.forEach((h, i) => { obj[h] = row[i] || '' })
          const isColdChain = Object.values(obj).some((v) =>
            typeof v === 'string' && v.toLowerCase().match(/^(yes|y|cold chain|cc)$/)
          )
          obj._coldChain = isColdChain
          return obj
        })
    }

    // Weekly data from payroll
    const payroll = payrollRes.data?.[0]
    let weekTotal = 0
    let dailyStops = {}
    if (payroll) {
      const dayAbbrevs = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
      dayAbbrevs.forEach(d => { dailyStops[d] = payroll[d.toLowerCase()] || 0 })
      weekTotal = payroll.week_total || 0
    }

    return res.status(200).json({
      approved, deliveryDay: todayName,
      driverName, driverId, tabName, stops,
      stopCount: stops.length,
      coldChainCount: stops.filter((s) => s._coldChain).length,
      weekTotal, dailyStops,
    })
  } catch (err) {
    console.error('[driver API]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
