import { useState, useEffect, useRef } from 'react'
import './Analytics.css'

function fmtDate(dateStr) {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length < 3) return dateStr
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[+parts[1] - 1]} ${+parts[2]}`
}

const OUTLIER_ZIPS = new Set([
  '43450','43986','43988','44230','44270','44273','44276','44281',
  '44314','44606','44608','44612','44613','44624','44626','44627',
  '44651','44675','44678','44681','44683','44691',
])

export default function Analytics() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('month')
  const [tab, setTab] = useState('overview')
  const [monthSort, setMonthSort] = useState('date')
  const [rates, setRates] = useState({ first: 11, additional: 9.40, outlier: 32.50 })
  const [payRates, setPayRates] = useState({})

  useEffect(() => {
    setLoading(true)
    fetch(`/api/analytics?period=${period}`)
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        setData(json)
        if (json?.driverRates && Object.keys(payRates).length === 0) {
          const init = {}
          json.driverRates.forEach(d => {
            init[d.name] = { mth: d.rateMth, wf: d.rateWf }
          })
          setPayRates(init)
        }
      })
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
  const ps = data.pharmaSplit || []

  // Aggregate weekly for All Time, reverse so newest is first (left)
  const chartData = (period === 'all' && vt.length > 60
    ? Array.from({ length: Math.ceil(vt.length / 5) }, (_, i) => {
        const chunk = vt.slice(i * 5, i * 5 + 5)
        return {
          date: chunk[0]?.date, day: 'Wk',
          orders: chunk.reduce((s, d) => s + (d.orders || 0), 0),
          shsp: chunk.reduce((s, d) => s + (d.shsp || 0), 0),
          aultman: chunk.reduce((s, d) => s + (d.aultman || 0), 0),
        }
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

      {tab === 'overview' && (
        <>
          <div className="an__kpis">
            <div className="an__kpi"><span className="an__kpi-label">Total Orders</span><span className="an__kpi-value">{(k.totalOrders || 0).toLocaleString()}</span><span className="an__kpi-sub an__kpi-sub--cc">{(k.totalColdChain || 0).toLocaleString()} cold chain</span></div>
            <div className="an__kpi"><span className="an__kpi-label">Avg / Night</span><span className="an__kpi-value">{k.avgPerNight || 0}</span></div>
            <div className="an__kpi"><span className="an__kpi-label">SHSP</span><span className="an__kpi-value">{(k.shspTotal || 0).toLocaleString()}<span className="an__kpi-cc">/{Math.round((k.shspTotal || 0) * (k.coldChainPct || 0) / 100).toLocaleString()}</span></span><span className="an__kpi-sub">{k.shspPct || 0}%</span></div>
            <div className="an__kpi"><span className="an__kpi-label">Aultman</span><span className="an__kpi-value">{(k.aultmanTotal || 0).toLocaleString()}<span className="an__kpi-cc">/{Math.round((k.aultmanTotal || 0) * (k.coldChainPct || 0) / 100).toLocaleString()}</span></span><span className="an__kpi-sub">{100 - (k.shspPct || 0)}%</span></div>
          </div>

          <div className="an__card an__card--full">
            <h3 className="an__card-title">Delivery Volume</h3>
            <BarChart data={chartData} maxVol={maxVol} target={400} />
          </div>

          <div className="an__grid">
            <div className="an__card">
              <h3 className="an__card-title">Busiest Days</h3>
              {da.map(d => (
                <div className="an__day-row" key={d.day}>
                  <span className="an__day-name">{d.day?.slice(0, 3)}</span>
                  <div className="an__day-bar-wrap"><div className="an__day-bar" style={{ width: `${(d.avg / maxDay) * 100}%` }} /></div>
                  <span className="an__day-val">{d.avg}</span>
                </div>
              ))}
            </div>
            <div className="an__card">
              <h3 className="an__card-title">Pharmacy Split</h3>
              <div className="an__split-bar">
                <div className="an__split-shsp" style={{ width: `${k.shspPct || 50}%` }}>SHSP {k.shspPct}%</div>
                <div className="an__split-aultman" style={{ width: `${100 - (k.shspPct || 50)}%` }}>Aultman {100 - (k.shspPct || 0)}%</div>
              </div>
            </div>
          </div>
        </>
      )}

      {tab === 'trends' && (
        <div className="an__grid">
          {/* Volume + 7-day Moving Average */}
          <div className="an__card an__card--full">
            <h3 className="an__card-title">Volume + 7-Day Moving Average</h3>
            <TrendChart data={(data.volumeTrend || []).slice().reverse()} movingAvg={(data.movingAvg || []).slice().reverse()} target={400} />
          </div>

          {/* Month-over-Month Growth */}
          <div className="an__card an__card--full">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 className="an__card-title" style={{ margin: 0 }}>Month-over-Month</h3>
              <div style={{ display: 'flex', gap: 4 }}>
                {[['date','Date'],['volume','Volume'],['growth','MoM'],['yoy','YoY'],['avg','Avg/Day']].map(([key, label]) => (
                  <button key={key} onClick={() => setMonthSort(key)}
                    style={{ padding: '3px 10px', fontSize: 11, fontWeight: monthSort === key ? 700 : 500, border: '1px solid #F0F2F7', borderRadius: 4, background: monthSort === key ? '#0B1E3D' : 'transparent', color: monthSort === key ? '#fff' : '#9BA5B4', cursor: 'pointer' }}>
                    {label}
                  </button>
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
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th style={{ textAlign: 'right' }}>Stops</th>
                      <th style={{ textAlign: 'right' }}>Avg/Day</th>
                      <th style={{ textAlign: 'right' }}>MoM</th>
                      <th style={{ textAlign: 'right' }}>YoY</th>
                      <th style={{ width: '35%' }}>Volume</th>
                    </tr>
                  </thead>
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
                          <td className="an__mom-num">
                            {m.growth !== null && (
                              <span className={m.growth >= 0 ? 'an__mom-up' : 'an__mom-down'}>
                                {m.growth >= 0 ? '+' : ''}{m.growth}%
                              </span>
                            )}
                          </td>
                          <td className="an__mom-num">
                            {m.yoy !== null && m.yoy !== undefined && (
                              <span className={m.yoy >= 0 ? 'an__mom-up' : 'an__mom-down'}>
                                {m.yoy >= 0 ? '+' : ''}{m.yoy}%
                              </span>
                            )}
                            {(m.yoy === null || m.yoy === undefined) && (
                              <span className="an__mom-avg">—</span>
                            )}
                          </td>
                          <td>
                            <div className="an__mom-bar-wrap">
                              <div className="an__mom-bar" style={{ width: `${pct}%` }} />
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )
            })()}
          </div>

          {/* Cold Chain % Over Time */}
          <div className="an__card an__card--full">
            <h3 className="an__card-title">Cold Chain % Over Time</h3>
            <LineChart data={(data.ccTrend || []).slice().reverse().map(d => ({ date: d.date, value: d.pct, label: d.pct + '%' }))} color="#6495ed" />
          </div>

          {/* SHSP vs Aultman Shift */}
          <div className="an__card an__card--full">
            <h3 className="an__card-title">SHSP vs Aultman Share Over Time</h3>
            <LineChart data={(data.pharmaTrend || []).slice().reverse().map(d => ({ date: d.date, value: d.shspPct, label: 'SHSP ' + d.shspPct + '%' }))} color="#3b82f6" />
            <div className="an__legend" style={{ marginTop: 8 }}>
              <span><span className="an__dot an__dot--shsp" />SHSP %</span>
              <span><span className="an__dot an__dot--aultman" />Aultman = remainder</span>
            </div>
          </div>
        </div>
      )}

      {tab === 'drivers' && (
        <div className="an__grid">
          <div className="an__card an__card--full">
            <h3 className="an__card-title">Driver Leaderboard — Weekly Stops</h3>
            {dl.map((d, i) => (
              <div className="an__leader" key={d.name}>
                <span className="an__leader-rank">{i + 1}</span>
                <span className="an__leader-name">{d.name}</span>
                <div className="an__leader-bar-wrap"><div className="an__leader-bar" style={{ width: `${(d.weekTotal / maxLeader) * 100}%` }} /></div>
                <span className="an__leader-val">{d.weekTotal}</span>
              </div>
            ))}
          </div>
          {tdo.length > 0 && (
            <div className="an__card">
              <h3 className="an__card-title">Most Times Top Driver</h3>
              {tdo.map((d, i) => (
                <div className="an__top-driver" key={d.name}>
                  <span>{i === 0 ? '1' : i + 1}</span>
                  <span className="an__td-name">{d.name}</span>
                  <span>{d.timesTop}x</span>
                </div>
              ))}
            </div>
          )}

          {/* Stops per driver per month */}
          {(data.driverMonthlyData || []).length > 0 && (
            <div className="an__card an__card--full">
              <h3 className="an__card-title">Stops Per Driver — Last 6 Months</h3>
              <div style={{ overflowX: 'auto' }}>
                <table className="an__driver-table">
                  <thead>
                    <tr>
                      <th>Driver</th>
                      {data.driverMonthlyData[0].months.map(m => {
                        const [y, mo] = m.month.split('-')
                        return <th key={m.month}>{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+mo - 1]} {y.slice(2)}</th>
                      })}
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.driverMonthlyData.map(d => (
                      <tr key={d.name}>
                        <td style={{ fontWeight: 600 }}>{d.name}</td>
                        {d.months.map(m => <td key={m.month} style={{ color: m.stops === 0 ? 'var(--gray-300)' : 'var(--gray-700)' }}>{m.stops.toLocaleString()}</td>)}
                        <td style={{ fontWeight: 700 }}>{d.total.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Driver consistency */}
          {(data.driverConsistency || []).length > 0 && (
            <div className="an__card an__card--full">
              <h3 className="an__card-title">Driver Consistency Score</h3>
              <p className="an__card-sub">Lower variance = more consistent daily loads. Score 0-100.</p>
              {data.driverConsistency.map(d => (
                <div className="an__leader" key={d.name}>
                  <span className="an__leader-name" style={{ minWidth: 80 }}>{d.name}</span>
                  <div className="an__leader-bar-wrap">
                    <div className="an__leader-bar" style={{
                      width: `${d.consistency}%`,
                      background: d.consistency >= 80 ? '#22c55e' : d.consistency >= 60 ? '#f59e0b' : '#ef4444',
                    }} />
                  </div>
                  <span className="an__leader-val" style={{ minWidth: 40 }}>{d.consistency}</span>
                  <span style={{ fontSize: 11, color: 'var(--gray-400)', minWidth: 90 }}>avg {d.avg}/day</span>
                </div>
              ))}
            </div>
          )}

          {/* Top ZIPs per driver */}
          {(data.driverTopZips || []).length > 0 && (
            <div className="an__card an__card--full">
              <h3 className="an__card-title">Top ZIP Codes Per Driver</h3>
              <div className="an__driver-zips-grid">
                {data.driverTopZips.map(d => (
                  <div key={d.name} className="an__driver-zip-card">
                    <h4>{d.name}</h4>
                    {d.zips.map(z => (
                      <div key={z.zip} className="an__zip">
                        <span className="an__zip-code">{z.zip}</span>
                        {z.city && <span className="an__zip-city">{z.city}</span>}
                        <span className="an__zip-count">{z.count.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'geography' && (
        <div className="an__grid">
          <div className="an__card">
            <h3 className="an__card-title">Top ZIP Codes</h3>
            {tz.map((z, i) => (
              <div className="an__zip" key={i}><span className="an__zip-rank">{i + 1}</span><span className="an__zip-code">{z.ZIP}</span><span className="an__zip-count">{z.Count}</span></div>
            ))}
          </div>
          {tl.length > 0 && (
            <div className="an__card">
              <h3 className="an__card-title">Top Addresses</h3>
              <table className="an__loc-table"><thead><tr>{Object.keys(tl[0]).map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
                <tbody>{tl.map((r, i) => <tr key={i}>{Object.values(r).map((v, j) => <td key={j}>{typeof v === 'number' ? v.toLocaleString() : v}</td>)}</tr>)}</tbody>
              </table>
            </div>
          )}
          {pd.length > 0 && (
            <div className="an__card an__card--full">
              <h3 className="an__card-title">Top Patients</h3>
              <table className="an__loc-table"><thead><tr>{Object.keys(pd[0]).map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
                <tbody>{pd.map((r, i) => <tr key={i}>{Object.values(r).map((v, j) => <td key={j}>{typeof v === 'number' ? v.toLocaleString() : v}</td>)}</tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'pharmacy' && (
        <div className="an__grid">
          <div className="an__card an__card--full">
            <h3 className="an__card-title">Pharmacy Volume</h3>
            <div className="an__split-bar" style={{ height: 48, fontSize: 14 }}>
              <div className="an__split-shsp" style={{ width: `${k.shspPct}%` }}>SHSP — {(k.shspTotal || 0).toLocaleString()} ({k.shspPct}%)</div>
              <div className="an__split-aultman" style={{ width: `${100 - (k.shspPct || 0)}%` }}>Aultman — {(k.aultmanTotal || 0).toLocaleString()} ({100 - (k.shspPct || 0)}%)</div>
            </div>
          </div>
          <div className="an__card">
            <h3 className="an__card-title">Dispatches</h3>
            <span className="an__kpi-value" style={{ fontSize: 32 }}>{data.dispatches || 0}</span>
            <span className="an__kpi-sub">in selected period</span>
          </div>
        </div>
      )}

      {tab === 'insights' && (
        <div className="an__grid">
          {/* Seasonality */}
          <div className="an__card an__card--full">
            <h3 className="an__card-title">Seasonality — Average Daily Volume by Month</h3>
            <p className="an__card-sub">
              Peak: <strong>{data.peakMonth?.month}</strong> ({data.peakMonth?.avgPerDay} avg/day)
              {' · '}Slowest: <strong>{data.slowMonth?.month}</strong> ({data.slowMonth?.avgPerDay} avg/day)
            </p>
            <div className="an__season-chart">
              {(data.seasonality || []).map(m => {
                const max = Math.max(...(data.seasonality || []).map(s => s.avgPerDay || 0), 1)
                const pct = max ? (m.avgPerDay / max) * 100 : 0
                const isPeak = m.month === data.peakMonth?.month
                const isSlow = m.month === data.slowMonth?.month && m.totalDays > 0
                return (
                  <div key={m.month} className="an__season-col">
                    <span className="an__season-val">{m.avgPerDay || '—'}</span>
                    <div className="an__season-bar-wrap">
                      <div
                        className={`an__season-bar ${isPeak ? 'an__season-bar--peak' : isSlow ? 'an__season-bar--slow' : ''}`}
                        style={{ height: `${pct}%` }}
                      />
                    </div>
                    <span className="an__season-label">{m.month}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Driver Turnover Impact */}
          <div className="an__card">
            <h3 className="an__card-title">Driver Turnover Impact</h3>
            <p className="an__card-sub">What % of volume each driver handles (last 6 months)</p>
            <div className="an__impact-list">
              {(data.driverImpact || []).map(d => (
                <div key={d.name} className="an__impact-row">
                  <span className="an__impact-name">{d.name}</span>
                  <div className="an__impact-bar-wrap">
                    <div className={`an__impact-bar ${d.pct >= 15 ? 'an__impact-bar--high' : ''}`} style={{ width: `${d.pct}%` }} />
                  </div>
                  <span className="an__impact-pct">{d.pct}%</span>
                  <span className="an__impact-detail">{d.avgPerDay} avg/day</span>
                </div>
              ))}
            </div>
          </div>

          {/* Cold Chain by Day of Week */}
          <div className="an__card">
            <h3 className="an__card-title">Cold Chain by Day of Week</h3>
            <p className="an__card-sub">Average cold chain packages per day</p>
            <div className="an__cc-day-list">
              {(data.coldChainByDay || []).map(d => {
                const max = Math.max(...(data.coldChainByDay || []).map(x => x.avgCC || 0), 1)
                return (
                  <div key={d.day} className="an__cc-day-row">
                    <span className="an__cc-day-name">{d.day.slice(0, 3)}</span>
                    <div className="an__cc-day-bar-wrap">
                      <div className="an__cc-day-bar" style={{ width: `${(d.avgCC / max) * 100}%` }} />
                    </div>
                    <span className="an__cc-day-val">{d.avgCC} avg</span>
                    <span className="an__cc-day-pct">{d.ccPct}%</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ZIP Growth — Growing */}
          <div className="an__card">
            <h3 className="an__card-title">ZIP Codes — Growing</h3>
            <p className="an__card-sub">Last 3 months vs prior 3 months</p>
            <table className="an__insight-table">
              <thead>
                <tr><th>ZIP</th><th>City</th><th>Recent</th><th>Prior</th><th>Growth</th></tr>
              </thead>
              <tbody>
                {(data.zipGrowing || []).map(z => (
                  <tr key={z.zip}>
                    <td style={{ fontWeight: 700 }}>{z.zip}</td>
                    <td>{z.city}</td>
                    <td>{z.recent}</td>
                    <td>{z.older}</td>
                    <td style={{ color: '#16a34a', fontWeight: 600 }}>+{z.growth}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ZIP Growth — Declining */}
          <div className="an__card">
            <h3 className="an__card-title">ZIP Codes — Declining</h3>
            <p className="an__card-sub">Last 3 months vs prior 3 months</p>
            <table className="an__insight-table">
              <thead>
                <tr><th>ZIP</th><th>City</th><th>Recent</th><th>Prior</th><th>Change</th></tr>
              </thead>
              <tbody>
                {(data.zipDeclining || []).map(z => (
                  <tr key={z.zip}>
                    <td style={{ fontWeight: 700 }}>{z.zip}</td>
                    <td>{z.city}</td>
                    <td>{z.recent}</td>
                    <td>{z.older}</td>
                    <td style={{ color: '#dc4a4a', fontWeight: 600 }}>{z.growth}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Contract Rate Calculator */}
          <div className="an__card an__card--full">
            <h3 className="an__card-title">Contract Rate Calculator</h3>
            <p className="an__card-sub">Adjust rates below to see how revenue would change across your last 6 months of deliveries</p>

            <div className="an__rate-inputs">
              <div className="an__rate-field">
                <label>First Order / ZIP</label>
                <div className="an__rate-input-wrap">
                  <span>$</span>
                  <input type="number" step="0.25" value={rates.first}
                    onChange={e => setRates(r => ({ ...r, first: parseFloat(e.target.value) || 0 }))} />
                </div>
                <span className="an__rate-current">Current: $11.00</span>
              </div>
              <div className="an__rate-field">
                <label>Additional / ZIP</label>
                <div className="an__rate-input-wrap">
                  <span>$</span>
                  <input type="number" step="0.25" value={rates.additional}
                    onChange={e => setRates(r => ({ ...r, additional: parseFloat(e.target.value) || 0 }))} />
                </div>
                <span className="an__rate-current">Current: $9.40</span>
              </div>
              <div className="an__rate-field">
                <label>Outlier ZIP Rate</label>
                <div className="an__rate-input-wrap">
                  <span>$</span>
                  <input type="number" step="0.50" value={rates.outlier}
                    onChange={e => setRates(r => ({ ...r, outlier: parseFloat(e.target.value) || 0 }))} />
                </div>
                <span className="an__rate-current">Current: $32.50</span>
              </div>
            </div>

            {(() => {
              const stops = data.rateCalcStops || []
              if (stops.length === 0) return <p style={{ color: 'var(--gray-400)', padding: 16 }}>No stop data available</p>

              // Current rates
              let currentRev = 0, newRev = 0
              stops.forEach(s => {
                const isOutlier = OUTLIER_ZIPS.has(s.zip)
                const curFirst = isOutlier ? 32.50 : 11.00
                const newFirst = isOutlier ? rates.outlier : rates.first
                currentRev += curFirst + (s.count - 1) * 9.40
                newRev += newFirst + (s.count - 1) * rates.additional
              })

              const diff = newRev - currentRev
              const pctChange = currentRev > 0 ? ((diff / currentRev) * 100) : 0
              const totalStops = stops.reduce((s, r) => s + r.count, 0)
              const uniqueDays = new Set(stops.map(s => s.date)).size

              // Monthly breakdown
              const byMonth = {}
              stops.forEach(s => {
                const m = s.date.slice(0, 7)
                if (!byMonth[m]) byMonth[m] = { current: 0, proposed: 0, stops: 0 }
                const isOutlier = OUTLIER_ZIPS.has(s.zip)
                const curFirst = isOutlier ? 32.50 : 11.00
                const newFirst = isOutlier ? rates.outlier : rates.first
                byMonth[m].current += curFirst + (s.count - 1) * 9.40
                byMonth[m].proposed += newFirst + (s.count - 1) * rates.additional
                byMonth[m].stops += s.count
              })
              const monthlyRows = Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0]))

              return (
                <>
                  <div className="an__rate-summary">
                    <div className="an__rate-stat">
                      <span className="an__rate-stat-label">Current Revenue</span>
                      <span className="an__rate-stat-value">${currentRev.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="an__rate-stat">
                      <span className="an__rate-stat-label">Proposed Revenue</span>
                      <span className="an__rate-stat-value" style={{ color: 'var(--navy)' }}>${newRev.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="an__rate-stat">
                      <span className="an__rate-stat-label">Difference</span>
                      <span className="an__rate-stat-value" style={{ color: diff >= 0 ? '#16a34a' : '#dc4a4a' }}>
                        {diff >= 0 ? '+' : ''}${diff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        <span style={{ fontSize: 13, fontWeight: 500, marginLeft: 6 }}>({pctChange >= 0 ? '+' : ''}{pctChange.toFixed(1)}%)</span>
                      </span>
                    </div>
                    <div className="an__rate-stat">
                      <span className="an__rate-stat-label">Based On</span>
                      <span className="an__rate-stat-value" style={{ fontSize: 16 }}>{totalStops.toLocaleString()} stops · {uniqueDays} days</span>
                    </div>
                  </div>

                  <table className="an__insight-table" style={{ marginTop: 16 }}>
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th className="rev__th-num">Stops</th>
                        <th className="rev__th-num">Current</th>
                        <th className="rev__th-num">Proposed</th>
                        <th className="rev__th-num">Diff</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyRows.map(([month, d]) => {
                        const mDiff = d.proposed - d.current
                        return (
                          <tr key={month}>
                            <td style={{ fontWeight: 600 }}>{month}</td>
                            <td className="rev__cell-num">{d.stops.toLocaleString()}</td>
                            <td className="rev__cell-num">${d.current.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="rev__cell-num" style={{ fontWeight: 700, color: 'var(--navy)' }}>${d.proposed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="rev__cell-num" style={{ fontWeight: 600, color: mDiff >= 0 ? '#16a34a' : '#dc4a4a' }}>
                              {mDiff >= 0 ? '+' : ''}${mDiff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </>
              )
            })()}
          </div>

          {/* Driver Pay Simulator */}
          <div className="an__card an__card--full">
            <h3 className="an__card-title">Driver Pay Simulator</h3>
            <p className="an__card-sub">Adjust per-stop rates to see how driver pay changes. Based on last 6 months of actual stops.</p>

            {(() => {
              const driverRatesData = data.driverRates || []
              const driverPay = data.driverPayData || []
              if (driverRatesData.length === 0) return <p style={{ color: 'var(--gray-400)', padding: 16 }}>No driver data</p>

              let totalCurrentPay = 0, totalProposedPay = 0

              const rows = driverRatesData.map(dr => {
                const stops = driverPay.find(d => d.name === dr.name)
                if (!stops) return null
                const pr = payRates[dr.name] || { mth: dr.rateMth, wf: dr.rateWf }

                let currentPay, proposedPay
                if (dr.flatSalary) {
                  const weeks = Math.ceil(stops.activeDays / 5)
                  currentPay = dr.flatSalary * weeks
                  proposedPay = currentPay // can't simulate flat salary
                } else {
                  currentPay = (stops.mthStops * dr.rateMth) + (stops.wfStops * dr.rateWf)
                  proposedPay = (stops.mthStops * pr.mth) + (stops.wfStops * pr.wf)
                }

                totalCurrentPay += currentPay
                totalProposedPay += proposedPay

                return {
                  name: dr.name, mthStops: stops.mthStops, wfStops: stops.wfStops,
                  totalStops: stops.totalStops, activeDays: stops.activeDays,
                  currentRate: { mth: dr.rateMth, wf: dr.rateWf },
                  proposedRate: pr,
                  currentPay, proposedPay, isFlat: !!dr.flatSalary,
                  diff: proposedPay - currentPay,
                }
              }).filter(Boolean).sort((a, b) => b.currentPay - a.currentPay)

              const payDiff = totalProposedPay - totalCurrentPay

              return (
                <>
                  <div className="an__rate-summary" style={{ marginBottom: 16 }}>
                    <div className="an__rate-stat">
                      <span className="an__rate-stat-label">Current Total Pay</span>
                      <span className="an__rate-stat-value">${totalCurrentPay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="an__rate-stat">
                      <span className="an__rate-stat-label">Proposed Total Pay</span>
                      <span className="an__rate-stat-value" style={{ color: 'var(--navy)' }}>${totalProposedPay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="an__rate-stat">
                      <span className="an__rate-stat-label">Pay Difference</span>
                      <span className="an__rate-stat-value" style={{ color: payDiff <= 0 ? '#16a34a' : '#dc4a4a' }}>
                        {payDiff >= 0 ? '+' : ''}${payDiff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="an__rate-stat">
                      <span className="an__rate-stat-label">Profit Impact</span>
                      <span className="an__rate-stat-value" style={{ color: payDiff <= 0 ? '#16a34a' : '#dc4a4a', fontSize: 16 }}>
                        {payDiff <= 0 ? '+' : '-'}${Math.abs(payDiff).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} profit
                      </span>
                    </div>
                  </div>

                  <div className="rev__profit-table-wrap" style={{ maxHeight: 500, overflowY: 'auto' }}>
                    <table className="an__insight-table">
                      <thead>
                        <tr>
                          <th>Driver</th>
                          <th className="rev__th-num">MTH Stops</th>
                          <th className="rev__th-num">WF Stops</th>
                          <th className="rev__th-num">MTH Rate</th>
                          <th className="rev__th-num">WF Rate</th>
                          <th className="rev__th-num">Current Pay</th>
                          <th className="rev__th-num">Proposed Pay</th>
                          <th className="rev__th-num">Diff</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(d => (
                          <tr key={d.name}>
                            <td style={{ fontWeight: 600 }}>{d.name} {d.isFlat && <span style={{ fontSize: 10, color: 'var(--gray-400)' }}>(flat)</span>}</td>
                            <td className="rev__cell-num">{d.mthStops.toLocaleString()}</td>
                            <td className="rev__cell-num">{d.wfStops.toLocaleString()}</td>
                            <td className="rev__cell-num">
                              {d.isFlat ? '—' : (
                                <input type="number" step="0.25" style={{ width: 60, padding: '2px 4px', textAlign: 'center', border: '1px solid var(--gray-200)', borderRadius: 4, fontSize: 13, fontFamily: 'ui-monospace, monospace' }}
                                  value={payRates[d.name]?.mth ?? d.currentRate.mth}
                                  onChange={e => setPayRates(p => ({ ...p, [d.name]: { ...p[d.name], mth: parseFloat(e.target.value) || 0, wf: p[d.name]?.wf ?? d.currentRate.wf } }))}
                                />
                              )}
                            </td>
                            <td className="rev__cell-num">
                              {d.isFlat ? '—' : (
                                <input type="number" step="0.25" style={{ width: 60, padding: '2px 4px', textAlign: 'center', border: '1px solid var(--gray-200)', borderRadius: 4, fontSize: 13, fontFamily: 'ui-monospace, monospace' }}
                                  value={payRates[d.name]?.wf ?? d.currentRate.wf}
                                  onChange={e => setPayRates(p => ({ ...p, [d.name]: { mth: p[d.name]?.mth ?? d.currentRate.mth, wf: parseFloat(e.target.value) || 0 } }))}
                                />
                              )}
                            </td>
                            <td className="rev__cell-num">${d.currentPay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="rev__cell-num" style={{ fontWeight: 700, color: 'var(--navy)' }}>${d.proposedPay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="rev__cell-num" style={{ fontWeight: 600, color: d.diff <= 0 ? '#16a34a' : '#dc4a4a' }}>
                              {d.diff >= 0 ? '+' : ''}${d.diff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}

function BarChart({ data, maxVol, target }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current) ref.current.scrollLeft = 0 }, [data])

  return (
    <div className="an__vol-scroll" ref={ref}>
      <div className="an__vol-chart">
        {(data || []).map((d, i) => (
          <div className="an__vol-col" key={i} title={`${d.day || ''} ${fmtDate(d.date)}: ${d.orders} (SHSP: ${d.shsp}, Aultman: ${d.aultman})`}>
            <div className="an__vol-bar-wrap" style={{ position: 'relative' }}>
              {i === 0 && target > 0 && target <= maxVol && (
                <div style={{ position: 'absolute', left: 0, width: '9999px', bottom: `${(target / maxVol) * 100}%`, borderBottom: '2px dashed #22c55e', zIndex: 2, pointerEvents: 'none' }}>
                  <span style={{ position: 'absolute', left: 0, top: -16, fontSize: 10, color: '#22c55e', fontWeight: 600, whiteSpace: 'nowrap' }}>400 target</span>
                </div>
              )}
              <div className="an__vol-bar" style={{ height: `${(d.orders / maxVol) * 100}%` }}>
                <div className="an__vol-aultman" style={{ height: `${d.orders ? (d.aultman / d.orders) * 100 : 0}%` }} />
              </div>
            </div>
            <span className="an__vol-val">{d.orders}</span>
            <span className="an__vol-label">{(d.day || '').slice(0, 3)}</span>
            <span className="an__vol-date">{fmtDate(d.date)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function TrendChart({ data, movingAvg, target }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current) ref.current.scrollLeft = 0 }, [data])
  const maxVol = Math.max(...(data || []).map(d => d.orders || 0), 1)
  const maxAvg = Math.max(...(movingAvg || []).map(d => d.avg || 0), 1)
  const maxY = Math.max(maxVol, maxAvg)

  return (
    <div className="an__vol-scroll" ref={ref}>
      <div className="an__trend-chart">
        {(data || []).map((d, i) => {
          const avg = movingAvg[i]?.avg || 0
          return (
            <div className="an__trend-col" key={i} title={`${fmtDate(d.date)}: ${d.orders} orders, 7d avg: ${avg}`}>
              <div className="an__trend-bar-area">
                {i === 0 && target > 0 && target <= maxY && (
                  <div style={{ position: 'absolute', left: 0, width: '9999px', bottom: `${(target / maxY) * 100}%`, borderBottom: '2px dashed #22c55e', zIndex: 2, pointerEvents: 'none' }}>
                    <span style={{ position: 'absolute', left: 0, top: -16, fontSize: 10, color: '#22c55e', fontWeight: 600, whiteSpace: 'nowrap' }}>400 target</span>
                  </div>
                )}
                <div className="an__vol-bar" style={{ height: `${(d.orders / maxY) * 100}%` }}>
                  <div className="an__vol-aultman" style={{ height: `${d.orders ? (d.aultman / d.orders) * 100 : 0}%` }} />
                </div>
                <div className="an__trend-line" style={{ bottom: `${(avg / maxY) * 100}%` }} />
              </div>
              <span className="an__vol-val" style={{ fontSize: 10 }}>{d.orders}</span>
              <span className="an__vol-date">{fmtDate(d.date)}</span>
            </div>
          )
        })}
      </div>
      <div className="an__legend" style={{ marginTop: 8 }}>
        <span><span className="an__dot an__dot--shsp" />SHSP</span>
        <span><span className="an__dot an__dot--aultman" />Aultman</span>
        <span><span style={{ display: 'inline-block', width: 16, height: 2, background: '#f59e0b', verticalAlign: 'middle', marginRight: 4 }} />7-Day Avg</span>
      </div>
    </div>
  )
}

function LineChart({ data, color }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current) ref.current.scrollLeft = 0 }, [data])
  const maxVal = Math.max(...(data || []).map(d => d.value || 0), 1)
  const minVal = Math.min(...(data || []).map(d => d.value || 0))
  const range = maxVal - minVal || 1

  return (
    <div className="an__vol-scroll" ref={ref}>
      <div className="an__line-chart">
        {(data || []).map((d, i) => (
          <div className="an__line-col" key={i} title={`${fmtDate(d.date)}: ${d.label}`}>
            <div className="an__line-bar-area">
              <div className="an__line-dot" style={{ bottom: `${((d.value - minVal) / range) * 80 + 10}%`, background: color }} />
              {i > 0 && <div className="an__line-connector" style={{
                bottom: `${((data[i-1].value - minVal) / range) * 80 + 10}%`,
                height: `${Math.abs(d.value - data[i-1].value) / range * 80}%`,
                background: color, opacity: 0.3,
              }} />}
            </div>
            <span className="an__line-val" style={{ color }}>{d.value}%</span>
            <span className="an__vol-date">{fmtDate(d.date)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
