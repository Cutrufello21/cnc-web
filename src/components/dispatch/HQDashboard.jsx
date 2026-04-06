import { useState, useEffect, useRef } from 'react'
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
  const [showMoreKpis, setShowMoreKpis] = useState(false)
  const liveInterval = useRef(null)

  const channelRef = useRef(null)

  useEffect(() => {
    loadData()

    // Subscribe to realtime daily_stops changes for today
    const today = new Date().toISOString().split('T')[0]
    channelRef.current = supabase
      .channel('live-stops')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'daily_stops',
        filter: `delivery_date=eq.${today}`,
      }, () => loadLiveProgress())
      .subscribe()

    // Fallback polling every 60s in case realtime hiccups
    liveInterval.current = setInterval(loadLiveProgress, 60000)

    return () => {
      clearInterval(liveInterval.current)
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [])

  const [liveProgress, setLiveProgress] = useState(null)

  async function loadLiveProgress() {
    const today = new Date().toISOString().split('T')[0]
    const { data: stops } = await supabase.from('daily_stops').select('status, driver_name, pharmacy, delivered_at').eq('delivery_date', today)
    if (!stops || stops.length === 0) { setLiveProgress(null); return }
    const total = stops.length
    const delivered = stops.filter(s => s.status === 'delivered').length
    const failed = stops.filter(s => s.status === 'failed').length
    const driverMap = {}
    stops.forEach(s => {
      if (!driverMap[s.driver_name]) driverMap[s.driver_name] = { total: 0, done: 0, shsp: 0, aultman: 0, lastDelivery: null }
      driverMap[s.driver_name].total++
      if (s.status === 'delivered' || s.status === 'failed') {
        driverMap[s.driver_name].done++
        if (s.delivered_at && (!driverMap[s.driver_name].lastDelivery || s.delivered_at > driverMap[s.driver_name].lastDelivery)) {
          driverMap[s.driver_name].lastDelivery = s.delivered_at
        }
      }
      if (s.pharmacy === 'SHSP') driverMap[s.driver_name].shsp++
      else driverMap[s.driver_name].aultman++
    })
    const activeDrivers = Object.keys(driverMap).length
    const avgPerDriver = activeDrivers ? Math.round(total / activeDrivers) : 0

    // Estimate fleet finish time based on pace
    let estFinish = null
    const deliveredTimes = stops.filter(s => s.delivered_at).map(s => new Date(s.delivered_at).getTime()).sort()
    if (deliveredTimes.length >= 3 && delivered < total) {
      const first = deliveredTimes[0]
      const last = deliveredTimes[deliveredTimes.length - 1]
      const elapsed = last - first
      const rate = delivered / (elapsed / 60000) // deliveries per minute
      if (rate > 0) {
        const remaining = total - delivered - failed
        const minsLeft = remaining / rate
        estFinish = new Date(Date.now() + minsLeft * 60000)
      }
    }

    setLiveProgress({ total, delivered, failed, driverMap, activeDrivers, avgPerDriver, estFinish })
  }

  async function loadData() {
    try {
      const [logsRes, weeklyRes, driversRes, timeOffRes] = await Promise.all([
        supabase.from('dispatch_logs').select('*').order('date', { ascending: false }).limit(60),
        supabase.from('payroll').select('*').order('week_of', { ascending: false }).limit(25),
        supabase.from('drivers').select('*').eq('active', true),
        supabase.from('time_off_requests').select('driver_name, date_off, end_date, status')
          .in('status', ['approved', 'pending'])
          .gte('date_off', new Date().toISOString().split('T')[0]),
      ])

      const logData = (logsRes.data || []).reverse().filter(r => WEEKDAYS.has(r.delivery_day))
      const today = new Date().toISOString().split('T')[0]

      const now = new Date()
      const dow = now.getDay()
      const monOffset = dow === 0 ? -6 : 1 - dow
      const monday = new Date(now)
      monday.setDate(now.getDate() + monOffset)
      const mondayStr = monday.toISOString().split('T')[0]

      const todayLog = logData.find(r => r.date === today)
      const lastLog = logData[logData.length - 1]
      const lastDispatchDate = lastLog?.date || ''
      const isToday = lastDispatchDate === today
      const isYesterday = (() => {
        const y = new Date(now)
        y.setDate(y.getDate() - 1)
        return lastDispatchDate === y.toISOString().split('T')[0]
      })()

      const recentLogs = logData.filter(r => r.date >= mondayStr).reverse()
      const last30 = logData.slice(-30)
      const totalOrders = last30.reduce((s, r) => s + (r.orders_processed || 0), 0)
      const avgOrders = last30.length ? Math.round(totalOrders / last30.length) : 0
      const totalColdChain = last30.reduce((s, r) => s + (r.cold_chain || 0), 0)
      const shspTotal = last30.reduce((s, r) => s + (r.shsp_orders || 0), 0)
      const aultmanTotal = last30.reduce((s, r) => s + (r.aultman_orders || 0), 0)

      const todayDayName = lastLog?.delivery_day || ''
      const thisWeek = logData.filter(r => r.date >= mondayStr)
      const thisWeekOrders = thisWeek.reduce((s, r) => s + (r.orders_processed || 0), 0)

      const lastMonday = new Date(monday)
      lastMonday.setDate(lastMonday.getDate() - 7)
      const lastMondayStr = lastMonday.toISOString().split('T')[0]
      const lastWeek = logData.filter(r => r.date >= lastMondayStr && r.date < mondayStr)
      const lastWeekSameDays = lastWeek.slice(0, thisWeek.length)
      const lastWeekSameDaysOrders = lastWeekSameDays.reduce((s, r) => s + (r.orders_processed || 0), 0)
      const wowChange = lastWeekSameDaysOrders ? Math.round(((thisWeekOrders - lastWeekSameDaysOrders) / lastWeekSameDaysOrders) * 100) : 0
      const wowDays = thisWeek.length

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

      const volumeChart = logData.slice(-14).map(r => ({
        date: r.date, day: r.delivery_day,
        orders: r.orders_processed || 0,
        shsp: r.shsp_orders || 0, aultman: r.aultman_orders || 0,
        coldChain: r.cold_chain || 0,
      }))

      // Collapse time off into date ranges per driver
      const sevenDaysOut = new Date(now)
      sevenDaysOut.setDate(sevenDaysOut.getDate() + 7)
      const sevenStr = sevenDaysOut.toISOString().split('T')[0]
      const rawTimeOff = (timeOffRes.data || []).filter(r => r.date_off <= sevenStr)

      // Group by driver and collapse consecutive dates
      const driverTimeOff = {}
      rawTimeOff.forEach(r => {
        if (!driverTimeOff[r.driver_name]) driverTimeOff[r.driver_name] = { dates: [], status: r.status }
        driverTimeOff[r.driver_name].dates.push(r.date_off)
        if (r.end_date) driverTimeOff[r.driver_name].endDate = r.end_date
      })

      const timeOffRanges = Object.entries(driverTimeOff).map(([name, info]) => {
        const sorted = [...new Set(info.dates)].sort()
        const start = sorted[0]
        const end = info.endDate || sorted[sorted.length - 1]
        const startDay = new Date(start + 'T12:00:00').getDay()
        const endDay = new Date(end + 'T12:00:00').getDay()
        const isFullWeek = sorted.length >= 5 || (startDay === 1 && endDay === 5)
        return { name, start, end, days: sorted.length, isFullWeek, status: info.status }
      })

      const allTimeOrders = logData.reduce((s, r) => s + (r.orders_processed || 0), 0)

      setData({
        todayLog, lastLog, isToday, isYesterday, lastDispatchDate,
        kpis: {
          totalOrdersLast30: totalOrders, avgOrdersPerNight: avgOrders,
          coldChainLast30: totalColdChain, shspTotal, aultmanTotal,
          thisWeekOrders, wowChange, wowDays,
          activeDrivers: activeThisWeek, totalDrivers: (driversRes.data || []).length,
          allTimeOrders, totalDispatches: logData.length,
        },
        leaderboard, recentLogs, volumeChart, timeOffRanges,
      })

      loadLiveProgress()
    } catch (err) {
      console.error('HQ error:', err)
    }
    finally { setLoading(false) }
  }

  if (loading) return <div className="hq__loading"><div className="dispatch__spinner" />Loading HQ data...</div>
  if (!data) return <div className="hq__loading">Failed to load dashboard</div>

  const { kpis, leaderboard, recentLogs, volumeChart, todayLog, lastLog, isToday, isYesterday, lastDispatchDate, timeOffRanges } = data
  const maxVolume = Math.max(...(volumeChart?.map(d => d.orders) || [1]))
  const maxLeaderboard = leaderboard?.[0]?.weekTotal || 1
  const avg = volumeChart?.length ? Math.round(volumeChart.reduce((s, v) => s + v.orders, 0) / volumeChart.length) : 0

  // Determine which table columns have any non-zero values
  const hasCC = recentLogs.some(l => (l.cold_chain || 0) > 0)
  const hasUnassigned = recentLogs.some(l => (l.unassigned_count || 0) > 0)

  return (
    <div className="hq">

      {/* ─── LIVE STATUS + PROGRESS ─── */}
      <div className={`hq__status ${isToday ? 'hq__status--live' : isYesterday ? 'hq__status--recent' : 'hq__status--stale'}`}>
        <div className={`hq__status-dot ${isToday ? 'hq__status-dot--pulse' : ''}`} />
        <div className="hq__status-content">
          <span>
            {isToday ? fmtDay(lastDispatchDate) : isYesterday ? 'Yesterday' : fmtDay(lastDispatchDate) + ' ' + fmtDate(lastDispatchDate)}
            {' — '}<strong>{lastLog?.orders_processed || 0}</strong> orders dispatched
            {lastLog?.top_driver && <> · Top: <strong>{lastLog.top_driver}</strong></>}
          </span>
          {liveProgress && liveProgress.total > 0 && (
            <div className="hq__live-progress">
              <div className="hq__live-bar-wrap">
                <div className="hq__live-bar" style={{ width: `${(liveProgress.delivered / liveProgress.total) * 100}%` }} />
              </div>
              <span className="hq__live-text">
                <strong>{liveProgress.delivered}</strong>/{liveProgress.total} delivered
                {liveProgress.failed > 0 && <> · <span style={{ color: '#dc4a4a' }}>{liveProgress.failed} failed</span></>}
                {liveProgress.estFinish && <> · Est. done <strong>{liveProgress.estFinish.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</strong></>}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ─── TIME OFF BANNER ─── */}
      {timeOffRanges.length > 0 && (
        <div className="hq__timeoff-banner">
          <span className="hq__timeoff-icon">📅</span>
          <span className="hq__timeoff-text">
            {timeOffRanges.map((t, i) => (
              <span key={t.name}>
                {i > 0 && ' · '}
                <strong>{t.name}</strong>{' '}
                {t.isFullWeek ? (
                  <span className="hq__timeoff-range hq__timeoff-range--full">full week</span>
                ) : t.start === t.end ? (
                  <span className="hq__timeoff-range">{fmtDay(t.start)} {fmtDate(t.start)}</span>
                ) : (
                  <span className="hq__timeoff-range">{fmtDate(t.start)}–{fmtDate(t.end)}</span>
                )}
              </span>
            ))}
          </span>
        </div>
      )}

      {/* ─── KPI CARDS (4 main) ─── */}
      <div className="hq__kpis">
        <KPICard label="This Week" value={kpis.thisWeekOrders.toLocaleString()} sub={`${kpis.wowChange >= 0 ? '+' : ''}${kpis.wowChange}% vs same ${kpis.wowDays} day${kpis.wowDays !== 1 ? 's' : ''} last week`} trend={kpis.wowChange >= 0 ? 'up' : 'down'} />
        <KPICard label="Avg / Night" value={kpis.avgOrdersPerNight} sub="Last 30 dispatches" />
        <KPICard label="Active Drivers" value={`${kpis.activeDrivers}/${kpis.totalDrivers}`} sub={liveProgress ? `${liveProgress.activeDrivers} on road today` : 'Running this week'} />
        <KPICard label="Pharmacy Split" value={`${Math.round((kpis.shspTotal / (kpis.shspTotal + kpis.aultmanTotal || 1)) * 100)}%`} sub={`SHSP ${kpis.shspTotal.toLocaleString()} / Aultman ${kpis.aultmanTotal.toLocaleString()}`} />
      </div>

      {/* Collapsible secondary KPIs */}
      {showMoreKpis && (
        <div className="hq__kpis hq__kpis--secondary">
          <KPICard label="Cold Chain (30d)" value={kpis.coldChainLast30.toLocaleString()} sub={`${Math.round((kpis.coldChainLast30 / (kpis.totalOrdersLast30 || 1)) * 100)}% of orders`} accent />
          <KPICard label="All Time" value={kpis.allTimeOrders?.toLocaleString()} sub={`${kpis.totalDispatches} dispatches`} />
          {liveProgress && liveProgress.activeDrivers > 0 && <KPICard label="Avg / Driver" value={liveProgress.avgPerDriver} sub={`${liveProgress.activeDrivers} drivers today`} />}
        </div>
      )}
      <button className="hq__more-btn" onClick={() => setShowMoreKpis(!showMoreKpis)}>
        {showMoreKpis ? '▲ Less stats' : '▼ More stats'}
      </button>

      {/* ─── DRIVER STATUS (live) ─── */}
      {liveProgress && Object.keys(liveProgress.driverMap).length > 0 && (
        <div className="hq__driver-status">
          <h3 className="hq__card-title">Driver Status</h3>
          <div className="hq__driver-grid">
            {Object.entries(liveProgress.driverMap)
              .sort((a, b) => (a[1].done / a[1].total) - (b[1].done / b[1].total))
              .map(([name, d]) => {
                const pct = d.total ? Math.round((d.done / d.total) * 100) : 0
                const isDone = d.done === d.total
                const notStarted = d.done === 0
                return (
                  <div key={name} className={`hq__driver-chip ${isDone ? 'hq__driver-chip--done' : notStarted ? 'hq__driver-chip--idle' : ''}`}>
                    <div className={`hq__chip-dot ${isDone ? 'hq__chip-dot--done' : notStarted ? 'hq__chip-dot--idle' : 'hq__chip-dot--active'}`} />
                    <span className="hq__chip-name">{name}</span>
                    <span className="hq__chip-count">{d.done}/{d.total}</span>
                    <div className="hq__chip-bar">
                      <div className="hq__chip-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      <div className="hq__grid">
        {/* ─── VOLUME TREND ─── */}
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
                  <span style={{ color: '#4A9EFF' }}>SHSP: {hd.shsp}</span>
                  <span style={{ color: '#4ADE80' }}>Aultman: {hd.aultman}</span>
                  {hd.coldChain > 0 && <span style={{ color: '#60a5fa' }}>CC: {hd.coldChain}</span>}
                </div>
              )
            })()}
          </div>
          <div className="hq__chart" onMouseLeave={() => setHoveredBar(null)}>
            {[...(volumeChart || [])].reverse().map((d, i) => {
              const isHovered = hoveredBar === i
              return (
                <div className={`hq__bar-col ${isHovered ? 'hq__bar-col--hover' : ''}`} key={i}
                  onMouseEnter={() => setHoveredBar(i)}>
                  <div className="hq__bar-stack" style={{ height: `${(d.orders / maxVolume) * 100}%`, opacity: hoveredBar !== null && !isHovered ? 0.35 : 1 }}>
                    <div className="hq__bar-segment hq__bar-segment--aultman" style={{ height: `${d.orders ? (d.aultman / d.orders) * 100 : 0}%` }} />
                    <div className="hq__bar-segment hq__bar-segment--shsp" style={{ height: `${d.orders ? (d.shsp / d.orders) * 100 : 0}%` }} />
                  </div>
                  <span className="hq__bar-val" style={{ fontWeight: isHovered ? 800 : 600 }}>{d.orders}</span>
                  <span className="hq__bar-label">{d.day?.slice(0, 3)}</span>
                </div>
              )
            })}
            {volumeChart.length > 0 && (
              <div className="hq__avg-line" style={{ bottom: `${(avg / maxVolume) * 100}%` }}>
                <span className="hq__avg-label">{avg} avg</span>
              </div>
            )}
          </div>
          <div className="hq__chart-legend">
            <span className="hq__legend"><span className="hq__legend-dot hq__legend-dot--shsp" />SHSP</span>
            <span className="hq__legend"><span className="hq__legend-dot hq__legend-dot--aultman" />Aultman</span>
          </div>
        </div>

        {/* ─── DRIVER LEADERBOARD ─── */}
        <div className="hq__card">
          <h3 className="hq__card-title">Driver Leaderboard</h3>
          <div className="hq__leaderboard">
            {leaderboard?.slice(0, 10).map((d, i) => {
              const driverLive = liveProgress?.driverMap?.[d.name]
              const statusClass = driverLive
                ? (driverLive.done < driverLive.total ? 'hq__driver-dot--active' : 'hq__driver-dot--done')
                : 'hq__driver-dot--off'
              const shspPct = driverLive && driverLive.total > 0 ? (driverLive.shsp / maxLeaderboard) * 100 : 0
              const aultPct = driverLive && driverLive.total > 0 ? (driverLive.aultman / maxLeaderboard) * 100 : 0
              return (
                <div className="hq__leader" key={d.name}>
                  <span className="hq__leader-rank">{i + 1}</span>
                  <div className="hq__leader-name-wrap">
                    <div className={`hq__driver-dot ${statusClass}`} />
                    <span className="hq__leader-name">{d.name}</span>
                  </div>
                  <div className="hq__leader-bar-wrap">
                    {driverLive && driverLive.total > 0 ? (
                      <>
                        <div className="hq__leader-bar hq__leader-bar--shsp" style={{ width: `${shspPct}%` }} />
                        <div className="hq__leader-bar hq__leader-bar--aultman" style={{ width: `${aultPct}%`, position: 'absolute', left: `${shspPct}%` }} />
                      </>
                    ) : (
                      <div className="hq__leader-bar" style={{ width: `${(d.weekTotal / maxLeaderboard) * 100}%` }} />
                    )}
                  </div>
                  <span className="hq__leader-count">
                    {driverLive ? <><span style={{ color: '#27AE60', fontSize: 11 }}>{driverLive.done}</span>/{d.weekTotal}</> : d.weekTotal}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* ─── THIS WEEK'S DISPATCHES ─── */}
        <div className="hq__card hq__card--wide">
          <h3 className="hq__card-title">This Week's Dispatches</h3>
          {recentLogs.length === 0 ? (
            <p style={{ color: '#9BA5B4', fontSize: 14 }}>No dispatches this week yet</p>
          ) : (() => {
            const today = new Date().toISOString().split('T')[0]
            const maxOrders = Math.max(...recentLogs.map(l => l.orders_processed || 0), 1)

            const cols = [
              { key: 'delivery_day', label: 'Day', get: l => l.delivery_day, show: true },
              { key: 'date', label: 'Date', get: l => l.date, show: true },
              { key: 'orders_processed', label: 'Orders', get: l => l.orders_processed || 0, show: true },
              { key: 'shsp_orders', label: 'SHSP', get: l => l.shsp_orders || 0, show: true },
              { key: 'aultman_orders', label: 'Aultman', get: l => l.aultman_orders || 0, show: true },
              { key: 'cold_chain', label: 'CC', get: l => l.cold_chain || 0, show: hasCC },
              { key: 'unassigned_count', label: 'Unassigned', get: l => l.unassigned_count || 0, show: hasUnassigned },
              { key: 'top_driver', label: 'Top Driver', get: l => l.top_driver || '', show: true },
              { key: 'status', label: 'Status', get: l => l.status || '', show: true },
            ].filter(c => c.show)

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
                          {hasCC && <td className="hq__cell-num" style={{ color: log.cold_chain > 0 ? '#3b82f6' : undefined }}>{log.cold_chain}</td>}
                          {hasUnassigned && <td className={parseInt(log.unassigned_count) > 0 ? 'hq__cell-warn' : 'hq__cell-num'}>{log.unassigned_count}</td>}
                          <td><strong>{log.top_driver}</strong></td>
                          <td><span className={`hq__status-badge ${log.status === 'Complete' ? 'hq__status-badge--ok' : ''}`}>{log.status}</span></td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${i}-detail`} className="hq__detail-row">
                            <td colSpan={cols.length}>
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
