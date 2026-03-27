import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import './HQDashboard.css'

const WEEKDAYS = new Set(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])

export default function HQDashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [logsRes, weeklyRes, driversRes, unassignedRes, zipRes] = await Promise.all([
        supabase.from('dispatch_logs').select('*').order('date', { ascending: true }),
        supabase.from('payroll').select('*').order('week_of', { ascending: false }).limit(25),
        supabase.from('drivers').select('*').eq('active', true),
        supabase.from('unassigned_orders').select('*').order('date', { ascending: false }).limit(10),
        supabase.from('orders').select('zip').not('zip', 'is', null).not('zip', 'eq', ''),
      ])

      const logData = (logsRes.data || []).filter(r => WEEKDAYS.has(r.delivery_day))

      const now = new Date()
      const dow = now.getDay()
      const monOffset = dow === 0 ? -6 : 1 - dow
      const monday = new Date(now)
      monday.setDate(now.getDate() + monOffset)
      const mondayStr = monday.toISOString().split('T')[0]
      const recentLogs = logData.filter(r => r.date >= mondayStr).reverse().map(r => ({
        Date: r.date, 'Delivery Day': r.delivery_day,
        'Orders Processed': r.orders_processed, 'Cold Chain': r.cold_chain,
        'Unassigned Count': r.unassigned_count, 'SHSP Orders': r.shsp_orders,
        'Aultman Orders': r.aultman_orders, 'Top Driver': r.top_driver,
        Status: r.status,
      }))

      const lastDispatch = recentLogs[0] || {}

      const last30 = logData.slice(-30)
      const totalOrders = last30.reduce((s, r) => s + (r.orders_processed || 0), 0)
      const avgOrders = last30.length ? Math.round(totalOrders / last30.length) : 0
      const totalColdChain = last30.reduce((s, r) => s + (r.cold_chain || 0), 0)
      const shspTotal = last30.reduce((s, r) => s + (r.shsp_orders || 0), 0)
      const aultmanTotal = last30.reduce((s, r) => s + (r.aultman_orders || 0), 0)

      const thisWeek = logData.slice(-5)
      const lastWeek = logData.slice(-10, -5)
      const thisWeekOrders = thisWeek.reduce((s, r) => s + (r.orders_processed || 0), 0)
      const lastWeekOrders = lastWeek.reduce((s, r) => s + (r.orders_processed || 0), 0)
      const wowChange = lastWeekOrders ? Math.round(((thisWeekOrders - lastWeekOrders) / lastWeekOrders) * 100) : 0

      const currentWeek = weeklyRes.data?.filter(r => r.week_of === weeklyRes.data[0]?.week_of) || []
      const leaderboard = currentWeek
        .filter(r => r.driver_name !== 'Paul')
        .map(d => ({
          name: d.driver_name, id: d.driver_number,
          weekTotal: d.week_total || 0,
          mon: d.mon || 0, tue: d.tue || 0, wed: d.wed || 0,
          thu: d.thu || 0, fri: d.fri || 0,
        }))
        .sort((a, b) => b.weekTotal - a.weekTotal)

      const activeThisWeek = leaderboard.filter(d => d.weekTotal > 0).length

      const zipCounts = {}
      ;(zipRes.data || []).forEach(r => { zipCounts[r.zip] = (zipCounts[r.zip] || 0) + 1 })
      const topZips = Object.entries(zipCounts)
        .sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([zip, count]) => ({ ZIP: zip, Count: count }))

      const volumeChart = logData.slice(-14).map(r => ({
        date: r.date, day: r.delivery_day,
        orders: r.orders_processed || 0,
        shsp: r.shsp_orders || 0, aultman: r.aultman_orders || 0,
        coldChain: r.cold_chain || 0,
      }))

      const allTimeOrders = logData.reduce((s, r) => s + (r.orders_processed || 0), 0)

      setData({
        lastDispatch,
        kpis: {
          totalOrdersLast30: totalOrders, avgOrdersPerNight: avgOrders,
          coldChainLast30: totalColdChain, shspTotal, aultmanTotal,
          thisWeekOrders, lastWeekOrders, wowChange,
          activeDrivers: activeThisWeek, totalDrivers: (driversRes.data || []).length,
          allTimeOrders, totalDispatches: logData.length,
        },
        leaderboard, recentLogs, topZips, volumeChart,
      })
    } catch (err) {
      console.error('HQ error:', err)
    }
    finally { setLoading(false) }
  }

  if (loading) return <div className="hq__loading"><div className="dispatch__spinner" />Loading HQ data...</div>
  if (!data) return <div className="hq__loading">Failed to load dashboard</div>

  const { kpis, leaderboard, recentLogs, volumeChart, topZips, lastDispatch } = data
  const maxVolume = Math.max(...(volumeChart?.map((d) => d.orders) || [1]))
  const maxLeaderboard = leaderboard?.[0]?.weekTotal || 1

  return (
    <div className="hq">
      <div className="hq__status">
        <div className="hq__status-dot" />
        <span>Last delivery: <strong>{lastDispatch?.['Delivery Day']}</strong> ({lastDispatch?.Date}) — {lastDispatch?.['Orders Processed']} orders, {lastDispatch?.Status}</span>
      </div>

      <div className="hq__kpis">
        <KPICard label="This Week" value={kpis.thisWeekOrders} sub={`${kpis.wowChange >= 0 ? '+' : ''}${kpis.wowChange}% vs last week`} trend={kpis.wowChange >= 0 ? 'up' : 'down'} />
        <KPICard label="Avg / Night" value={kpis.avgOrdersPerNight} sub="Last 30 dispatches" />
        <KPICard label="Active Drivers" value={`${kpis.activeDrivers}/${kpis.totalDrivers}`} sub="Running this week" />
        <KPICard label="Cold Chain (30d)" value={kpis.coldChainLast30} sub={`${Math.round((kpis.coldChainLast30 / (kpis.totalOrdersLast30 || 1)) * 100)}% of orders`} accent />
        <KPICard label="All Time" value={kpis.allTimeOrders?.toLocaleString()} sub={`${kpis.totalDispatches} dispatches`} />
        <KPICard label="Pharmacy Split" value={`${Math.round((kpis.shspTotal / (kpis.shspTotal + kpis.aultmanTotal || 1)) * 100)}%`} sub={`SHSP ${kpis.shspTotal} / Aultman ${kpis.aultmanTotal}`} />
      </div>

      <div className="hq__grid">
        <div className="hq__card hq__card--wide">
          <h3 className="hq__card-title">Volume Trend</h3>
          <div className="hq__chart">
            {volumeChart?.map((d, i) => (
              <div className="hq__bar-col" key={i}>
                <div className="hq__bar-stack" style={{ height: `${(d.orders / maxVolume) * 100}%` }}>
                  <div className="hq__bar-segment hq__bar-segment--aultman" style={{ height: `${(d.aultman / d.orders) * 100}%` }} title={`Aultman: ${d.aultman}`} />
                  <div className="hq__bar-segment hq__bar-segment--shsp" style={{ height: `${(d.shsp / d.orders) * 100}%` }} title={`SHSP: ${d.shsp}`} />
                </div>
                <span className="hq__bar-val">{d.orders}</span>
                <span className="hq__bar-label">{d.day?.slice(0, 3)}</span>
                <span className="hq__bar-date">{d.date?.slice(0, 5)}</span>
              </div>
            ))}
          </div>
          <div className="hq__chart-legend">
            <span className="hq__legend"><span className="hq__legend-dot hq__legend-dot--shsp" />SHSP</span>
            <span className="hq__legend"><span className="hq__legend-dot hq__legend-dot--aultman" />Aultman</span>
          </div>
        </div>

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

        <div className="hq__card hq__card--wide">
          <h3 className="hq__card-title">Recent Deliveries</h3>
          <table className="hq__table">
            <thead>
              <tr>
                <th>Delivery Day</th><th>Dispatched</th><th>Orders</th>
                <th>SHSP</th><th>Aultman</th><th>CC</th>
                <th>Unassigned</th><th>Top Driver</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentLogs?.map((log, i) => (
                <tr key={i}>
                  <td className="hq__cell-date">{log['Delivery Day']}</td>
                  <td>{log.Date}</td>
                  <td className="hq__cell-num">{log['Orders Processed']}</td>
                  <td className="hq__cell-num">{log['SHSP Orders']}</td>
                  <td className="hq__cell-num">{log['Aultman Orders']}</td>
                  <td className="hq__cell-num">{log['Cold Chain']}</td>
                  <td className={parseInt(log['Unassigned Count']) > 0 ? 'hq__cell-warn' : 'hq__cell-num'}>{log['Unassigned Count']}</td>
                  <td>{log['Top Driver']}</td>
                  <td><span className={`hq__status-badge ${log.Status === 'Complete' ? 'hq__status-badge--ok' : ''}`}>{log.Status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="hq__card">
          <h3 className="hq__card-title">Top ZIP Codes</h3>
          <div className="hq__zips">
            {topZips?.map((z, i) => (
              <div className="hq__zip" key={i}>
                <span className="hq__zip-code">{z.ZIP}</span>
                <span className="hq__zip-count">{z.Count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
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
