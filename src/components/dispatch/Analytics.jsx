import { useState, useEffect, useRef, useMemo } from 'react'
import DeliveryMap from './DeliveryMap'
import Heatmap from './Heatmap'
import './Analytics.css'

function fmtDate(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[+m - 1]} ${+d}`
}

function aggregateWeekly(data) {
  if (!data || data.length <= 60) return data
  const weeks = []
  for (let i = 0; i < data.length; i += 5) {
    const chunk = data.slice(i, i + 5)
    weeks.push({
      date: chunk[0]?.date,
      day: `Wk`,
      orders: chunk.reduce((s, d) => s + (d.orders || 0), 0),
      shsp: chunk.reduce((s, d) => s + (d.shsp || 0), 0),
      aultman: chunk.reduce((s, d) => s + (d.aultman || 0), 0),
      coldChain: chunk.reduce((s, d) => s + (d.coldChain || 0), 0),
      unassigned: chunk.reduce((s, d) => s + (d.unassigned || 0), 0),
    })
  }
  return weeks
}

export default function Analytics() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('month')
  const [tab, setTab] = useState('overview')

  useEffect(() => { loadData() }, [period])

  async function loadData() {
    setLoading(true)
    try {
      const resp = await fetch(`/api/analytics?period=${period}`)
      if (!resp.ok) throw new Error('API error')
      const json = await resp.json()
      setData(json)
    } catch (err) {
      console.error('Analytics error:', err)
      setData(null)
    }
    finally { setLoading(false) }
  }

  if (loading) return <div className="an__loading"><div className="dispatch__spinner" />Loading analytics...</div>
  if (!data) return <div className="an__loading">Failed to load analytics</div>

  const { kpis, volumeTrend, dayAvg, driverLeaderboard, topDriverOverall, topZips, patientData, topLocations, pharmaSplit } = data
  const chartData = useMemo(() => period === 'all' ? aggregateWeekly(volumeTrend) : volumeTrend, [volumeTrend, period])
  const maxVol = Math.max(...(chartData?.map(d => d.orders) || [1]))
  const maxLeader = driverLeaderboard?.[0]?.weekTotal || 1
  const maxDayAvg = Math.max(...(dayAvg?.map(d => d.avg) || [1]))

  return (
    <div className="an">
      {/* Header */}
      <div className="an__header">
        <h2 className="an__title">Analytics</h2>
        <div className="an__period">
          {[['week', 'This Week'], ['month', 'This Month'], ['all', 'All Time']].map(([val, label]) => (
            <button
              key={val}
              className={`an__period-btn ${period === val ? 'an__period-btn--active' : ''}`}
              onClick={() => setPeriod(val)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="an__subtabs">
        {[
          ['overview', 'Overview'],
          ['trends', 'Trends'],
          ['drivers', 'Drivers'],
          ['geography', 'Geography'],
          ['pharmacy', 'Pharmacy'],
          ['map', 'Map'],
        ].map(([key, label]) => (
          <button
            key={key}
            className={`an__subtab ${tab === key ? 'an__subtab--active' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ─── OVERVIEW ─── */}
      {tab === 'overview' && (
        <>
          <div className="an__kpis">
            <KPI label="Total Orders" value={kpis.totalOrders.toLocaleString()} />
            <KPI label="Avg / Night" value={kpis.avgPerNight} />
            <KPI label="Cold Chain" value={kpis.totalColdChain.toLocaleString()} sub={`${kpis.coldChainPct}% of orders`} accent />
            <KPI label="SHSP" value={kpis.shspTotal.toLocaleString()} sub={`${kpis.shspPct}%`} />
            <KPI label="Aultman" value={kpis.aultmanTotal.toLocaleString()} sub={`${100 - kpis.shspPct}%`} />
            <KPI label="Unassigned" value={kpis.totalUnassigned} sub="total" warn={kpis.totalUnassigned > 0} />
          </div>

          <div className="an__grid">
            <div className="an__card an__card--full">
              <h3 className="an__card-title">Delivery Volume <span className="an__scroll-hint">scroll for more &rarr;</span></h3>
              <ScrollChart data={chartData} maxVol={maxVol} />
              <div className="an__legend">
                <span><span className="an__dot an__dot--shsp" />SHSP</span>
                <span><span className="an__dot an__dot--aultman" />Aultman</span>
              </div>
            </div>

            <div className="an__card">
              <h3 className="an__card-title">Busiest Days</h3>
              <div className="an__day-chart">
                {dayAvg?.map((d) => (
                  <div className="an__day-row" key={d.day}>
                    <span className="an__day-name">{d.day.slice(0, 3)}</span>
                    <div className="an__day-bar-wrap">
                      <div className="an__day-bar" style={{ width: `${(d.avg / maxDayAvg) * 100}%` }} />
                    </div>
                    <span className="an__day-val">{d.avg}</span>
                  </div>
                ))}
              </div>
              <p className="an__card-sub">Average orders per night</p>
            </div>

            <div className="an__card">
              <h3 className="an__card-title">Pharmacy Split</h3>
              <div className="an__split">
                <div className="an__split-bar">
                  <div className="an__split-shsp" style={{ width: `${kpis.shspPct}%` }}>
                    SHSP {kpis.shspPct}%
                  </div>
                  <div className="an__split-aultman" style={{ width: `${100 - kpis.shspPct}%` }}>
                    Aultman {100 - kpis.shspPct}%
                  </div>
                </div>
                <div className="an__split-nums">
                  <span>{kpis.shspTotal.toLocaleString()} orders</span>
                  <span>{kpis.aultmanTotal.toLocaleString()} orders</span>
                </div>
              </div>
            </div>
          </div>

          <Heatmap volumeTrend={volumeTrend} />
        </>
      )}

      {/* ─── TRENDS ─── */}
      {tab === 'trends' && (
        <div className="an__grid">
          <div className="an__card an__card--full">
            <h3 className="an__card-title">Volume Over Time <span className="an__scroll-hint">scroll for more &rarr;</span></h3>
            <ScrollChart data={chartData} maxVol={maxVol} tall />
          </div>

          <div className="an__card an__card--full">
            <h3 className="an__card-title">Cold Chain Volume <span className="an__scroll-hint">scroll &rarr;</span></h3>
            <ScrollChartSingle data={chartData} field="coldChain" barClass="an__vol-bar--cc" />
          </div>

          <div className="an__card an__card--full">
            <h3 className="an__card-title">Unassigned Orders <span className="an__scroll-hint">scroll &rarr;</span></h3>
            <ScrollChartSingle data={chartData} field="unassigned" barClass="an__vol-bar--warn" />
          </div>

          <div className="an__card--full">
            <Heatmap volumeTrend={volumeTrend} />
          </div>

          <div className="an__card">
            <h3 className="an__card-title">Volume by Day of Week</h3>
            <div className="an__day-chart">
              {dayAvg?.map((d) => (
                <div className="an__day-row" key={d.day}>
                  <span className="an__day-name">{d.day.slice(0, 3)}</span>
                  <div className="an__day-bar-wrap">
                    <div className="an__day-bar" style={{ width: `${(d.avg / maxDayAvg) * 100}%` }} />
                  </div>
                  <span className="an__day-val">{d.avg} avg</span>
                </div>
              ))}
            </div>
            <div className="an__day-totals">
              {dayAvg?.map((d) => (
                <div key={d.day} className="an__day-total-row">
                  <span>{d.day}</span>
                  <span>{d.total.toLocaleString()} total</span>
                </div>
              ))}
            </div>
          </div>

          <div className="an__card">
            <h3 className="an__card-title">Pharmacy Trend</h3>
            {pharmaSplit?.length > 1 && (
              <div className="an__pharma-trend an__pharma-trend--tall">
                {pharmaSplit.map((w, i) => {
                  const total = w.shsp + w.aultman || 1
                  return (
                    <div className="an__pharma-week" key={i} title={`SHSP: ${w.shsp} | Aultman: ${w.aultman}`}>
                      <div className="an__pharma-bar an__pharma-bar--tall">
                        <div className="an__pharma-s" style={{ height: `${(w.shsp / total) * 100}%` }} />
                        <div className="an__pharma-a" style={{ height: `${(w.aultman / total) * 100}%` }} />
                      </div>
                      <span className="an__pharma-label">{fmtDate(w.label)}</span>
                    </div>
                  )
                })}
              </div>
            )}
            <div className="an__legend" style={{ marginTop: 12 }}>
              <span><span className="an__dot an__dot--shsp" />SHSP</span>
              <span><span className="an__dot an__dot--aultman" />Aultman</span>
            </div>
          </div>
        </div>
      )}

      {/* ─── DRIVERS ─── */}
      {tab === 'drivers' && (
        <div className="an__grid">
          <div className="an__card an__card--full">
            <h3 className="an__card-title">Driver Leaderboard — Weekly Stops</h3>
            <div className="an__leaders">
              {driverLeaderboard?.map((d, i) => (
                <div className="an__leader an__leader--full" key={d.name}>
                  <span className="an__leader-rank">{i + 1}</span>
                  <span className="an__leader-name">{d.name}</span>
                  <div className="an__leader-days">
                    <span className="an__leader-day" title="Mon">{d.mon || '·'}</span>
                    <span className="an__leader-day" title="Tue">{d.tue || '·'}</span>
                    <span className="an__leader-day" title="Wed">{d.wed || '·'}</span>
                    <span className="an__leader-day" title="Thu">{d.thu || '·'}</span>
                    <span className="an__leader-day" title="Fri">{d.fri || '·'}</span>
                  </div>
                  <div className="an__leader-bar-wrap">
                    <div className="an__leader-bar" style={{ width: `${(d.weekTotal / maxLeader) * 100}%` }} />
                  </div>
                  <span className="an__leader-val">{d.weekTotal}</span>
                </div>
              ))}
            </div>
          </div>

          {topDriverOverall?.length > 0 && (
            <div className="an__card">
              <h3 className="an__card-title">Most Times Top Driver</h3>
              <div className="an__top-drivers">
                {topDriverOverall.map((d, i) => (
                  <div className="an__top-driver" key={d.name}>
                    <span className="an__td-rank">{i === 0 ? '👑' : i + 1}</span>
                    <span className="an__td-name">{d.name}</span>
                    <span className="an__td-count">{d.timesTop}x</span>
                  </div>
                ))}
              </div>
              <p className="an__card-sub">Times as highest-stop driver of the night</p>
            </div>
          )}

          <div className="an__card">
            <h3 className="an__card-title">Driver Distribution</h3>
            <div className="an__split">
              <div className="an__split-bar" style={{ height: 24 }}>
                {driverLeaderboard?.filter(d => d.weekTotal > 0).map((d) => {
                  const totalStops = driverLeaderboard.reduce((s, x) => s + x.weekTotal, 0) || 1
                  return (
                    <div
                      key={d.name}
                      className="an__dist-seg"
                      style={{ width: `${(d.weekTotal / totalStops) * 100}%` }}
                      title={`${d.name}: ${d.weekTotal} (${Math.round((d.weekTotal / totalStops) * 100)}%)`}
                    />
                  )
                })}
              </div>
            </div>
            <p className="an__card-sub">Share of total stops by driver this week</p>
          </div>
        </div>
      )}

      {/* ─── GEOGRAPHY ─── */}
      {tab === 'geography' && (
        <div className="an__grid">
          <div className="an__card">
            <h3 className="an__card-title">Top ZIP Codes</h3>
            <div className="an__zips">
              {topZips?.slice(0, 20).map((z, i) => (
                <div className="an__zip" key={i}>
                  <span className="an__zip-rank">{i + 1}</span>
                  <span className="an__zip-code">{z.ZIP}</span>
                  <span className="an__zip-count">{z.Count}</span>
                </div>
              ))}
            </div>
          </div>

          {topLocations?.length > 0 && (
            <div className="an__card">
              <h3 className="an__card-title">Top Delivery Addresses</h3>
              <div className="an__loc-table-wrap">
                <table className="an__loc-table">
                  <thead>
                    <tr>
                      {Object.keys(topLocations[0] || {}).map((h, i) => (
                        <th key={i}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {topLocations.map((loc, i) => (
                      <tr key={i}>
                        {Object.values(loc).map((v, j) => (
                          <td key={j}>{v}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {patientData?.length > 0 && (
            <div className="an__card an__card--full">
              <h3 className="an__card-title">Patient Analytics</h3>
              <div className="an__loc-table-wrap">
                <table className="an__loc-table">
                  <thead>
                    <tr>
                      {Object.keys(patientData[0] || {}).map((h, i) => (
                        <th key={i}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {patientData.map((row, i) => (
                      <tr key={i}>
                        {Object.values(row).map((v, j) => (
                          <td key={j}>{v}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── PHARMACY ─── */}
      {tab === 'pharmacy' && (
        <div className="an__grid">
          <div className="an__card an__card--full">
            <h3 className="an__card-title">Pharmacy Volume Split</h3>
            <div className="an__split" style={{ marginBottom: 24 }}>
              <div className="an__split-bar" style={{ height: 48, fontSize: 14 }}>
                <div className="an__split-shsp" style={{ width: `${kpis.shspPct}%` }}>
                  SHSP — {kpis.shspTotal.toLocaleString()} ({kpis.shspPct}%)
                </div>
                <div className="an__split-aultman" style={{ width: `${100 - kpis.shspPct}%` }}>
                  Aultman — {kpis.aultmanTotal.toLocaleString()} ({100 - kpis.shspPct}%)
                </div>
              </div>
            </div>
          </div>

          <div className="an__card an__card--full">
            <h3 className="an__card-title">Weekly Pharmacy Trend</h3>
            {pharmaSplit?.length > 0 && (
              <div className="an__pharma-trend an__pharma-trend--tall">
                {pharmaSplit.map((w, i) => {
                  const maxPharm = Math.max(...pharmaSplit.map(x => x.shsp + x.aultman), 1)
                  const total = w.shsp + w.aultman
                  return (
                    <div className="an__pharma-week" key={i} title={`SHSP: ${w.shsp} | Aultman: ${w.aultman}`}>
                      <span className="an__pharma-total">{total}</span>
                      <div className="an__pharma-bar an__pharma-bar--tall" style={{ height: `${(total / maxPharm) * 100}%` }}>
                        <div className="an__pharma-s" style={{ height: total ? `${(w.shsp / total) * 100}%` : '0%' }} />
                        <div className="an__pharma-a" style={{ height: total ? `${(w.aultman / total) * 100}%` : '0%' }} />
                      </div>
                      <span className="an__pharma-label">{fmtDate(w.label)}</span>
                    </div>
                  )
                })}
              </div>
            )}
            <div className="an__legend" style={{ marginTop: 16 }}>
              <span><span className="an__dot an__dot--shsp" />SHSP</span>
              <span><span className="an__dot an__dot--aultman" />Aultman</span>
            </div>
          </div>

          <div className="an__card">
            <h3 className="an__card-title">Cold Chain Breakdown</h3>
            <div className="an__kpi" style={{ border: 'none', padding: 0 }}>
              <span className="an__kpi-label">Total Cold Chain</span>
              <span className="an__kpi-value an__kpi-value--accent">{kpis.totalColdChain.toLocaleString()}</span>
              <span className="an__kpi-sub">{kpis.coldChainPct}% of all orders</span>
            </div>
          </div>

          <div className="an__card">
            <h3 className="an__card-title">Order Totals</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="an__kpi" style={{ border: 'none', padding: 0 }}>
                <span className="an__kpi-label">Corrections</span>
                <span className="an__kpi-value">{kpis.totalCorrections}</span>
                <span className="an__kpi-sub">emails sent</span>
              </div>
              <div className="an__kpi" style={{ border: 'none', padding: 0 }}>
                <span className="an__kpi-label">Dispatches</span>
                <span className="an__kpi-value">{data.dispatches}</span>
                <span className="an__kpi-sub">in selected period</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── MAP ─── */}
      {tab === 'map' && <DeliveryMap />}
    </div>
  )
}

function KPI({ label, value, sub, accent, warn }) {
  return (
    <div className={`an__kpi ${warn ? 'an__kpi--warn' : ''}`}>
      <span className="an__kpi-label">{label}</span>
      <span className={`an__kpi-value ${accent ? 'an__kpi-value--accent' : ''} ${warn ? 'an__kpi-value--warn' : ''}`}>{value}</span>
      {sub && <span className="an__kpi-sub">{sub}</span>}
    </div>
  )
}

function ScrollChart({ data, maxVol, tall }) {
  const ref = useRef(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollLeft = ref.current.scrollWidth
    }
  }, [data])

  return (
    <>
      <div className="an__vol-scroll" ref={ref}>
        <div className={`an__vol-chart ${tall ? 'an__vol-chart--tall' : ''}`}>
          {data?.map((d, i) => (
            <div className="an__vol-col" key={i} title={`${d.day} ${fmtDate(d.date)}: ${d.orders} orders (SHSP: ${d.shsp}, Aultman: ${d.aultman})`}>
              <div className="an__vol-bar-wrap">
                <div className="an__vol-bar" style={{ height: `${(d.orders / maxVol) * 100}%` }}>
                  <div className="an__vol-aultman" style={{ height: `${d.orders ? (d.aultman / d.orders) * 100 : 0}%` }} />
                </div>
              </div>
              <span className="an__vol-val">{d.orders}</span>
              <span className="an__vol-label">{d.day?.slice(0, 3)}</span>
              <span className="an__vol-date">{fmtDate(d.date)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="an__legend">
        <span><span className="an__dot an__dot--shsp" />SHSP</span>
        <span><span className="an__dot an__dot--aultman" />Aultman</span>
      </div>
    </>
  )
}

function ScrollChartSingle({ data, field, barClass }) {
  const ref = useRef(null)
  const maxVal = Math.max(...(data?.map(d => d[field] || 0) || [1]))

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollLeft = ref.current.scrollWidth
    }
  }, [data])

  return (
    <div className="an__vol-scroll" ref={ref}>
      <div className="an__vol-chart">
        {data?.map((d, i) => (
          <div className="an__vol-col" key={i} title={`${d.day} ${fmtDate(d.date)}: ${d[field]}`}>
            <div className="an__vol-bar-wrap">
              <div className={`an__vol-bar ${barClass}`} style={{ height: `${d[field] ? (d[field] / maxVal) * 100 : 0}%` }} />
            </div>
            <span className="an__vol-val">{d[field]}</span>
            <span className="an__vol-label">{d.day?.slice(0, 3)}</span>
            <span className="an__vol-date">{fmtDate(d.date)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
