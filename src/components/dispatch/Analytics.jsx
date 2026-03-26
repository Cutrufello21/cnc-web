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

  // Aggregate weekly for All Time
  const chartData = period === 'all' && vt.length > 60
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
        {[['overview','Overview'],['drivers','Drivers'],['geography','Geography'],['pharmacy','Pharmacy']].map(([key, label]) => (
          <button key={key} className={`an__subtab ${tab === key ? 'an__subtab--active' : ''}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <div className="an__kpis">
            <div className="an__kpi"><span className="an__kpi-label">Total Orders</span><span className="an__kpi-value">{(k.totalOrders || 0).toLocaleString()}</span></div>
            <div className="an__kpi"><span className="an__kpi-label">Avg / Night</span><span className="an__kpi-value">{k.avgPerNight || 0}</span></div>
            <div className="an__kpi"><span className="an__kpi-label">Cold Chain</span><span className="an__kpi-value an__kpi-value--accent">{(k.totalColdChain || 0).toLocaleString()}</span><span className="an__kpi-sub">{k.coldChainPct || 0}%</span></div>
            <div className="an__kpi"><span className="an__kpi-label">SHSP</span><span className="an__kpi-value">{(k.shspTotal || 0).toLocaleString()}</span><span className="an__kpi-sub">{k.shspPct || 0}%</span></div>
            <div className="an__kpi"><span className="an__kpi-label">Aultman</span><span className="an__kpi-value">{(k.aultmanTotal || 0).toLocaleString()}</span><span className="an__kpi-sub">{100 - (k.shspPct || 0)}%</span></div>
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
            <h3 className="an__card-title">Cold Chain</h3>
            <span className="an__kpi-value an__kpi-value--accent" style={{ fontSize: 32 }}>{(k.totalColdChain || 0).toLocaleString()}</span>
            <span className="an__kpi-sub">{k.coldChainPct}% of all orders</span>
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
  useEffect(() => { if (ref.current) ref.current.scrollLeft = ref.current.scrollWidth }, [data])

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
