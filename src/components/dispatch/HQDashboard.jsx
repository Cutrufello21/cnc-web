import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import './HQDashboard.css'

const WEEKDAYS = new Set(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtDate(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  return `${MONTHS[+m - 1]} ${+d}`
}

function fmtDay(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T12:00:00')
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()]
}

export default function HQDashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tableSort, setTableSort] = useState({ col: null, dir: 'desc' })
  const [expandedRow, setExpandedRow] = useState(null)
  const [hoveredBar, setHoveredBar] = useState(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      // Compute this week's Monday for date range queries
      const now0 = new Date()
      const dow0 = now0.getDay()
      const monOffset0 = dow0 === 0 ? -6 : 1 - dow0
      const monday0 = new Date(now0)
      monday0.setDate(now0.getDate() + monOffset0)
      const mondayStr0 = monday0.toISOString().split('T')[0]
      const friday0 = new Date(monday0)
      friday0.setDate(monday0.getDate() + 4)
      const fridayStr0 = friday0.toISOString().split('T')[0]

      // Previous week Monday
      const prevMonday0 = new Date(monday0)
      prevMonday0.setDate(monday0.getDate() - 7)
      const prevMondayStr0 = prevMonday0.toISOString().split('T')[0]
      const prevFriday0 = new Date(prevMonday0)
      prevFriday0.setDate(prevMonday0.getDate() + 4)
      const prevFridayStr0 = prevFriday0.toISOString().split('T')[0]

      const [logsRes, weeklyRes, driversRes, timeOffRes, decisionsRes, stopsThisWeekRes, stopsPrevWeekRes] = await Promise.all([
        supabase.from('dispatch_logs').select('*').order('date', { ascending: true }),
        supabase.from('payroll').select('*').order('week_of', { ascending: false }).limit(25),
        supabase.from('drivers').select('*').eq('active', true),
        supabase.from('time_off_requests').select('driver_name, date_off, status')
          .in('status', ['approved', 'pending'])
          .gte('date_off', new Date().toISOString().split('T')[0]),
        supabase.from('dispatch_decisions').select('decision_type, delivery_date, from_driver, to_driver, zip, created_at')
          .in('decision_type', ['manual_move', 'optimize_accepted', 'optimize_rejected', 'snapshot_diff'])
          .order('created_at', { ascending: false })
          .limit(500),
        supabase.from('daily_stops').select('driver_name, delivery_date')
          .gte('delivery_date', mondayStr0).lte('delivery_date', fridayStr0),
        supabase.from('daily_stops').select('driver_name, delivery_date')
          .gte('delivery_date', prevMondayStr0).lte('delivery_date', prevFridayStr0),
      ])

      const logData = (logsRes.data || []).filter(r => WEEKDAYS.has(r.delivery_day))
      const today = new Date().toISOString().split('T')[0]

      // This week's Monday
      const now = new Date()
      const dow = now.getDay()
      const monOffset = dow === 0 ? -6 : 1 - dow
      const monday = new Date(now)
      monday.setDate(now.getDate() + monOffset)
      const mondayStr = monday.toISOString().split('T')[0]

      // Today's dispatch
      const todayLog = logData.find(r => r.date === today)
      const lastLog = logData[logData.length - 1]
      const lastDispatchDate = lastLog?.date || ''
      const isToday = lastDispatchDate === today
      const isYesterday = (() => {
        const y = new Date(now)
        y.setDate(y.getDate() - 1)
        return lastDispatchDate === y.toISOString().split('T')[0]
      })()

      // Recent logs (this week)
      const recentLogs = logData.filter(r => r.date >= mondayStr).reverse()

      // 30-day stats
      const last30 = logData.slice(-30)
      const totalOrders = last30.reduce((s, r) => s + (r.orders_processed || 0), 0)
      const avgOrders = last30.length ? Math.round(totalOrders / last30.length) : 0
      const totalColdChain = last30.reduce((s, r) => s + (r.cold_chain || 0), 0)
      const shspTotal = last30.reduce((s, r) => s + (r.shsp_orders || 0), 0)
      const aultmanTotal = last30.reduce((s, r) => s + (r.aultman_orders || 0), 0)

      // Week over week
      const thisWeek = logData.filter(r => r.date >= mondayStr)
      const lastMonday = new Date(monday)
      lastMonday.setDate(lastMonday.getDate() - 7)
      const lastMondayStr = lastMonday.toISOString().split('T')[0]
      const lastWeek = logData.filter(r => r.date >= lastMondayStr && r.date < mondayStr)
      const thisWeekOrders = thisWeek.reduce((s, r) => s + (r.orders_processed || 0), 0)
      const lastWeekOrders = lastWeek.reduce((s, r) => s + (r.orders_processed || 0), 0)
      const wowChange = lastWeekOrders ? Math.round(((thisWeekOrders - lastWeekOrders) / lastWeekOrders) * 100) : 0

      // Leaderboard
      const currentWeek = weeklyRes.data?.filter(r => r.week_of === weeklyRes.data[0]?.week_of) || []
      const leaderboard = currentWeek
        .filter(r => r.driver_name !== 'Paul')
        .map(d => ({
          name: d.driver_name, weekTotal: d.week_total || 0,
          mon: d.mon || 0, tue: d.tue || 0, wed: d.wed || 0,
          thu: d.thu || 0, fri: d.fri || 0,
        }))
        .sort((a, b) => b.weekTotal - a.weekTotal)

      const activeThisWeek = leaderboard.filter(d => d.weekTotal > 0).length

      // Volume chart (last 14 dispatches)
      const volumeChart = logData.slice(-14).map(r => ({
        date: r.date, day: r.delivery_day,
        orders: r.orders_processed || 0,
        shsp: r.shsp_orders || 0, aultman: r.aultman_orders || 0,
        coldChain: r.cold_chain || 0,
      }))

      // Upcoming time off (next 7 days)
      const sevenDaysOut = new Date(now)
      sevenDaysOut.setDate(sevenDaysOut.getDate() + 7)
      const sevenStr = sevenDaysOut.toISOString().split('T')[0]
      const upcomingTimeOff = (timeOffRes.data || [])
        .filter(r => r.date_off <= sevenStr)
        .sort((a, b) => a.date_off.localeCompare(b.date_off))

      // Group time off by date
      const timeOffByDate = {}
      upcomingTimeOff.forEach(r => {
        if (!timeOffByDate[r.date_off]) timeOffByDate[r.date_off] = []
        timeOffByDate[r.date_off].push(r)
      })

      const allTimeOrders = logData.reduce((s, r) => s + (r.orders_processed || 0), 0)

      // Optimization stats
      const decisions = decisionsRes.data || []
      const manualMoves = decisions.filter(d => d.decision_type === 'manual_move')
      const optimizeAccepted = decisions.filter(d => d.decision_type === 'optimize_accepted')
      const optimizeRejected = decisions.filter(d => d.decision_type === 'optimize_rejected')
      const snapshotDiffs = decisions.filter(d => d.decision_type === 'snapshot_diff')

      // Unique dates with any activity
      const activeDates = new Set(decisions.map(d => d.delivery_date).filter(Boolean))

      // Top moved ZIPs
      const zipMoves = {}
      manualMoves.forEach(d => { if (d.zip) zipMoves[d.zip] = (zipMoves[d.zip] || 0) + 1 })
      const topMovedZips = Object.entries(zipMoves).sort((a, b) => b[1] - a[1]).slice(0, 5)

      // This week's moves
      const thisWeekMoves = manualMoves.filter(d => d.delivery_date >= mondayStr)
      const thisWeekOptimize = optimizeAccepted.filter(d => d.delivery_date >= mondayStr)

      const optimizationStats = {
        totalMoves: manualMoves.length,
        totalOptimizeAccepted: optimizeAccepted.length,
        totalOptimizeRejected: optimizeRejected.length,
        totalDiffs: snapshotDiffs.length,
        activeDates: activeDates.size,
        topMovedZips,
        thisWeekMoves: thisWeekMoves.length,
        thisWeekOptimize: thisWeekOptimize.length,
      }

      // Driver heatmap: stops per driver per day this week
      const stopsThisWeek = stopsThisWeekRes.data || []
      const activeDriverNames = (driversRes.data || []).filter(d => d.driver_name).map(d => d.driver_name)
      const weekDates = []
      for (let i = 0; i < 5; i++) {
        const d = new Date(monday0)
        d.setDate(monday0.getDate() + i)
        weekDates.push(d.toISOString().split('T')[0])
      }

      const heatmapData = {}
      stopsThisWeek.forEach(s => {
        if (!heatmapData[s.driver_name]) heatmapData[s.driver_name] = {}
        heatmapData[s.driver_name][s.delivery_date] = (heatmapData[s.driver_name][s.delivery_date] || 0) + 1
      })

      // Only include drivers with stops this week, sorted by total
      const heatmapDrivers = Object.entries(heatmapData)
        .map(([name, days]) => ({
          name,
          days,
          total: Object.values(days).reduce((s, v) => s + v, 0),
        }))
        .sort((a, b) => b.total - a.total)

      const heatmapMax = Math.max(...heatmapDrivers.flatMap(d => Object.values(d.days)), 1)

      // Quick stats
      const stopsPrevWeek = stopsPrevWeekRes.data || []

      // Busiest day this week
      const dayTotals = {}
      stopsThisWeek.forEach(s => {
        dayTotals[s.delivery_date] = (dayTotals[s.delivery_date] || 0) + 1
      })
      const busiestEntry = Object.entries(dayTotals).sort((a, b) => b[1] - a[1])[0]
      const busiestDay = busiestEntry ? { date: busiestEntry[0], count: busiestEntry[1] } : null

      // Average stops per driver (this week, active days only)
      const driverTotals = {}
      stopsThisWeek.forEach(s => {
        driverTotals[s.driver_name] = (driverTotals[s.driver_name] || 0) + 1
      })
      const activeDriverCount = Object.keys(driverTotals).length
      const avgStopsPerDriver = activeDriverCount ? Math.round(stopsThisWeek.length / activeDriverCount) : 0

      // Most improved driver (biggest increase from last week to this week)
      const prevDriverTotals = {}
      stopsPrevWeek.forEach(s => {
        prevDriverTotals[s.driver_name] = (prevDriverTotals[s.driver_name] || 0) + 1
      })
      let mostImproved = null
      let biggestGain = 0
      for (const [name, thisTotal] of Object.entries(driverTotals)) {
        const prevTotal = prevDriverTotals[name] || 0
        const gain = thisTotal - prevTotal
        if (gain > biggestGain) {
          biggestGain = gain
          mostImproved = { name, thisWeek: thisTotal, lastWeek: prevTotal, gain }
        }
      }

      const quickStats = { busiestDay, avgStopsPerDriver, mostImproved }

      setData({
        todayLog, lastLog, isToday, isYesterday, lastDispatchDate,
        kpis: {
          totalOrdersLast30: totalOrders, avgOrdersPerNight: avgOrders,
          coldChainLast30: totalColdChain, shspTotal, aultmanTotal,
          thisWeekOrders, lastWeekOrders, wowChange,
          activeDrivers: activeThisWeek, totalDrivers: (driversRes.data || []).length,
          allTimeOrders, totalDispatches: logData.length,
        },
        leaderboard, recentLogs, volumeChart, timeOffByDate, optimizationStats,
        heatmapDrivers, heatmapMax, weekDates, quickStats,
      })
    } catch (err) {
      console.error('HQ error:', err)
    }
    finally { setLoading(false) }
  }

  if (loading) return <div className="hq__loading"><div className="dispatch__spinner" />Loading HQ data...</div>
  if (!data) return <div className="hq__loading">Failed to load dashboard</div>

  const { kpis, leaderboard, recentLogs, volumeChart, todayLog, lastLog, isToday, isYesterday, lastDispatchDate, timeOffByDate, optimizationStats, heatmapDrivers, heatmapMax, weekDates, quickStats } = data
  const maxVolume = Math.max(...(volumeChart?.map(d => d.orders) || [1]))
  const maxLeaderboard = leaderboard?.[0]?.weekTotal || 1

  return (
    <div className="hq">
      {/* Live status */}
      <div className={`hq__status ${isToday ? 'hq__status--live' : isYesterday ? 'hq__status--recent' : 'hq__status--stale'}`}>
        <div className={`hq__status-dot ${isToday ? 'hq__status-dot--pulse' : ''}`} />
        <span>
          {isToday ? 'Today' : isYesterday ? 'Yesterday' : fmtDay(lastDispatchDate) + ' ' + fmtDate(lastDispatchDate)}
          {' — '}<strong>{lastLog?.orders_processed || 0}</strong> orders dispatched
          {lastLog?.cold_chain > 0 && <>, <strong>{lastLog.cold_chain}</strong> cold chain</>}
          {lastLog?.top_driver && <> · Top: <strong>{lastLog.top_driver}</strong></>}
        </span>
      </div>

      {/* Today's snapshot (if available) */}
      {todayLog && (
        <div className="hq__today">
          <div className="hq__today-card">
            <span className="hq__today-label">Today's Stops</span>
            <span className="hq__today-value">{todayLog.orders_processed}</span>
          </div>
          <div className="hq__today-card">
            <span className="hq__today-label">Cold Chain</span>
            <span className="hq__today-value hq__today-value--accent">{todayLog.cold_chain || 0}</span>
          </div>
          <div className="hq__today-card">
            <span className="hq__today-label">SHSP</span>
            <span className="hq__today-value">{todayLog.shsp_orders || 0}</span>
          </div>
          <div className="hq__today-card">
            <span className="hq__today-label">Aultman</span>
            <span className="hq__today-value">{todayLog.aultman_orders || 0}</span>
          </div>
          <div className="hq__today-card">
            <span className="hq__today-label">Unassigned</span>
            <span className={`hq__today-value ${(todayLog.unassigned_count || 0) > 0 ? 'hq__today-value--warn' : ''}`}>{todayLog.unassigned_count || 0}</span>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="hq__kpis">
        <KPICard label="This Week" value={kpis.thisWeekOrders.toLocaleString()} sub={`${kpis.wowChange >= 0 ? '+' : ''}${kpis.wowChange}% vs last week (${kpis.lastWeekOrders.toLocaleString()})`} trend={kpis.wowChange >= 0 ? 'up' : 'down'} />
        <KPICard label="Avg / Night" value={kpis.avgOrdersPerNight} sub="Last 30 dispatches" />
        <KPICard label="Active Drivers" value={`${kpis.activeDrivers}/${kpis.totalDrivers}`} sub="Running this week" />
        <KPICard label="Cold Chain (30d)" value={kpis.coldChainLast30} sub={`${Math.round((kpis.coldChainLast30 / (kpis.totalOrdersLast30 || 1)) * 100)}% of orders`} accent />
        <KPICard label="All Time" value={kpis.allTimeOrders?.toLocaleString()} sub={`${kpis.totalDispatches} dispatches`} />
        <KPICard label="Pharmacy Split" value={`${Math.round((kpis.shspTotal / (kpis.shspTotal + kpis.aultmanTotal || 1)) * 100)}%`} sub={`SHSP ${kpis.shspTotal.toLocaleString()} / Aultman ${kpis.aultmanTotal.toLocaleString()}`} />
      </div>

      {/* Upcoming Time Off */}
      {Object.keys(timeOffByDate).length > 0 && (
        <div className="hq__timeoff">
          <h3 className="hq__card-title">Upcoming Time Off (Next 7 Days)</h3>
          <div className="hq__timeoff-list">
            {Object.entries(timeOffByDate).sort((a, b) => a[0].localeCompare(b[0])).map(([date, requests]) => (
              <div key={date} className="hq__timeoff-day">
                <span className="hq__timeoff-date">{fmtDay(date)} {fmtDate(date)}</span>
                <div className="hq__timeoff-drivers">
                  {requests.map((r, i) => (
                    <span key={i} className={`hq__timeoff-badge ${r.status === 'pending' ? 'hq__timeoff-badge--pending' : ''}`}>
                      {r.driver_name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="hq__grid">
        {/* Volume Trend — Interactive */}
        <div className="hq__card hq__card--wide">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 className="hq__card-title" style={{ margin: 0 }}>Volume Trend</h3>
            {hoveredBar !== null && (() => {
              const reversed = [...(volumeChart || [])].reverse()
              const hd = reversed[hoveredBar]
              if (!hd) return null
              return (
                <div className="hq__chart-tooltip">
                  <strong>{hd.day?.slice(0, 3)} {fmtDate(hd.date)}</strong>
                  <span>{hd.orders} total</span>
                  <span style={{ color: 'var(--cornflower)' }}>SHSP: {hd.shsp}</span>
                  <span style={{ color: '#4ADE80' }}>Aultman: {hd.aultman}</span>
                  <span style={{ color: '#60a5fa' }}>CC: {hd.coldChain}</span>
                </div>
              )
            })()}
          </div>
          <div className="hq__chart" onMouseLeave={() => setHoveredBar(null)}>
            {[...(volumeChart || [])].reverse().map((d, i) => {
              const isHovered = hoveredBar === i
              const avg = volumeChart.length ? Math.round(volumeChart.reduce((s, v) => s + v.orders, 0) / volumeChart.length) : 0
              return (
                <div className={`hq__bar-col ${isHovered ? 'hq__bar-col--hover' : ''}`} key={i}
                  onMouseEnter={() => setHoveredBar(i)}>
                  <div className="hq__bar-stack" style={{ height: `${(d.orders / maxVolume) * 100}%`, opacity: hoveredBar !== null && !isHovered ? 0.4 : 1 }}>
                    <div className="hq__bar-segment hq__bar-segment--aultman" style={{ height: `${d.orders ? (d.aultman / d.orders) * 100 : 0}%` }} />
                    <div className="hq__bar-segment hq__bar-segment--shsp" style={{ height: `${d.orders ? (d.shsp / d.orders) * 100 : 0}%` }} />
                  </div>
                  <span className="hq__bar-val" style={{ fontWeight: isHovered ? 800 : 600 }}>{d.orders}</span>
                  <span className="hq__bar-label">{d.day?.slice(0, 3)}</span>
                  <span className="hq__bar-date">{fmtDate(d.date)}</span>
                </div>
              )
            })}
            {/* Average line */}
            {volumeChart.length > 0 && (() => {
              const avg = Math.round(volumeChart.reduce((s, v) => s + v.orders, 0) / volumeChart.length)
              const avgPct = (avg / maxVolume) * 100
              return (
                <div className="hq__avg-line" style={{ bottom: `${avgPct}%` }}>
                  <span className="hq__avg-label">{avg} avg</span>
                </div>
              )
            })()}
          </div>
          <div className="hq__chart-legend">
            <span className="hq__legend"><span className="hq__legend-dot hq__legend-dot--shsp" />SHSP</span>
            <span className="hq__legend"><span className="hq__legend-dot hq__legend-dot--aultman" />Aultman</span>
          </div>
        </div>

        {/* Driver Leaderboard */}
        <div className="hq__card">
          <h3 className="hq__card-title">Driver Leaderboard</h3>
          <div className="hq__leaderboard">
            {leaderboard?.slice(0, 10).map((d, i) => (
              <div className="hq__leader" key={d.name}>
                <span className="hq__leader-rank">{i + 1}</span>
                <span className="hq__leader-name">{d.name}</span>
                <div className="hq__leader-bar-wrap">
                  <div className="hq__leader-bar" style={{ width: `${(d.weekTotal / maxLeaderboard) * 100}%` }} />
                </div>
                <span className="hq__leader-count">{d.weekTotal}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Driver Heatmap */}
        <div className="hq__card hq__card--wide">
          <h3 className="hq__card-title">Driver Weekly Heatmap</h3>
          {heatmapDrivers?.length > 0 ? (
            <div className="hq__heatmap">
              <div className="hq__heatmap-header">
                <span className="hq__heatmap-label" />
                {weekDates?.map(d => (
                  <span key={d} className="hq__heatmap-day">{['Mon','Tue','Wed','Thu','Fri'][new Date(d + 'T12:00:00').getDay() - 1] || ''}</span>
                ))}
                <span className="hq__heatmap-total-head">Total</span>
              </div>
              {heatmapDrivers.map((driver, i) => (
                <div key={driver.name} className="hq__heatmap-row" style={{ animationDelay: `${i * 0.04}s` }}>
                  <span className="hq__heatmap-name">{driver.name}</span>
                  {weekDates?.map(d => {
                    const count = driver.days[d] || 0
                    const intensity = count ? Math.max(0.15, count / heatmapMax) : 0
                    return (
                      <span
                        key={d}
                        className={`hq__heatmap-cell ${count === 0 ? 'hq__heatmap-cell--empty' : ''}`}
                        style={count > 0 ? { background: `rgba(10, 36, 99, ${intensity})`, color: intensity > 0.5 ? '#fff' : 'var(--gray-700)' } : undefined}
                        title={`${driver.name}: ${count} stops on ${d}`}
                      >
                        {count || ''}
                      </span>
                    )
                  })}
                  <span className="hq__heatmap-total">{driver.total}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--gray-400)', fontSize: 14 }}>No stop data this week yet</p>
          )}
        </div>

        {/* Route Optimization */}
        {optimizationStats && (
          <div className="hq__card">
            <h3 className="hq__card-title">Route Optimization</h3>
            <div className="hq__opt-stats">
              <div className="hq__opt-row">
                <span className="hq__opt-label">Manual Moves</span>
                <span className="hq__opt-value">{optimizationStats.totalMoves}</span>
              </div>
              <div className="hq__opt-row">
                <span className="hq__opt-label">AI Optimizations</span>
                <span className="hq__opt-value hq__opt-value--accent">{optimizationStats.totalOptimizeAccepted}</span>
              </div>
              {optimizationStats.totalOptimizeRejected > 0 && (
                <div className="hq__opt-row">
                  <span className="hq__opt-label">Rejected</span>
                  <span className="hq__opt-value hq__opt-value--muted">{optimizationStats.totalOptimizeRejected}</span>
                </div>
              )}
              <div className="hq__opt-row">
                <span className="hq__opt-label">Days with Changes</span>
                <span className="hq__opt-value">{optimizationStats.activeDates}</span>
              </div>
              <div className="hq__opt-divider" />
              <div className="hq__opt-row">
                <span className="hq__opt-label">This Week — Moves</span>
                <span className="hq__opt-value">{optimizationStats.thisWeekMoves}</span>
              </div>
              <div className="hq__opt-row">
                <span className="hq__opt-label">This Week — AI</span>
                <span className="hq__opt-value hq__opt-value--accent">{optimizationStats.thisWeekOptimize}</span>
              </div>
            </div>
            {optimizationStats.topMovedZips.length > 0 && (
              <>
                <h4 className="hq__opt-subtitle">Most Moved ZIPs</h4>
                <div className="hq__opt-zips">
                  {optimizationStats.topMovedZips.map(([zip, count]) => (
                    <div key={zip} className="hq__opt-zip">
                      <span className="hq__opt-zip-code">{zip}</span>
                      <div className="hq__opt-zip-bar-wrap">
                        <div className="hq__opt-zip-bar" style={{ width: `${(count / optimizationStats.topMovedZips[0][1]) * 100}%` }} />
                      </div>
                      <span className="hq__opt-zip-count">{count}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Quick Stats */}
      {quickStats && (
        <div className="hq__quick-stats">
          <div className="hq__quick-stat">
            <span className="hq__quick-stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            </span>
            <div className="hq__quick-stat-text">
              <span className="hq__quick-stat-label">Busiest Day</span>
              <span className="hq__quick-stat-value">
                {quickStats.busiestDay
                  ? `${fmtDay(quickStats.busiestDay.date)} ${fmtDate(quickStats.busiestDay.date)} — ${quickStats.busiestDay.count} stops`
                  : 'No data yet'}
              </span>
            </div>
          </div>
          <div className="hq__quick-stat">
            <span className="hq__quick-stat-icon hq__quick-stat-icon--green">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
            </span>
            <div className="hq__quick-stat-text">
              <span className="hq__quick-stat-label">Most Improved</span>
              <span className="hq__quick-stat-value">
                {quickStats.mostImproved
                  ? `${quickStats.mostImproved.name} — +${quickStats.mostImproved.gain} stops vs last week (${quickStats.mostImproved.lastWeek} → ${quickStats.mostImproved.thisWeek})`
                  : 'No comparison data yet'}
              </span>
            </div>
          </div>
          <div className="hq__quick-stat">
            <span className="hq__quick-stat-icon hq__quick-stat-icon--blue">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </span>
            <div className="hq__quick-stat-text">
              <span className="hq__quick-stat-label">Avg Stops / Driver</span>
              <span className="hq__quick-stat-value">{quickStats.avgStopsPerDriver} this week</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function KPICard({ label, value, sub, trend, accent }) {
  return (
    <div className="hq__kpi">
      <span className="hq__kpi-label">{label}</span>
      <span className={`hq__kpi-value ${accent ? 'hq__kpi-value--accent' : ''}`}>{value}</span>
      <span className={`hq__kpi-sub ${trend === 'up' ? 'hq__kpi-sub--up' : ''} ${trend === 'down' ? 'hq__kpi-sub--down' : ''}`}>{sub}</span>
    </div>
  )
}
