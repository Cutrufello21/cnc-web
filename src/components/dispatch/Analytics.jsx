import { useState, useEffect, useRef } from 'react'
import './Analytics.css'

function fmtDate(dateStr) {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length < 3) return dateStr
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[+parts[1] - 1]} ${+parts[2]}`
}

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
        {[['overview','Overview'],['trends','Trends'],['drivers','Drivers'],['geography','Geography'],['pharmacy','Pharmacy']].map(([key, label]) => (
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
            <BarChart data={chartData} maxVol={maxVol} />
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
            <TrendChart data={(data.volumeTrend || []).slice().reverse()} movingAvg={(data.movingAvg || []).slice().reverse()} />
          </div>

          {/* Month-over-Month Growth */}
          <div className="an__card an__card--full">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 className="an__card-title" style={{ margin: 0 }}>Month-over-Month</h3>
              <div style={{ display: 'flex', gap: 4 }}>
                {[['date','Date'],['volume','Volume'],['growth','Growth'],['avg','Avg/Day']].map(([key, label]) => (
                  <button key={key} onClick={() => setMonthSort(key)}
                    style={{ padding: '3px 10px', fontSize: 11, fontWeight: monthSort === key ? 700 : 500, border: '1px solid var(--gray-200)', borderRadius: 4, background: monthSort === key ? 'var(--navy)' : 'transparent', color: monthSort === key ? '#fff' : 'var(--gray-500)', cursor: 'pointer' }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="an__month-grid">
              {[...(data.monthlyTrend || [])].sort((a, b) => {
                if (monthSort === 'volume') return b.orders - a.orders
                if (monthSort === 'growth') return (b.growth || 0) - (a.growth || 0)
                if (monthSort === 'avg') return b.avgPerDay - a.avgPerDay
                return b.month.localeCompare(a.month)
              }).map(m => (
                <div className="an__month-card" key={m.month}>
                  <span className="an__month-label">{(() => { const [y, mo] = m.month.split('-'); const names = ['January','February','March','April','May','June','July','August','September','October','November','December']; return `${y} - ${names[+mo - 1]}` })()}</span>
                  <span className="an__month-orders">{m.orders.toLocaleString()}</span>
                  <span className="an__month-avg">{m.avgPerDay}/day</span>
                  {m.growth !== null && (
                    <span className={`an__month-growth ${m.growth >= 0 ? 'an__month-growth--up' : 'an__month-growth--down'}`}>
                      {m.growth >= 0 ? '+' : ''}{m.growth}%
                    </span>
                  )}
                </div>
              ))}
            </div>
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
    </div>
  )
}

function BarChart({ data, maxVol }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current) ref.current.scrollLeft = 0 }, [data])

  return (
    <div className="an__vol-scroll" ref={ref}>
      <div className="an__vol-chart">
        {(data || []).map((d, i) => (
          <div className="an__vol-col" key={i} title={`${d.day || ''} ${fmtDate(d.date)}: ${d.orders} (SHSP: ${d.shsp}, Aultman: ${d.aultman})`}>
            <div className="an__vol-bar-wrap">
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

function TrendChart({ data, movingAvg }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current) ref.current.scrollLeft = 0 }, [data])
  const orders = (data || []).map(d => d.orders || 0)
  const avgs = (movingAvg || []).map(d => d.avg || 0)
  const maxY = Math.max(...orders, ...avgs, 1)
  const allOrders = orders.filter(v => v > 0)
  const low = Math.min(...allOrders)
  const avg = allOrders.length ? Math.round(allOrders.reduce((s, v) => s + v, 0) / allOrders.length) : 0
  const high = Math.max(...allOrders)
  const colW = 30 // px per column
  const barH = 184 // bar area height in px
  const chartW = (data || []).length * colW

  return (
    <div style={{ display: 'flex', gap: 0 }}>
      {/* Y-axis labels */}
      <div style={{ width: 48, flexShrink: 0, position: 'relative', height: barH, marginTop: 0 }}>
        {[{ label: high, val: high }, { label: avg, val: avg }, { label: low, val: low }].map(({ label, val }) => (
          <div key={label + val} style={{ position: 'absolute', bottom: `${(val / maxY) * 100}%`, right: 4, transform: 'translateY(50%)', fontSize: 10, color: 'var(--gray-400)', whiteSpace: 'nowrap' }}>{label}</div>
        ))}
      </div>
      <div className="an__vol-scroll" ref={ref} style={{ flex: 1 }}>
        <div style={{ position: 'relative', minWidth: chartW }}>
          {/* Horizontal reference lines */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: barH, pointerEvents: 'none', zIndex: 1 }}>
            {[{ val: high, color: '#ef4444' }, { val: avg, color: '#6495ed' }, { val: low, color: '#f59e0b' }].map(({ val, color }) => (
              <div key={val + color} style={{ position: 'absolute', bottom: `${(val / maxY) * 100}%`, left: 0, right: 0, borderBottom: `1px dashed ${color}`, opacity: 0.4 }} />
            ))}
          </div>
          {/* SVG moving average line */}
          <svg style={{ position: 'absolute', top: 0, left: 0, width: chartW, height: barH, pointerEvents: 'none', zIndex: 3 }}>
            <polyline
              fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
              points={(movingAvg || []).map((d, i) => `${i * colW + colW / 2},${barH - (d.avg / maxY) * barH}`).join(' ')}
            />
          </svg>
          <div className="an__trend-chart" style={{ height: barH }}>
            {(data || []).map((d, i) => {
              const a = movingAvg[i]?.avg || 0
              return (
                <div className="an__trend-col" key={i} style={{ width: colW, minWidth: colW }} title={`${fmtDate(d.date)}: ${d.orders} orders, 7d avg: ${a}`}>
                  <div className="an__trend-bar-area">
                    <div className="an__vol-bar" style={{ height: `${(d.orders / maxY) * 100}%` }}>
                      <div className="an__vol-aultman" style={{ height: `${d.orders ? (d.aultman / d.orders) * 100 : 0}%` }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', minWidth: chartW }}>
            {(data || []).map((d, i) => (
              <div key={i} style={{ width: colW, minWidth: colW, textAlign: 'center' }}>
                <span className="an__vol-val" style={{ fontSize: 10 }}>{d.orders}</span>
                <span className="an__vol-date">{fmtDate(d.date)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="an__legend" style={{ marginTop: 8 }}>
          <span><span className="an__dot an__dot--shsp" />SHSP</span>
          <span><span className="an__dot an__dot--aultman" />Aultman</span>
          <span><span style={{ display: 'inline-block', width: 16, height: 2, background: '#f59e0b', verticalAlign: 'middle', marginRight: 4 }} />7-Day Avg</span>
          <span style={{ color: '#ef4444', fontSize: 11 }}>┈ High</span>
          <span style={{ color: '#6495ed', fontSize: 11 }}>┈ Avg</span>
          <span style={{ color: '#f59e0b', fontSize: 11 }}>┈ Low</span>
        </div>
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
