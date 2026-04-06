import { supabase } from './_lib/supabase.js'

const WEEKDAYS = new Set(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const period = req.query.period || 'month'

  try {
    // Fetch dispatch logs, payroll, and order-based analytics in parallel
    const [logsRes, weeklyRes, zipRes, patientRes, locationRes] = await Promise.all([
      supabase.from('dispatch_logs').select('*').order('date', { ascending: true }),
      supabase.from('payroll').select('*').order('week_of', { ascending: false }).limit(25),
      supabase.rpc('get_zip_analytics'),
      supabase.rpc('get_patient_analytics'),
      supabase.rpc('get_location_analytics'),
    ])

    // Fallback to direct queries if RPCs don't exist yet
    let topZips = zipRes.data || []
    let patientData = patientRes.data || []
    let topLocations = locationRes.data || []

    if (zipRes.error) {
      const { data } = await supabase.from('orders').select('zip')
        .not('zip', 'is', null).not('zip', 'eq', '')
      const zipCounts = {}
      ;(data || []).forEach(r => { zipCounts[r.zip] = (zipCounts[r.zip] || 0) + 1 })
      topZips = Object.entries(zipCounts)
        .sort((a, b) => b[1] - a[1]).slice(0, 20)
        .map(([zip, count]) => ({ ZIP: zip, 'Total Deliveries': count }))
    }
    if (patientRes.error) {
      const { data } = await supabase.from('orders').select('patient_name')
        .not('patient_name', 'is', null).not('patient_name', 'eq', '')
      const patCounts = {}
      ;(data || []).forEach(r => { patCounts[r.patient_name] = (patCounts[r.patient_name] || 0) + 1 })
      patientData = Object.entries(patCounts)
        .sort((a, b) => b[1] - a[1]).slice(0, 20)
        .map(([name, count]) => ({ Name: name, 'Total Deliveries': count }))
    }
    if (locationRes.error) {
      const { data } = await supabase.from('orders').select('address, city, zip')
        .not('address', 'is', null).not('address', 'eq', '')
      const locCounts = {}
      ;(data || []).forEach(r => {
        const key = `${r.address}|${r.city}|${r.zip}`
        locCounts[key] = (locCounts[key] || 0) + 1
      })
      topLocations = Object.entries(locCounts)
        .sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([key, count]) => {
          const [address, city, zip] = key.split('|')
          return { Address: address, City: city, ZIP: zip, 'Total Deliveries': count }
        })
    }

    // Parse logs — weekdays only
    const allLogs = (logsRes.data || []).filter(r => WEEKDAYS.has(r.delivery_day))

    // Period filter
    let logs = allLogs
    if (period === 'week') logs = allLogs.slice(-5)
    else if (period === 'month') logs = allLogs.slice(-60)

    // KPIs
    const totalOrders = logs.reduce((s, r) => s + (r.orders_processed || 0), 0)
    const totalColdChain = logs.reduce((s, r) => s + (r.cold_chain || 0), 0)
    const totalUnassigned = logs.reduce((s, r) => s + (r.unassigned_count || 0), 0)
    const totalCorrections = logs.reduce((s, r) => s + (r.corrections || 0), 0)
    const shspTotal = logs.reduce((s, r) => s + (r.shsp_orders || 0), 0)
    const aultmanTotal = logs.reduce((s, r) => s + (r.aultman_orders || 0), 0)
    const avgPerNight = logs.length ? Math.round(totalOrders / logs.length) : 0

    // Volume trend
    const volumeTrend = logs.map(r => ({
      date: r.date,
      day: r.delivery_day,
      orders: r.orders_processed || 0,
      shsp: r.shsp_orders || 0,
      aultman: r.aultman_orders || 0,
      coldChain: r.cold_chain || 0,
      unassigned: r.unassigned_count || 0,
    }))

    // Day of week breakdown
    const dayBreakdown = {}
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    dayNames.forEach(d => { dayBreakdown[d] = { orders: 0, count: 0 } })
    logs.forEach(r => {
      if (dayBreakdown[r.delivery_day]) {
        dayBreakdown[r.delivery_day].orders += r.orders_processed || 0
        dayBreakdown[r.delivery_day].count++
      }
    })
    const dayAvg = dayNames.map(d => ({
      day: d,
      avg: dayBreakdown[d].count ? Math.round(dayBreakdown[d].orders / dayBreakdown[d].count) : 0,
      total: dayBreakdown[d].orders,
    }))

    // Driver leaderboard from payroll
    const currentWeek = weeklyRes.data?.filter(r => r.week_of === weeklyRes.data[0]?.week_of) || []
    const driverStats = currentWeek
      .filter(r => r.driver_name !== 'Paul')
      .map(d => ({
        name: d.driver_name,
        weekTotal: d.week_total || 0,
        mon: d.mon || 0, tue: d.tue || 0, wed: d.wed || 0,
        thu: d.thu || 0, fri: d.fri || 0,
      }))
      .sort((a, b) => b.weekTotal - a.weekTotal)

    // Top driver from logs
    const driverCounts = {}
    logs.forEach(r => {
      if (r.top_driver) driverCounts[r.top_driver] = (driverCounts[r.top_driver] || 0) + 1
    })
    const topDriverOverall = Object.entries(driverCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([name, count]) => ({ name, timesTop: count }))

    // Driver analytics — prefer daily_performance_summary, fallback to daily_stops
    let driverStopsRaw = []

    // Try daily_performance_summary first (pre-aggregated, all history)
    const { data: perfSummary, error: perfError } = await supabase
      .from('daily_performance_summary')
      .select('driver_name, delivery_date, stop_count, zip, city')

    if (!perfError && perfSummary && perfSummary.length > 0) {
      // Expand summary rows into the same shape the old code expects
      driverStopsRaw = perfSummary.flatMap(r => {
        // If summary has stop_count, expand to individual "stop" entries for counting
        const count = r.stop_count || 1
        return Array.from({ length: count }, () => ({
          driver_name: r.driver_name,
          delivery_date: r.delivery_date,
          zip: r.zip,
          city: r.city,
        }))
      })
    } else {
      // Fallback: paginate through daily_stops (old method, no date limit)
      let dsPage = 0
      while (true) {
        const { data: batch } = await supabase.from('daily_stops')
          .select('driver_name, delivery_date, zip, city')
          .range(dsPage * 1000, (dsPage + 1) * 1000 - 1)
        if (!batch || batch.length === 0) break
        driverStopsRaw = driverStopsRaw.concat(batch)
        if (batch.length < 1000) break
        dsPage++
      }
    }

    const driverByMonth = {}
    const driverDailyCounts = {}
    const driverZipCounts = {}
    const zipCityMap = {}
    driverStopsRaw.forEach(r => {
      const name = r.driver_name
      const m = r.delivery_date?.slice(0, 7)
      const d = r.delivery_date
      if (!name || !m) return
      if (!driverByMonth[name]) driverByMonth[name] = {}
      driverByMonth[name][m] = (driverByMonth[name][m] || 0) + 1
      if (!driverDailyCounts[name]) driverDailyCounts[name] = {}
      driverDailyCounts[name][d] = (driverDailyCounts[name][d] || 0) + 1
      if (r.zip) {
        if (!driverZipCounts[name]) driverZipCounts[name] = {}
        driverZipCounts[name][r.zip] = (driverZipCounts[name][r.zip] || 0) + 1
        if (r.city && !zipCityMap[r.zip]) zipCityMap[r.zip] = r.city
      }
    })

    const allDriverMonths = [...new Set(driverStopsRaw.map(r => r.delivery_date?.slice(0, 7)).filter(Boolean))].sort()
    const months6 = allDriverMonths.slice(-6)
    const driverMonthlyData = Object.entries(driverByMonth)
      .filter(([name]) => name !== 'Paul')
      .map(([name, monthMap]) => ({
        name,
        months: months6.map(m => ({ month: m, stops: monthMap[m] || 0 })),
        total: months6.reduce((s, m) => s + (monthMap[m] || 0), 0),
      }))
      .sort((a, b) => b.total - a.total)

    const driverConsistency = Object.entries(driverDailyCounts)
      .filter(([name]) => name !== 'Paul')
      .map(([name, dailyMap]) => {
        const counts = Object.values(dailyMap)
        if (counts.length < 5) return null
        const avg = counts.reduce((s, v) => s + v, 0) / counts.length
        const variance = counts.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / counts.length
        const stdDev = Math.sqrt(variance)
        const cv = avg > 0 ? Math.round((stdDev / avg) * 100) : 0
        return { name, avg: Math.round(avg), stdDev: Math.round(stdDev * 10) / 10, consistency: Math.max(0, 100 - cv), days: counts.length }
      })
      .filter(Boolean)
      .sort((a, b) => b.consistency - a.consistency)

    const driverTopZips = Object.entries(driverZipCounts)
      .filter(([name]) => name !== 'Paul')
      .map(([name, zipMap]) => ({
        name,
        zips: Object.entries(zipMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([zip, count]) => ({ zip, city: zipCityMap[zip] || '', count })),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    // Pharmacy split over time
    const pharmaSplit = []
    for (let i = 0; i < logs.length; i += 5) {
      const chunk = logs.slice(i, i + 5)
      pharmaSplit.push({
        label: chunk[0]?.date || '',
        shsp: chunk.reduce((s, r) => s + (r.shsp_orders || 0), 0),
        aultman: chunk.reduce((s, r) => s + (r.aultman_orders || 0), 0),
      })
    }

    // === TREND DATA (always computed from ALL logs, not period-filtered) ===
    const allForTrends = allLogs

    // 7-day moving average
    const movingAvg = allForTrends.map((r, i) => {
      const window = allForTrends.slice(Math.max(0, i - 6), i + 1)
      return {
        date: r.date,
        avg: Math.round(window.reduce((s, d) => s + (d.orders_processed || 0), 0) / window.length),
      }
    })

    // Month-over-month: prefer monthly_stop_summary, fallback to computing from logs
    let monthlyTrend = []
    const { data: monthlySummary, error: monthlyError } = await supabase
      .from('monthly_stop_summary')
      .select('*')
      .order('month', { ascending: true })

    if (!monthlyError && monthlySummary && monthlySummary.length > 0) {
      // Use pre-aggregated monthly summary (all history, no date limit)
      monthlyTrend = monthlySummary.map((m, i) => {
        const prev = i > 0 ? monthlySummary[i - 1] : null
        const orders = m.total_orders || m.orders || 0
        const cc = m.cold_chain || m.total_cold_chain || 0
        const shsp = m.shsp_orders || m.total_shsp || 0
        const aultman = m.aultman_orders || m.total_aultman || 0
        const days = m.delivery_days || m.days || 0
        const prevOrders = prev ? (prev.total_orders || prev.orders || 0) : 0
        const growth = prev && prevOrders > 0 ? Math.round(((orders - prevOrders) / prevOrders) * 100) : null
        const total = orders || 1
        return {
          month: m.month,
          orders,
          avgPerDay: days ? Math.round(orders / days) : 0,
          growth,
          ccPct: Math.round((cc / total) * 100),
          shspPct: Math.round((shsp / total) * 100),
          aultmanPct: Math.round((aultman / total) * 100),
          shsp, aultman, cc, days,
        }
      })
    } else {
      // Fallback: compute from dispatch_logs
      const byMonth = {}
      allForTrends.forEach(r => {
        const m = r.date?.slice(0, 7)
        if (!m) return
        if (!byMonth[m]) byMonth[m] = { orders: 0, cc: 0, shsp: 0, aultman: 0, days: 0 }
        byMonth[m].orders += r.orders_processed || 0
        byMonth[m].cc += r.cold_chain || 0
        byMonth[m].shsp += r.shsp_orders || 0
        byMonth[m].aultman += r.aultman_orders || 0
        byMonth[m].days++
      })
      const months = Object.keys(byMonth).sort()
      monthlyTrend = months.map((m, i) => {
        const cur = byMonth[m]
        const prev = i > 0 ? byMonth[months[i - 1]] : null
        const growth = prev && prev.orders > 0 ? Math.round(((cur.orders - prev.orders) / prev.orders) * 100) : null
        const total = cur.orders || 1
        return {
          month: m,
          orders: cur.orders,
          avgPerDay: cur.days ? Math.round(cur.orders / cur.days) : 0,
          growth,
          ccPct: Math.round((cur.cc / total) * 100),
          shspPct: Math.round((cur.shsp / total) * 100),
          aultmanPct: Math.round((cur.aultman / total) * 100),
          shsp: cur.shsp,
          aultman: cur.aultman,
          cc: cur.cc,
          days: cur.days,
        }
      })
    }

    // Group by payroll week (Mon-Fri, labeled by Week Ending Saturday)
    const weekBuckets = {}
    allForTrends.forEach(r => {
      const d = new Date(r.date + 'T12:00:00')
      const day = d.getDay() // 0=Sun..6=Sat
      const satOffset = day === 0 ? 6 : 6 - day
      const sat = new Date(d)
      sat.setDate(d.getDate() + satOffset)
      const key = sat.toISOString().split('T')[0]
      if (!weekBuckets[key]) weekBuckets[key] = []
      weekBuckets[key].push(r)
    })
    const weekKeys = Object.keys(weekBuckets).sort()

    // Cold chain % over time (payroll weeks)
    const ccTrend = weekKeys.map(wk => {
      const rows = weekBuckets[wk]
      const total = rows.reduce((s, r) => s + (r.orders_processed || 0), 0)
      const cc = rows.reduce((s, r) => s + (r.cold_chain || 0), 0)
      return { date: wk, pct: total ? Math.round((cc / total) * 100) : 0, total, cc }
    })

    // SHSP vs Aultman share over time (payroll weeks)
    const pharmaTrend = weekKeys.map(wk => {
      const rows = weekBuckets[wk]
      const shsp = rows.reduce((s, r) => s + (r.shsp_orders || 0), 0)
      const aultman = rows.reduce((s, r) => s + (r.aultman_orders || 0), 0)
      const total = shsp + aultman || 1
      return { date: wk, shsp, aultman, shspPct: Math.round((shsp / total) * 100) }
    })

    // === DEEP CUTS ===

    // 1. Seasonality — average volume by month of year (Jan-Dec) across all years
    //    Use monthly_stop_summary if available, otherwise fall back to dispatch_logs
    const monthOfYearAvg = {}
    if (monthlyTrend.length > 0 && !monthlyError) {
      // Use monthly summary data (all history)
      monthlyTrend.forEach(m => {
        const mo = parseInt(m.month?.slice(5, 7))
        if (!mo) return
        if (!monthOfYearAvg[mo]) monthOfYearAvg[mo] = { total: 0, days: 0, years: new Set() }
        monthOfYearAvg[mo].total += m.orders || 0
        monthOfYearAvg[mo].days += m.days || 0
        monthOfYearAvg[mo].years.add(m.month?.slice(0, 4))
      })
    } else {
      allForTrends.forEach(r => {
        const mo = parseInt(r.date?.slice(5, 7))
        if (!mo) return
        if (!monthOfYearAvg[mo]) monthOfYearAvg[mo] = { total: 0, days: 0, years: new Set() }
        monthOfYearAvg[mo].total += r.orders_processed || 0
        monthOfYearAvg[mo].days++
        monthOfYearAvg[mo].years.add(r.date?.slice(0, 4))
      })
    }
    const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const seasonality = Array.from({ length: 12 }, (_, i) => {
      const mo = i + 1
      const d = monthOfYearAvg[mo]
      return {
        month: MONTH_NAMES[mo],
        avgPerDay: d ? Math.round(d.total / d.days) : 0,
        totalDays: d?.days || 0,
        yearsOfData: d?.years?.size || 0,
      }
    })
    const peakMonth = seasonality.reduce((best, m) => m.avgPerDay > best.avgPerDay ? m : best, seasonality[0])
    const slowMonth = seasonality.filter(m => m.totalDays > 0).reduce((best, m) => m.avgPerDay < best.avgPerDay ? m : best, seasonality[0])

    // 2. Driver turnover impact — what % of volume each driver handles
    const driverVolumeShare = {}
    let totalDriverStops = 0
    driverStopsRaw.forEach(r => {
      if (!r.driver_name || r.driver_name === 'Paul') return
      driverVolumeShare[r.driver_name] = (driverVolumeShare[r.driver_name] || 0) + 1
      totalDriverStops++
    })
    const driverImpact = Object.entries(driverVolumeShare)
      .map(([name, stops]) => ({
        name,
        stops,
        pct: totalDriverStops ? Math.round((stops / totalDriverStops) * 100) : 0,
        avgPerDay: Math.round(stops / (new Set(driverStopsRaw.filter(r => r.driver_name === name).map(r => r.delivery_date)).size || 1)),
        activeDays: new Set(driverStopsRaw.filter(r => r.driver_name === name).map(r => r.delivery_date)).size,
      }))
      .sort((a, b) => b.pct - a.pct)

    // Driver rate data for pay simulator
    const { data: driversForRates } = await supabase.from('drivers').select('driver_name, rate_mth, rate_wf, office_fee, flat_salary').eq('active', true)
    const driverRates = (driversForRates || []).filter(d => d.driver_name !== 'Paul').map(d => ({
      name: d.driver_name,
      rateMth: parseFloat(d.rate_mth) || 0,
      rateWf: parseFloat(d.rate_wf) || 0,
      officeFee: parseFloat(d.office_fee) || 0,
      flatSalary: d.flat_salary ? parseFloat(d.flat_salary) : null,
    }))

    // Driver stop counts by day of week (for pay simulation)
    const driverWeekdayStops = {}
    driverStopsRaw.forEach(r => {
      if (!r.driver_name || r.driver_name === 'Paul') return
      const d = new Date(r.delivery_date + 'T12:00:00')
      const dow = d.getDay() // 1=Mon..5=Fri
      if (!driverWeekdayStops[r.driver_name]) driverWeekdayStops[r.driver_name] = { mth: 0, wf: 0, days: new Set() }
      if (dow === 1 || dow === 2 || dow === 4) driverWeekdayStops[r.driver_name].mth++
      else if (dow === 3 || dow === 5) driverWeekdayStops[r.driver_name].wf++
      driverWeekdayStops[r.driver_name].days.add(r.delivery_date)
    })
    const driverPayData = Object.entries(driverWeekdayStops).map(([name, d]) => ({
      name, mthStops: d.mth, wfStops: d.wf, totalStops: d.mth + d.wf, activeDays: d.days.size,
    }))

    // Rate calculator data — ZIP-level stop counts grouped by date for revenue simulation
    const rateCalcData = {}
    driverStopsRaw.forEach(r => {
      if (!r.zip || !r.delivery_date) return
      const key = `${r.delivery_date}|${r.zip}`
      if (!rateCalcData[key]) rateCalcData[key] = { date: r.delivery_date, zip: r.zip, count: 0 }
      rateCalcData[key].count++
    })
    const rateCalcStops = Object.values(rateCalcData)

    // 3. ZIP growth trends — compare last 3 months vs prior 3 months
    const threeMonthsAgo = new Date()
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
    const threeMonthStr = threeMonthsAgo.toISOString().split('T')[0]
    const zipRecent = {}, zipOlder = {}
    driverStopsRaw.forEach(r => {
      if (!r.zip) return
      if (r.delivery_date >= threeMonthStr) {
        zipRecent[r.zip] = (zipRecent[r.zip] || 0) + 1
      } else {
        zipOlder[r.zip] = (zipOlder[r.zip] || 0) + 1
      }
    })
    const allZipKeys = new Set([...Object.keys(zipRecent), ...Object.keys(zipOlder)])
    const zipGrowth = [...allZipKeys].map(zip => {
      const recent = zipRecent[zip] || 0
      const older = zipOlder[zip] || 0
      const growth = older > 0 ? Math.round(((recent - older) / older) * 100) : (recent > 0 ? 100 : 0)
      return { zip, city: zipCityMap[zip] || '', recent, older, growth }
    }).filter(z => z.recent + z.older >= 10) // only ZIPs with meaningful volume
    const zipGrowing = zipGrowth.filter(z => z.growth > 0).sort((a, b) => b.growth - a.growth).slice(0, 15)
    const zipDeclining = zipGrowth.filter(z => z.growth < 0).sort((a, b) => a.growth - b.growth).slice(0, 10)

    // 4. Cold chain by day of week
    const ccByDay = {}
    dayNames.forEach(d => { ccByDay[d] = { cc: 0, total: 0, count: 0 } })
    allForTrends.forEach(r => {
      if (ccByDay[r.delivery_day]) {
        ccByDay[r.delivery_day].cc += r.cold_chain || 0
        ccByDay[r.delivery_day].total += r.orders_processed || 0
        ccByDay[r.delivery_day].count++
      }
    })
    const coldChainByDay = dayNames.map(d => ({
      day: d,
      avgCC: ccByDay[d].count ? Math.round(ccByDay[d].cc / ccByDay[d].count) : 0,
      ccPct: ccByDay[d].total ? Math.round((ccByDay[d].cc / ccByDay[d].total) * 100) : 0,
      totalCC: ccByDay[d].cc,
    }))

    // Cold chain by month (trend)
    const ccByMonth = {}
    allForTrends.forEach(r => {
      const m = r.date?.slice(0, 7)
      if (!m) return
      if (!ccByMonth[m]) ccByMonth[m] = { cc: 0, total: 0 }
      ccByMonth[m].cc += r.cold_chain || 0
      ccByMonth[m].total += r.orders_processed || 0
    })
    const coldChainMonthly = Object.entries(ccByMonth).sort((a, b) => a[0].localeCompare(b[0])).map(([month, d]) => ({
      month,
      avgCC: d.total ? Math.round(d.cc / (Object.keys(ccByDay).length || 1)) : 0,
      ccPct: d.total ? Math.round((d.cc / d.total) * 100) : 0,
      cc: d.cc,
      total: d.total,
    }))

    return res.status(200).json({
      period,
      dispatches: logs.length,
      kpis: {
        totalOrders, avgPerNight, totalColdChain,
        coldChainPct: totalOrders ? Math.round((totalColdChain / totalOrders) * 100) : 0,
        totalUnassigned, totalCorrections, shspTotal, aultmanTotal,
        shspPct: totalOrders ? Math.round((shspTotal / totalOrders) * 100) : 0,
      },
      volumeTrend, dayAvg, driverLeaderboard: driverStats,
      topDriverOverall, topZips, patientData, topLocations, pharmaSplit,
      movingAvg, monthlyTrend, ccTrend, pharmaTrend,
      driverMonthlyData, driverConsistency, driverTopZips,
      // Deep cuts
      seasonality, peakMonth, slowMonth,
      driverImpact,
      zipGrowing, zipDeclining,
      coldChainByDay, coldChainMonthly,
      rateCalcStops, driverRates, driverPayData,
    })
  } catch (err) {
    console.error('[analytics API]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
