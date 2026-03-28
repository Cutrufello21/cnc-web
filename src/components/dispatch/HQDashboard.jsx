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

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      const [logsRes, weeklyRes, driversRes, timeOffRes] = await Promise.all([
        supabase.from('dispatch_logs').select('*').order('date', { ascending: true }),
        supabase.from('payroll').select('*').order('week_of', { ascending: false }).limit(25),
        supabase.from('drivers').select('*').eq('active', true),
        supabase.from('time_off_requests').select('driver_name, date_off, status')
          .in('status', ['approved', 'pending'])
          .gte('date_off', new Date().toISOString().split('T')[0]),
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

      setData({
        todayLog, lastLog, isToday, isYesterday, lastDispatchDate,
        kpis: {
          totalOrdersLast30: totalOrders, avgOrdersPerNight: avgOrders,
          coldChainLast30: totalColdChain, shspTotal, aultmanTotal,
          thisWeekOrders, lastWeekOrders, wowChange,
          activeDrivers: activeThisWeek, totalDrivers: (driversRes.data || []).length,
          allTimeOrders, totalDispatches: logData.length,
        },
        leaderboard, recentLogs, volumeChart, timeOffByDate,
      })
    } catch (err) {
      console.error('HQ error:', err)
    }
    finally { setLoading(false) }
  }

  if (loading) return <div className="hq__loading"><div className="dispatch__spinner" />Loading HQ data...</div>
  if (!data) return <div className="hq__loading">Failed to load dashboard</div>

  const { kpis, leaderboard, recentLogs, volumeChart, todayLog, lastLog, isToday, isYesterday, lastDispatchDate, timeOffByDate } = data
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
        {/* Volume Trend */}
        <div className="hq__card hq__card--wide">
          <h3 className="hq__card-title">Volume Trend</h3>
          <div className="hq__chart">
            {(volumeChart || []).map((d, i) => (
              <div className="hq__bar-col" key={i}>
                <div className="hq__bar-stack" style={{ height: `${(d.orders / maxVolume) * 100}%` }}>
                  <div className="hq__bar-segment hq__bar-segment--aultman" style={{ height: `${d.orders ? (d.aultman / d.orders) * 100 : 0}%` }} title={`Aultman: ${d.aultman}`} />
                  <div className="hq__bar-segment hq__bar-segment--shsp" style={{ height: `${d.orders ? (d.shsp / d.orders) * 100 : 0}%` }} title={`SHSP: ${d.shsp}`} />
                </div>
                <span className="hq__bar-val">{d.orders}</span>
                <span className="hq__bar-label">{d.day?.slice(0, 3)}</span>
                <span className="hq__bar-date">{fmtDate(d.date)}</span>
              </div>
            ))}
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

        {/* Recent Deliveries — Interactive */}
        <div className="hq__card hq__card--wide">
          <h3 className="hq__card-title">This Week's Dispatches</h3>
          {recentLogs.length === 0 ? (
            <p style={{ color: 'var(--gray-400)', fontSize: 14 }}>No dispatches this week yet</p>
          ) : (() => {
            const today = new Date().toISOString().split('T')[0]
            const maxOrders = Math.max(...recentLogs.map(l => l.orders_processed || 0), 1)

            const cols = [
              { key: 'delivery_day', label: 'Day', get: l => l.delivery_day },
              { key: 'date', label: 'Date', get: l => l.date },
              { key: 'orders_processed', label: 'Orders', get: l => l.orders_processed || 0 },
              { key: 'shsp_orders', label: 'SHSP', get: l => l.shsp_orders || 0 },
              { key: 'aultman_orders', label: 'Aultman', get: l => l.aultman_orders || 0 },
              { key: 'cold_chain', label: 'CC', get: l => l.cold_chain || 0 },
              { key: 'unassigned_count', label: 'Unassigned', get: l => l.unassigned_count || 0 },
              { key: 'top_driver', label: 'Top Driver', get: l => l.top_driver || '' },
              { key: 'status', label: 'Status', get: l => l.status || '' },
            ]

            const sorted = [...recentLogs]
            if (tableSort.col) {
              const col = cols.find(c => c.key === tableSort.col)
              if (col) {
                sorted.sort((a, b) => {
                  const av = col.get(a), bv = col.get(b)
                  const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv))
                  return tableSort.dir === 'asc' ? cmp : -cmp
                })
              }
            }

            function handleSort(key) {
              setTableSort(prev => prev.col === key ? { col: key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col: key, dir: 'desc' })
            }

            return (
              <table className="hq__table hq__table--interactive">
                <thead>
                  <tr>
                    {cols.map(c => (
                      <th key={c.key} onClick={() => handleSort(c.key)} className="hq__th-sort">
                        {c.label}
                        {tableSort.col === c.key && <span className="hq__sort-arrow">{tableSort.dir === 'asc' ? ' ↑' : ' ↓'}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((log, i) => {
                    const isToday = log.date === today
                    const isExpanded = expandedRow === i
                    const ordersPct = maxOrders ? (log.orders_processed / maxOrders) * 100 : 0
                    return (
                      <>
                        <tr key={i} className={`${isToday ? 'hq__row--today' : ''} ${isExpanded ? 'hq__row--expanded' : ''}`}
                          onClick={() => setExpandedRow(isExpanded ? null : i)}
                          style={{ cursor: 'pointer' }}>
                          <td className="hq__cell-date">{log.delivery_day?.slice(0, 3)}</td>
                          <td>{fmtDate(log.date)}</td>
                          <td className="hq__cell-num">
                            <div className="hq__inline-bar-wrap">
                              <div className="hq__inline-bar" style={{ width: `${ordersPct}%` }} />
                              <span>{log.orders_processed}</span>
                            </div>
                          </td>
                          <td className="hq__cell-num">{log.shsp_orders}</td>
                          <td className="hq__cell-num">{log.aultman_orders}</td>
                          <td className="hq__cell-num" style={{ color: log.cold_chain > 0 ? '#3b82f6' : undefined }}>{log.cold_chain}</td>
                          <td className={parseInt(log.unassigned_count) > 0 ? 'hq__cell-warn' : 'hq__cell-num'}>{log.unassigned_count}</td>
                          <td><strong>{log.top_driver}</strong></td>
                          <td><span className={`hq__status-badge ${log.status === 'Complete' ? 'hq__status-badge--ok' : ''}`}>{log.status}</span></td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${i}-detail`} className="hq__detail-row">
                            <td colSpan={9}>
                              <div className="hq__detail">
                                <div className="hq__detail-item">
                                  <span className="hq__detail-label">Pharmacy Split</span>
                                  <div className="hq__detail-split">
                                    <div className="hq__detail-split-shsp" style={{ width: `${log.orders_processed ? (log.shsp_orders / log.orders_processed) * 100 : 50}%` }}>
                                      SHSP {log.shsp_orders}
                                    </div>
                                    <div className="hq__detail-split-aultman" style={{ width: `${log.orders_processed ? (log.aultman_orders / log.orders_processed) * 100 : 50}%` }}>
                                      Aultman {log.aultman_orders}
                                    </div>
                                  </div>
                                </div>
                                <div className="hq__detail-stats">
                                  <div className="hq__detail-stat">
                                    <span>Cold Chain %</span>
                                    <strong>{log.orders_processed ? Math.round((log.cold_chain / log.orders_processed) * 100) : 0}%</strong>
                                  </div>
                                  <div className="hq__detail-stat">
                                    <span>Corrections</span>
                                    <strong>{log.corrections || 0}</strong>
                                  </div>
                                  <div className="hq__detail-stat">
                                    <span>Dispatched</span>
                                    <strong>{log.date}</strong>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            )
          })()}
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
