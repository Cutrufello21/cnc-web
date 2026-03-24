import { useState, useEffect } from 'react'
import './HQDashboard.css'

export default function HQDashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/hq')
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="hq__loading"><div className="dispatch__spinner" />Loading HQ data...</div>
  if (!data) return <div className="hq__loading">Failed to load dashboard</div>

  const { kpis, leaderboard, recentLogs, volumeChart, topZips, lastDispatch } = data
  const maxVolume = Math.max(...(volumeChart?.map((d) => d.orders) || [1]))
  const maxLeaderboard = leaderboard?.[0]?.weekTotal || 1

  return (
    <div className="hq">
      {/* Last dispatch status */}
      <div className="hq__status">
        <div className="hq__status-dot" />
        <span>Last delivery: <strong>{lastDispatch?.['Delivery Day']}</strong> ({lastDispatch?.Date}) — {lastDispatch?.['Orders Processed']} orders, {lastDispatch?.Status}</span>
      </div>

      {/* KPI Cards */}
      <div className="hq__kpis">
        <KPICard
          label="This Week"
          value={kpis.thisWeekOrders}
          sub={`${kpis.wowChange >= 0 ? '+' : ''}${kpis.wowChange}% vs last week`}
          trend={kpis.wowChange >= 0 ? 'up' : 'down'}
        />
        <KPICard
          label="Avg / Night"
          value={kpis.avgOrdersPerNight}
          sub="Last 30 dispatches"
        />
        <KPICard
          label="Active Drivers"
          value={`${kpis.activeDrivers}/${kpis.totalDrivers}`}
          sub="Running this week"
        />
        <KPICard
          label="Cold Chain (30d)"
          value={kpis.coldChainLast30}
          sub={`${Math.round((kpis.coldChainLast30 / (kpis.totalOrdersLast30 || 1)) * 100)}% of orders`}
          accent
        />
        <KPICard
          label="All Time"
          value={kpis.allTimeOrders?.toLocaleString()}
          sub={`${kpis.totalDispatches} dispatches`}
        />
        <KPICard
          label="Pharmacy Split"
          value={`${Math.round((kpis.shspTotal / (kpis.shspTotal + kpis.aultmanTotal || 1)) * 100)}%`}
          sub={`SHSP ${kpis.shspTotal} / Aultman ${kpis.aultmanTotal}`}
        />
      </div>

      <div className="hq__grid">
        {/* Volume chart */}
        <div className="hq__card hq__card--wide">
          <h3 className="hq__card-title">Volume Trend</h3>
          <div className="hq__chart">
            {volumeChart?.map((d, i) => (
              <div className="hq__bar-col" key={i}>
                <div className="hq__bar-stack" style={{ height: `${(d.orders / maxVolume) * 100}%` }}>
                  <div
                    className="hq__bar-segment hq__bar-segment--aultman"
                    style={{ height: `${(d.aultman / d.orders) * 100}%` }}
                    title={`Aultman: ${d.aultman}`}
                  />
                  <div
                    className="hq__bar-segment hq__bar-segment--shsp"
                    style={{ height: `${(d.shsp / d.orders) * 100}%` }}
                    title={`SHSP: ${d.shsp}`}
                  />
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

        {/* Driver leaderboard */}
        <div className="hq__card">
          <h3 className="hq__card-title">Driver Leaderboard</h3>
          <div className="hq__leaderboard">
            {leaderboard?.slice(0, 10).map((d, i) => (
              <div className="hq__leader" key={d.name}>
                <span className="hq__leader-rank">{i + 1}</span>
                <span className="hq__leader-name">{d.name}</span>
                <div className="hq__leader-bar-wrap">
                  <div
                    className="hq__leader-bar"
                    style={{ width: `${(d.weekTotal / maxLeaderboard) * 100}%` }}
                  />
                </div>
                <span className="hq__leader-count">{d.weekTotal}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent dispatch log */}
        <div className="hq__card hq__card--wide">
          <h3 className="hq__card-title">Recent Deliveries</h3>
          <table className="hq__table">
            <thead>
              <tr>
                <th>Delivery Day</th>
                <th>Dispatched</th>
                <th>Orders</th>
                <th>SHSP</th>
                <th>Aultman</th>
                <th>CC</th>
                <th>Unassigned</th>
                <th>Top Driver</th>
                <th>Status</th>
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
                  <td className={parseInt(log['Unassigned Count']) > 0 ? 'hq__cell-warn' : 'hq__cell-num'}>
                    {log['Unassigned Count']}
                  </td>
                  <td>{log['Top Driver']}{log['Top Stops'] ? ` (${log['Top Stops']})` : ''}</td>
                  <td>
                    <span className={`hq__status-badge ${log.Status === 'Complete' ? 'hq__status-badge--ok' : ''}`}>
                      {log.Status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Top ZIPs */}
        <div className="hq__card">
          <h3 className="hq__card-title">Top ZIP Codes</h3>
          <div className="hq__zips">
            {topZips?.map((z, i) => {
              const zip = z.ZIP || z['Zip Code'] || Object.values(z)[0] || ''
              const count = z.Count || z.Orders || z.Total || Object.values(z)[1] || ''
              return (
                <div className="hq__zip" key={i}>
                  <span className="hq__zip-code">{zip}</span>
                  <span className="hq__zip-count">{count}</span>
                </div>
              )
            })}
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
      <span className={`hq__kpi-sub ${trend === 'up' ? 'hq__kpi-sub--up' : ''} ${trend === 'down' ? 'hq__kpi-sub--down' : ''}`}>
        {sub}
      </span>
    </div>
  )
}
