import { supabase } from './_lib/supabase.js'

const WEEKDAYS = new Set(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])

// GET /api/hq — returns aggregated data for the HQ dashboard

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const [logsRes, weeklyRes, driversRes, unassignedRes, zipRes] = await Promise.all([
      supabase.from('dispatch_logs').select('*').order('date', { ascending: true }),
      supabase.from('payroll').select('*').order('week_of', { ascending: false }).limit(25),
      supabase.from('drivers').select('*').eq('active', true),
      supabase.from('unassigned_orders').select('*').order('date', { ascending: false }).limit(10),
      supabase.from('orders').select('zip').not('zip', 'is', null).not('zip', 'eq', ''),
    ])

    // Parse logs — weekdays only
    const logData = (logsRes.data || []).filter(r => WEEKDAYS.has(r.delivery_day))

    // This week's logs only (Monday through today)
    const now = new Date()
    const dow = now.getDay()
    const monOffset = dow === 0 ? -6 : 1 - dow
    const monday = new Date(now)
    monday.setDate(now.getDate() + monOffset)
    const mondayStr = monday.toISOString().split('T')[0]
    const recentLogs = logData.filter(r => r.date >= mondayStr).reverse().map(r => ({
      Date: r.date,
      'Delivery Day': r.delivery_day,
      'Orders Processed': r.orders_processed,
      'Cold Chain': r.cold_chain,
      'Unassigned Count': r.unassigned_count,
      'SHSP Orders': r.shsp_orders,
      'Aultman Orders': r.aultman_orders,
      'Top Driver': r.top_driver,
      Status: r.status,
    }))

    const lastDispatch = recentLogs[0] || {}

    // Volume trends — last 30
    const last30 = logData.slice(-30)
    const totalOrders = last30.reduce((s, r) => s + (r.orders_processed || 0), 0)
    const avgOrders = last30.length ? Math.round(totalOrders / last30.length) : 0
    const totalColdChain = last30.reduce((s, r) => s + (r.cold_chain || 0), 0)
    const shspTotal = last30.reduce((s, r) => s + (r.shsp_orders || 0), 0)
    const aultmanTotal = last30.reduce((s, r) => s + (r.aultman_orders || 0), 0)

    // Week over week
    const thisWeek = logData.slice(-5)
    const lastWeek = logData.slice(-10, -5)
    const thisWeekOrders = thisWeek.reduce((s, r) => s + (r.orders_processed || 0), 0)
    const lastWeekOrders = lastWeek.reduce((s, r) => s + (r.orders_processed || 0), 0)
    const wowChange = lastWeekOrders ? Math.round(((thisWeekOrders - lastWeekOrders) / lastWeekOrders) * 100) : 0

    // Driver leaderboard from payroll (current week)
    const currentWeek = weeklyRes.data?.filter(r => r.week_of === weeklyRes.data[0]?.week_of) || []
    const leaderboard = currentWeek
      .filter(r => r.driver_name !== 'Paul')
      .map(d => ({
        name: d.driver_name,
        id: d.driver_number,
        weekTotal: d.week_total || 0,
        mon: d.mon || 0, tue: d.tue || 0, wed: d.wed || 0,
        thu: d.thu || 0, fri: d.fri || 0,
      }))
      .sort((a, b) => b.weekTotal - a.weekTotal)

    const activeThisWeek = leaderboard.filter(d => d.weekTotal > 0).length
    const driverCount = (driversRes.data || []).length

    // Recent unassigned
    const recentUnassigned = (unassignedRes.data || []).map(r => ({
      Date: r.date, ZIP: r.zip, Address: r.address,
      Pharmacy: r.pharmacy, Name: r.patient_name,
    }))

    // Top ZIPs
    const zipCounts = {}
    ;(zipRes.data || []).forEach(r => { zipCounts[r.zip] = (zipCounts[r.zip] || 0) + 1 })
    const topZips = Object.entries(zipCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([zip, count]) => ({ ZIP: zip, 'Total Deliveries': count }))

    // Volume chart
    const volumeChart = logData.slice(-14).map(r => ({
      date: r.date, day: r.delivery_day,
      orders: r.orders_processed || 0,
      shsp: r.shsp_orders || 0, aultman: r.aultman_orders || 0,
      coldChain: r.cold_chain || 0,
    }))

    const allTimeOrders = logData.reduce((s, r) => s + (r.orders_processed || 0), 0)

    return res.status(200).json({
      lastDispatch,
      kpis: {
        totalOrdersLast30: totalOrders, avgOrdersPerNight: avgOrders,
        coldChainLast30: totalColdChain, shspTotal, aultmanTotal,
        thisWeekOrders, lastWeekOrders, wowChange,
        activeDrivers: activeThisWeek, totalDrivers: driverCount,
        allTimeOrders, totalDispatches: logData.length,
      },
      leaderboard, recentLogs, recentUnassigned, topZips, volumeChart,
    })
  } catch (err) {
    console.error('[hq API]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
