import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { getDeliveryDate } from '../../lib/getDeliveryDate'
import KPICard from './KPICard'
import HQDriverProgress from './HQDriverProgress'
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
  const [expandedKPI, setExpandedKPI] = useState(null)
  const liveInterval = useRef(null)

  const channelRef = useRef(null)

  useEffect(() => {
    loadData()

    // Subscribe to realtime daily_stops changes for today
    const today = getDeliveryDate()
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
    const today = getDeliveryDate()
    const [{ data: stops }, { data: routes }] = await Promise.all([
      supabase.from('daily_stops').select('status, driver_name, pharmacy, delivered_at').eq('delivery_date', today),
      supabase.from('driver_routes').select('driver_name, route_miles').eq('date', today),
    ])
    if (!stops || stops.length === 0) { setLiveProgress(null); return }
    const total = stops.length
    const delivered = stops.filter(s => s.status === 'delivered').length
    const failed = stops.filter(s => s.status === 'failed').length
    const routeMilesMap = {}
    ;(routes || []).forEach(r => { if (r.route_miles) routeMilesMap[r.driver_name] = r.route_miles })
    const driverMap = {}
    stops.forEach(s => {
      if (!driverMap[s.driver_name]) driverMap[s.driver_name] = { total: 0, done: 0, shsp: 0, aultman: 0, lastDelivery: null, miles: 0 }
      driverMap[s.driver_name].total++
      if (s.status === 'delivered' || s.status === 'failed') {
        driverMap[s.driver_name].done++
        if (s.delivered_at && (!driverMap[s.driver_name].lastDelivery || s.delivered_at > driverMap[s.driver_name].lastDelivery)) {
          driverMap[s.driver_name].lastDelivery = s.delivered_at
        }
      }
      if (s.pharmacy === 'SHSP') driverMap[s.driver_name].shsp++
      else driverMap[s.driver_name].aultman++
      driverMap[s.driver_name].miles = routeMilesMap[s.driver_name] || 0
    })
    const activeDrivers = Object.keys(driverMap).length
    const avgPerDriver = activeDrivers ? Math.round(total / activeDrivers) : 0
    const totalMiles = Object.values(driverMap).reduce((s, d) => s + d.miles, 0)

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

    setLiveProgress({ total, delivered, failed, driverMap, activeDrivers, avgPerDriver, estFinish, totalMiles })
  }

  async function loadData() {
    try {
      const [logsRes, weeklyRes, driversRes, timeOffRes] = await Promise.all([
        supabase.from('dispatch_logs').select('*').order('date', { ascending: false }).limit(60),
        supabase.from('payroll').select('*').order('week_of', { ascending: false }).limit(25),
        supabase.from('drivers').select('*').eq('active', true),
        supabase.from('time_off_requests').select('driver_name, date_off, end_date, status')
          .in('status', ['approved', 'pending'])
          .gte('date_off', (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}` })()),
      ])

      const logData = (logsRes.data || []).reverse().filter(r => WEEKDAYS.has(r.delivery_day))
      const now = new Date()
      const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
      const dow = now.getDay()
      const monOffset = dow === 0 ? -6 : 1 - dow
      const monday = new Date(now)
      monday.setDate(now.getDate() + monOffset)
      const mondayStr = `${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,'0')}-${String(monday.getDate()).padStart(2,'0')}`

      const todayLog = logData.find(r => r.date === today)
      const lastLog = logData[logData.length - 1]
      const lastDispatchDate = lastLog?.date || ''
      const isToday = lastDispatchDate === today
      const isYesterday = (() => {
        const y = new Date(now)
        y.setDate(y.getDate() - 1)
        return lastDispatchDate === `${y.getFullYear()}-${String(y.getMonth()+1).padStart(2,'0')}-${String(y.getDate()).padStart(2,'0')}`
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
      const lastMondayStr = `${lastMonday.getFullYear()}-${String(lastMonday.getMonth()+1).padStart(2,'0')}-${String(lastMonday.getDate()).padStart(2,'0')}`
      const lastWeek = logData.filter(r => r.date >= lastMondayStr && r.date < mondayStr)
      const lastWeekSameDays = lastWeek.slice(0, thisWeek.length)
      const lastWeekSameDaysOrders = lastWeekSameDays.reduce((s, r) => s + (r.orders_processed || 0), 0)
      const wowChange = lastWeekSameDaysOrders ? Math.round(((thisWeekOrders - lastWeekSameDaysOrders) / lastWeekSameDaysOrders) * 100) : 0
      const wowDays = thisWeek.length

      // Day-by-day comparison for expandable card — only show days that have dispatched this week
      const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
      const fullDayNames = ['Monday','Tuesday','Wednesday','Thursday','Friday']
      const weekComparison = dayNames.map((day, i) => {
        const tw = thisWeek.find(r => r.delivery_day === fullDayNames[i])
        const lw = lastWeek.find(r => r.delivery_day === fullDayNames[i])
        const twOrders = tw?.orders_processed || 0
        const lwOrders = lw?.orders_processed || 0
        const change = lwOrders > 0 ? Math.round(((twOrders - lwOrders) / lwOrders) * 100) : null
        return { day, thisWeek: twOrders, lastWeek: lwOrders, change, hasData: !!tw }
      }).filter(d => d.hasData)

      // Local date formatter to avoid UTC shift
      const fmtLocal = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

      // Weekly averages for last 4 weeks (Avg/Night expand)
      const weeklyAvgs = []
      for (let w = 0; w < 4; w++) {
        const wStart = new Date(monday)
        wStart.setDate(wStart.getDate() - w * 7)
        const wEnd = new Date(wStart)
        wEnd.setDate(wEnd.getDate() + 4)
        const wStartStr = fmtLocal(wStart)
        const wEndStr = fmtLocal(wEnd)
        const wLogs = logData.filter(r => r.date >= wStartStr && r.date <= wEndStr)
        const wTotal = wLogs.reduce((s, r) => s + (r.orders_processed || 0), 0)
        const wAvg = wLogs.length > 0 ? Math.round(wTotal / wLogs.length) : 0
        const wLabel = `${MONTHS[wStart.getMonth()]} ${wStart.getDate()}`
        weeklyAvgs.push({ label: w === 0 ? 'This week' : w === 1 ? 'Last week' : wLabel, avg: wAvg, total: wTotal, days: wLogs.length })
      }

      // Drivers off today (Active Drivers expand)
      const allDriversList = (driversRes.data || []).filter(d => d.driver_name !== 'Demo Driver').sort((a, b) => a.driver_name.localeCompare(b.driver_name))
      const todayTimeOff = (timeOffRes.data || []).filter(r => r.date_off === today)
      const driversDetail = allDriversList.map(d => {
        const to = todayTimeOff.find(r => r.driver_name === d.driver_name)
        const isOnRoad = liveProgress?.driverMap?.[d.driver_name]
        return { name: d.driver_name, status: isOnRoad ? 'active' : to ? 'timeoff' : 'off', reason: to ? (to.status === 'pending' ? 'Requested' : 'Approved') : null }
      })

      // Weekly pharmacy split trend (Pharmacy Split expand)
      const pharmWeekly = []
      for (let w = 0; w < 4; w++) {
        const wStart = new Date(monday)
        wStart.setDate(wStart.getDate() - w * 7)
        const wEnd = new Date(wStart)
        wEnd.setDate(wEnd.getDate() + 4)
        const wStartStr = fmtLocal(wStart)
        const wEndStr = fmtLocal(wEnd)
        const wLogs = logData.filter(r => r.date >= wStartStr && r.date <= wEndStr)
        const wShsp = wLogs.reduce((s, r) => s + (r.shsp_orders || 0), 0)
        const wAult = wLogs.reduce((s, r) => s + (r.aultman_orders || 0), 0)
        const wTotal = wShsp + wAult
        pharmWeekly.push({ label: w === 0 ? 'This week' : w === 1 ? 'Last week' : `${MONTHS[wStart.getMonth()]} ${wStart.getDate()}`, shsp: wShsp, aultman: wAult, pct: wTotal > 0 ? Math.round((wShsp / wTotal) * 100) : 0 })
      }

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
      const sevenStr = fmtLocal(sevenDaysOut)
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
          thisWeekOrders, wowChange, wowDays, weekComparison,
          activeDrivers: activeThisWeek, totalDrivers: (driversRes.data || []).length,
          allTimeOrders, totalDispatches: logData.length,
          weeklyAvgs, driversDetail, pharmWeekly,
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

  return (
    <div className="hq">
      {/* --- TIME OFF BANNER --- */}
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
      {/* --- KPI CARDS (4 main) --- */}
      <div className="hq__kpis">
        <div className="hq__kpi hq__kpi--clickable" onClick={() => setExpandedKPI(expandedKPI === 'week' ? null : 'week')}>
          <div className="hq__kpi-row">
            <div className="hq__kpi-icon hq__kpi-icon--blue">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
            </div>
            <div className="hq__kpi-content">
              <span className="hq__kpi-label">This Week</span>
              <span className="hq__kpi-value">{kpis.thisWeekOrders.toLocaleString()}</span>
            </div>
          </div>
          <span className={`hq__kpi-sub ${kpis.wowChange >= 0 ? 'hq__kpi-sub--up' : 'hq__kpi-sub--down'}`}>{kpis.wowChange >= 0 ? '+' : ''}{kpis.wowChange}% vs same {kpis.wowDays} day{kpis.wowDays !== 1 ? 's' : ''} last week</span>
        </div>
        <div className="hq__kpi hq__kpi--clickable" onClick={() => setExpandedKPI(expandedKPI === 'avg' ? null : 'avg')}>
          <div className="hq__kpi-row">
            <div className="hq__kpi-icon hq__kpi-icon--purple">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>
            </div>
            <div className="hq__kpi-content">
              <span className="hq__kpi-label">Avg / Night</span>
              <span className="hq__kpi-value">{kpis.avgOrdersPerNight}</span>
            </div>
          </div>
          <span className="hq__kpi-sub">Last 30 dispatches</span>
        </div>
        <div className="hq__kpi hq__kpi--clickable" onClick={() => setExpandedKPI(expandedKPI === 'drivers' ? null : 'drivers')}>
          <div className="hq__kpi-row">
            <div className="hq__kpi-icon hq__kpi-icon--green">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <div className="hq__kpi-content">
              <span className="hq__kpi-label">Active Drivers</span>
              <span className="hq__kpi-value">{kpis.activeDrivers}/{kpis.totalDrivers}</span>
            </div>
          </div>
          <span className="hq__kpi-sub">{liveProgress ? `${liveProgress.activeDrivers} on road today` : 'Running this week'}</span>
        </div>
        <div className="hq__kpi hq__kpi--clickable" onClick={() => setExpandedKPI(expandedKPI === 'pharma' ? null : 'pharma')}>
          <div className="hq__kpi-row">
            <div className="hq__kpi-icon hq__kpi-icon--amber">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
            </div>
            <div className="hq__kpi-content">
              <span className="hq__kpi-label">Pharmacy Split</span>
              <span className="hq__kpi-value">{Math.round((kpis.shspTotal / (kpis.shspTotal + kpis.aultmanTotal || 1)) * 100)}%</span>
            </div>
          </div>
          <span className="hq__kpi-sub">SHSP {kpis.shspTotal.toLocaleString()} / Aultman {kpis.aultmanTotal.toLocaleString()}</span>
        </div>
      </div>

      {/* --- WEEK COMPARISON EXPAND --- */}
      {expandedKPI === 'week' && kpis.weekComparison?.length > 0 && (
        <div className="hq__week-compare">
          <table className="hq__week-compare-table">
            <thead>
              <tr>
                <th></th>
                <th>This Week</th>
                <th>Last Week</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {kpis.weekComparison.map(d => (
                <tr key={d.day}>
                  <td style={{ fontWeight: 700 }}>{d.day}</td>
                  <td style={{ fontWeight: 700 }}>{d.hasData ? d.thisWeek.toLocaleString() : '—'}</td>
                  <td style={{ color: '#9BA5B4' }}>{d.lastWeek > 0 ? d.lastWeek.toLocaleString() : '—'}</td>
                  <td>
                    {d.change !== null && d.hasData ? (
                      <span style={{ color: d.change >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600, fontSize: 11 }}>
                        {d.change >= 0 ? '+' : ''}{d.change}%
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              ))}
              {(() => {
                const matchedDays = kpis.weekComparison.filter(d => d.hasData)
                const twTotal = matchedDays.reduce((s, d) => s + d.thisWeek, 0)
                const lwTotal = matchedDays.reduce((s, d) => s + d.lastWeek, 0)
                const totalChange = lwTotal > 0 ? Math.round(((twTotal - lwTotal) / lwTotal) * 100) : null
                return <tr style={{ borderTop: '2px solid #e5e7eb' }}>
                  <td style={{ fontWeight: 700 }}>Total</td>
                  <td style={{ fontWeight: 800 }}>{twTotal.toLocaleString()}</td>
                  <td style={{ color: '#9BA5B4', fontWeight: 600 }}>{lwTotal.toLocaleString()}</td>
                  <td>
                    {totalChange !== null ? <span style={{ color: totalChange >= 0 ? '#16a34a' : '#dc2626', fontWeight: 700, fontSize: 11 }}>
                      {totalChange >= 0 ? '+' : ''}{totalChange}%
                    </span> : '—'}
                  </td>
                </tr>
              })()}
            </tbody>
          </table>
        </div>
      )}

      {/* --- AVG/NIGHT EXPAND --- */}
      {expandedKPI === 'avg' && kpis.weeklyAvgs?.length > 0 && (
        <div className="hq__week-compare">
          <table className="hq__week-compare-table">
            <thead><tr><th>Week</th><th>Avg/Night</th><th>Total</th><th>Days</th></tr></thead>
            <tbody>
              {kpis.weeklyAvgs.map((w, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{w.label}</td>
                  <td style={{ fontWeight: 700 }}>{w.avg}</td>
                  <td>{w.total.toLocaleString()}</td>
                  <td style={{ color: '#9BA5B4' }}>{w.days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* --- ACTIVE DRIVERS EXPAND --- */}
      {expandedKPI === 'drivers' && kpis.driversDetail?.length > 0 && (
        <div className="hq__week-compare">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {kpis.driversDetail.map(d => (
              <span key={d.name} style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                background: d.status === 'active' ? '#dcfce7' : d.status === 'timeoff' ? '#fef3c7' : '#f1f5f9',
                color: d.status === 'active' ? '#166534' : d.status === 'timeoff' ? '#92400e' : '#6b7280',
              }}>
                {d.name}{d.reason ? ` (${d.reason})` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* --- PHARMACY SPLIT EXPAND --- */}
      {expandedKPI === 'pharma' && kpis.pharmWeekly?.length > 0 && (
        <div className="hq__week-compare">
          <table className="hq__week-compare-table">
            <thead><tr><th>Week</th><th>SHSP</th><th>Aultman</th><th>Split</th></tr></thead>
            <tbody>
              {kpis.pharmWeekly.map((w, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{w.label}</td>
                  <td style={{ color: '#0A2463', fontWeight: 700 }}>{w.shsp.toLocaleString()}</td>
                  <td style={{ color: '#16a34a', fontWeight: 700 }}>{w.aultman.toLocaleString()}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 60, height: 8, borderRadius: 4, background: '#f1f5f9', overflow: 'hidden', position: 'relative' }}>
                        <div style={{ width: `${w.pct}%`, height: '100%', background: '#0A2463', borderRadius: 4 }} />
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 600, color: '#6b7280' }}>{w.pct}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* --- DRIVER PROGRESS: status, volume, leaderboard, dispatches --- */}
      <HQDriverProgress
        liveProgress={liveProgress}
        volumeChart={volumeChart}
        leaderboard={leaderboard}
        recentLogs={recentLogs}
        tableSort={tableSort}
        setTableSort={setTableSort}
        expandedRow={expandedRow}
        setExpandedRow={setExpandedRow}
        hoveredBar={hoveredBar}
        setHoveredBar={setHoveredBar}
      />
    </div>
  )
}
