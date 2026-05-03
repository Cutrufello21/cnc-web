import { useState, useEffect, useRef } from 'react'
import { BarChart, TrendChart, LineChart, fmtDate } from './AnalyticsCharts'
import AnalyticsInsights from './AnalyticsInsights'
import './Analytics.css'

export default function Analytics() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('month')
  const [tab, setTab] = useState('overview')
  const [monthSort, setMonthSort] = useState('date')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/analytics?period=${period}`)
      .then(r => r.ok ? r.json() : null)
      .then(json => setData(json))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [period])

  if (loading) return <div className="an__loading"><div className="dispatch__spinner" />Loading analytics...</div>
  if (!data) return <div className="an__loading">Failed to load analytics</div>

  const k = data.kpis || {}
  const vt = data.volumeTrend || []
  const da = data.dayAvg || []
  const dl = data.driverLeaderboard || []
  const tdo = data.topDriverOverall || []
  const tz = data.topZips || []
  const pd = data.patientData || []
  const tl = data.topLocations || []

  const chartData = (period === 'all' && vt.length > 60
    ? Array.from({ length: Math.ceil(vt.length / 5) }, (_, i) => {
        const chunk = vt.slice(i * 5, i * 5 + 5)
        return { date: chunk[0]?.date, day: 'Wk', orders: chunk.reduce((s, d) => s + (d.orders || 0), 0), shsp: chunk.reduce((s, d) => s + (d.shsp || 0), 0), aultman: chunk.reduce((s, d) => s + (d.aultman || 0), 0) }
      })
    : vt
  ).slice().reverse()

  const maxVol = Math.max(...chartData.map(d => d.orders || 0), 1)
  const maxDay = Math.max(...da.map(d => d.avg || 0), 1)
  const maxLeader = dl[0]?.weekTotal || 1

  return (
    <div className="an">
      <div className="an__header">
        <h2 className="an__title">Analytics</h2>
        <div className="an__period">
          {[['week', 'This Week'], ['month', 'This Month'], ['all', 'All Time']].map(([v, l]) => (
            <button key={v} className={`an__period-btn ${period === v ? 'an__period-btn--active' : ''}`} onClick={() => setPeriod(v)}>{l}</button>
          ))}
        </div>
      </div>

      <div className="an__subtabs">
        {[['overview','Overview'],['trends','Trends'],['drivers','Drivers'],['geography','Geography'],['pharmacy','Pharmacy'],['insights','Insights']].map(([key, label]) => (
          <button key={key} className={`an__subtab ${tab === key ? 'an__subtab--active' : ''}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {tab === 'overview' && <>
        <div className="an__kpis">
          <div className="an__kpi"><span className="an__kpi-label">Total Orders</span><span className="an__kpi-value">{(k.totalOrders || 0).toLocaleString()}</span><span className="an__kpi-sub an__kpi-sub--cc">{(k.totalColdChain || 0).toLocaleString()} cold chain</span></div>
          <div className="an__kpi"><span className="an__kpi-label">Avg / Night</span><span className="an__kpi-value">{k.avgPerNight || 0}</span></div>
          <div className="an__kpi"><span className="an__kpi-label">SHSP</span><span className="an__kpi-value">{(k.shspTotal || 0).toLocaleString()}<span className="an__kpi-cc">/{Math.round((k.shspTotal || 0) * (k.coldChainPct || 0) / 100).toLocaleString()}</span></span><span className="an__kpi-sub">{k.shspPct || 0}%</span></div>
          <div className="an__kpi"><span className="an__kpi-label">Aultman</span><span className="an__kpi-value">{(k.aultmanTotal || 0).toLocaleString()}<span className="an__kpi-cc">/{Math.round((k.aultmanTotal || 0) * (k.coldChainPct || 0) / 100).toLocaleString()}</span></span><span className="an__kpi-sub">{100 - (k.shspPct || 0)}%</span></div>
        </div>
        <div className="an__card an__card--full"><h3 className="an__card-title">Delivery Volume</h3><BarChart data={chartData} maxVol={maxVol} target={400} /></div>
        <div className="an__grid">
          <div className="an__card"><h3 className="an__card-title">Busiest Days</h3>{da.map(d => (<div className="an__day-row" key={d.day}><span className="an__day-name">{d.day?.slice(0, 3)}</span><div className="an__day-bar-wrap"><div className="an__day-bar" style={{ width: `${(d.avg / maxDay) * 100}%` }} /></div><span className="an__day-val">{d.avg}</span></div>))}</div>
          <div className="an__card"><h3 className="an__card-title">Pharmacy Split</h3><div className="an__split-bar"><div className="an__split-shsp" style={{ width: `${k.shspPct || 50}%` }}>SHSP {k.shspPct}%</div><div className="an__split-aultman" style={{ width: `${100 - (k.shspPct || 50)}%` }}>Aultman {100 - (k.shspPct || 0)}%</div></div></div>
        </div>
      </>}

      {tab === 'trends' && (
        <div className="an__grid">
          <div className="an__card an__card--full"><h3 className="an__card-title">Volume + 7-Day Moving Average</h3><TrendChart data={(data.volumeTrend || []).slice().reverse()} movingAvg={(data.movingAvg || []).slice().reverse()} target={400} /></div>
          <div className="an__card an__card--full">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 className="an__card-title" style={{ margin: 0 }}>Month-over-Month</h3>
              <div style={{ display: 'flex', gap: 4 }}>
                {[['date','Date'],['volume','Volume'],['growth','MoM'],['yoy','YoY'],['avg','Avg/Day']].map(([key, label]) => (
                  <button key={key} onClick={() => setMonthSort(key)} style={{ padding: '3px 10px', fontSize: 11, fontWeight: monthSort === key ? 700 : 500, border: '1px solid #F0F2F7', borderRadius: 4, background: monthSort === key ? '#0B1E3D' : 'transparent', color: monthSort === key ? '#fff' : '#9BA5B4', cursor: 'pointer' }}>{label}</button>
                ))}
              </div>
            </div>
            {(() => {
              const sorted = [...(data.monthlyTrend || [])].sort((a, b) => {
                if (monthSort === 'volume') return b.orders - a.orders
                if (monthSort === 'growth') return (b.growth || 0) - (a.growth || 0)
                if (monthSort === 'yoy') return (b.yoy || -999) - (a.yoy || -999)
                if (monthSort === 'avg') return b.avgPerDay - a.avgPerDay
                return b.month.localeCompare(a.month)
              })
              const maxOrders = Math.max(...sorted.map(m => m.orders || 0), 1)
              return (
                <table className="an__mom-table">
                  <thead><tr><th>Month</th><th style={{ textAlign: 'right' }}>Stops</th><th style={{ textAlign: 'right' }}>Avg/Day</th><th style={{ textAlign: 'right' }}>MoM</th><th style={{ textAlign: 'right' }}>YoY</th><th style={{ width: '35%' }}>Volume</th></tr></thead>
                  <tbody>
                    {sorted.map(m => {
                      const [y, mo] = m.month.split('-')
                      const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
                      const pct = maxOrders ? (m.orders / maxOrders) * 100 : 0
                      return (
                        <tr key={m.month}>
                          <td className="an__mom-month">{names[+mo - 1]} {y}</td>
                          <td className="an__mom-num">{m.orders.toLocaleString()}</td>
                          <td className="an__mom-num an__mom-avg">{m.avgPerDay}</td>
                          <td className="an__mom-num">{m.growth !== null && <span className={m.growth >= 0 ? 'an__mom-up' : 'an__mom-down'}>{m.growth >= 0 ? '+' : ''}{m.growth}%</span>}</td>
                          <td className="an__mom-num">{m.yoy !== null && m.yoy !== undefined ? <span className={m.yoy >= 0 ? 'an__mom-up' : 'an__mom-down'}>{m.yoy >= 0 ? '+' : ''}{m.yoy}%</span> : <span className="an__mom-avg">—</span>}</td>
                          <td><div className="an__mom-bar-wrap"><div className="an__mom-bar" style={{ width: `${pct}%` }} /></div></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )
            })()}
          </div>
          <div className="an__card an__card--full"><h3 className="an__card-title">Cold Chain % Over Time</h3><LineChart data={(data.ccTrend || []).slice().reverse().map(d => ({ date: d.date, value: d.pct, label: d.pct + '%' }))} color="#6495ed" /></div>
          <div className="an__card an__card--full"><h3 className="an__card-title">SHSP vs Aultman Share Over Time</h3><LineChart data={(data.pharmaTrend || []).slice().reverse().map(d => ({ date: d.date, value: d.shspPct, label: 'SHSP ' + d.shspPct + '%' }))} color="#3b82f6" /><div className="an__legend" style={{ marginTop: 8 }}><span><span className="an__dot an__dot--shsp" />SHSP %</span><span><span className="an__dot an__dot--aultman" />Aultman = remainder</span></div></div>
        </div>
      )}

      {tab === 'drivers' && (
        <div className="an__grid">
          <div className="an__card an__card--full"><h3 className="an__card-title">Driver Leaderboard — Weekly Stops</h3>{dl.map((d, i) => (<div className="an__leader" key={d.name}><span className="an__leader-rank">{i + 1}</span><span className="an__leader-name">{d.name}</span><div className="an__leader-bar-wrap"><div className="an__leader-bar" style={{ width: `${(d.weekTotal / maxLeader) * 100}%` }} /></div><span className="an__leader-val">{d.weekTotal}</span></div>))}</div>
          {tdo.length > 0 && <div className="an__card"><h3 className="an__card-title">Most Times Top Driver</h3>{tdo.map((d, i) => (<div className="an__top-driver" key={d.name}><span>{i + 1}</span><span className="an__td-name">{d.name}</span><span>{d.timesTop}x</span></div>))}</div>}
          {(data.driverMonthlyData || []).length > 0 && <div className="an__card an__card--full"><h3 className="an__card-title">Stops Per Driver — Last 6 Months</h3><div style={{ overflowX: 'auto' }}><table className="an__driver-table"><thead><tr><th>Driver</th>{data.driverMonthlyData[0].months.map(m => { const [y, mo] = m.month.split('-'); return <th key={m.month}>{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+mo - 1]} {y.slice(2)}</th> })}<th>Total</th></tr></thead><tbody>{data.driverMonthlyData.map(d => (<tr key={d.name}><td style={{ fontWeight: 600 }}>{d.name}</td>{d.months.map(m => <td key={m.month} style={{ color: m.stops === 0 ? 'var(--gray-300)' : 'var(--gray-700)' }}>{m.stops.toLocaleString()}</td>)}<td style={{ fontWeight: 700 }}>{d.total.toLocaleString()}</td></tr>))}</tbody></table></div></div>}
          {(data.driverConsistency || []).length > 0 && <div className="an__card an__card--full"><h3 className="an__card-title">Driver Consistency Score</h3><p className="an__card-sub">Lower variance = more consistent daily loads. Score 0-100.</p>{data.driverConsistency.map(d => (<div className="an__leader" key={d.name}><span className="an__leader-name" style={{ minWidth: 80 }}>{d.name}</span><div className="an__leader-bar-wrap"><div className="an__leader-bar" style={{ width: `${d.consistency}%`, background: d.consistency >= 80 ? '#22c55e' : d.consistency >= 60 ? '#f59e0b' : '#ef4444' }} /></div><span className="an__leader-val" style={{ minWidth: 40 }}>{d.consistency}</span><span style={{ fontSize: 11, color: 'var(--gray-400)', minWidth: 90 }}>avg {d.avg}/day</span></div>))}</div>}
          {(data.driverTopZips || []).length > 0 && <div className="an__card an__card--full"><h3 className="an__card-title">Top ZIP Codes Per Driver</h3><div className="an__driver-zips-grid">{data.driverTopZips.map(d => (<div key={d.name} className="an__driver-zip-card"><h4>{d.name}</h4>{d.zips.map(z => (<div key={z.zip} className="an__zip"><span className="an__zip-code">{z.zip}</span>{z.city && <span className="an__zip-city">{z.city}</span>}<span className="an__zip-count">{z.count.toLocaleString()}</span></div>))}</div>))}</div></div>}
        </div>
      )}

      {tab === 'geography' && (
        <div className="an__grid">
          <div className="an__card"><h3 className="an__card-title">Top ZIP Codes</h3>{tz.map((z, i) => (<div className="an__zip" key={i}><span className="an__zip-rank">{i + 1}</span><span className="an__zip-code">{z.ZIP}</span><span className="an__zip-count">{z.Count}</span></div>))}</div>
          {tl.length > 0 && <div className="an__card"><h3 className="an__card-title">Top Addresses</h3><table className="an__loc-table"><thead><tr>{Object.keys(tl[0]).map((h, i) => <th key={i}>{h}</th>)}</tr></thead><tbody>{tl.map((r, i) => <tr key={i}>{Object.values(r).map((v, j) => <td key={j}>{typeof v === 'number' ? v.toLocaleString() : v}</td>)}</tr>)}</tbody></table></div>}
          {pd.length > 0 && <div className="an__card an__card--full"><h3 className="an__card-title">Top Patients</h3><table className="an__loc-table"><thead><tr>{Object.keys(pd[0]).map((h, i) => <th key={i}>{h}</th>)}</tr></thead><tbody>{pd.map((r, i) => <tr key={i}>{Object.values(r).map((v, j) => <td key={j}>{typeof v === 'number' ? v.toLocaleString() : v}</td>)}</tr>)}</tbody></table></div>}
        </div>
      )}

      {tab === 'pharmacy' && (
        <div className="an__grid">
          <div className="an__card an__card--full"><h3 className="an__card-title">Pharmacy Volume</h3><div className="an__split-bar" style={{ height: 48, fontSize: 14 }}><div className="an__split-shsp" style={{ width: `${k.shspPct}%` }}>SHSP — {(k.shspTotal || 0).toLocaleString()} ({k.shspPct}%)</div><div className="an__split-aultman" style={{ width: `${100 - (k.shspPct || 0)}%` }}>Aultman — {(k.aultmanTotal || 0).toLocaleString()} ({100 - (k.shspPct || 0)}%)</div></div></div>
          <div className="an__card"><h3 className="an__card-title">Dispatches</h3><span className="an__kpi-value" style={{ fontSize: 32 }}>{data.dispatches || 0}</span><span className="an__kpi-sub">in selected period</span></div>
        </div>
      )}

      {tab === 'insights' && <AnalyticsInsights data={data} k={k} />}
    </div>
  )
}
