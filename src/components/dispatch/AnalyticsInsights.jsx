import { useState } from 'react'
import { LineChart } from './AnalyticsCharts'

const OUTLIER_ZIPS = new Set([
  '43450','43986','43988','44230','44270','44273','44276','44281',
  '44314','44606','44608','44612','44613','44624','44626','44627',
  '44651','44675','44678','44681','44683','44691',
])

export default function AnalyticsInsights({ data, k }) {
  const [rates, setRates] = useState({ first: 11, additional: 9.40, outlier: 32.50 })
  const [payRates, setPayRates] = useState(() => {
    const init = {}
    ;(data.driverRates || []).forEach(d => { init[d.name] = { mth: d.rateMth, wf: d.rateWf } })
    return init
  })

  return (
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
                  <div className={`an__season-bar ${isPeak ? 'an__season-bar--peak' : isSlow ? 'an__season-bar--slow' : ''}`} style={{ height: `${pct}%` }} />
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
          <thead><tr><th>ZIP</th><th>City</th><th>Recent</th><th>Prior</th><th>Growth</th></tr></thead>
          <tbody>
            {(data.zipGrowing || []).map(z => (
              <tr key={z.zip}><td style={{ fontWeight: 700 }}>{z.zip}</td><td>{z.city}</td><td>{z.recent}</td><td>{z.older}</td><td style={{ color: '#16a34a', fontWeight: 600 }}>+{z.growth}%</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ZIP Growth — Declining */}
      <div className="an__card">
        <h3 className="an__card-title">ZIP Codes — Declining</h3>
        <p className="an__card-sub">Last 3 months vs prior 3 months</p>
        <table className="an__insight-table">
          <thead><tr><th>ZIP</th><th>City</th><th>Recent</th><th>Prior</th><th>Change</th></tr></thead>
          <tbody>
            {(data.zipDeclining || []).map(z => (
              <tr key={z.zip}><td style={{ fontWeight: 700 }}>{z.zip}</td><td>{z.city}</td><td>{z.recent}</td><td>{z.older}</td><td style={{ color: '#dc4a4a', fontWeight: 600 }}>{z.growth}%</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Contract Rate Calculator */}
      <div className="an__card an__card--full">
        <h3 className="an__card-title">Contract Rate Calculator</h3>
        <p className="an__card-sub">Adjust rates below to see how revenue would change across your last 6 months of deliveries</p>
        <div className="an__rate-inputs">
          <div className="an__rate-field"><label>First Order / ZIP</label><div className="an__rate-input-wrap"><span>$</span><input type="number" step="0.25" value={rates.first} onChange={e => setRates(r => ({ ...r, first: parseFloat(e.target.value) || 0 }))} /></div><span className="an__rate-current">Current: $11.00</span></div>
          <div className="an__rate-field"><label>Additional / ZIP</label><div className="an__rate-input-wrap"><span>$</span><input type="number" step="0.25" value={rates.additional} onChange={e => setRates(r => ({ ...r, additional: parseFloat(e.target.value) || 0 }))} /></div><span className="an__rate-current">Current: $9.40</span></div>
          <div className="an__rate-field"><label>Outlier ZIP Rate</label><div className="an__rate-input-wrap"><span>$</span><input type="number" step="0.50" value={rates.outlier} onChange={e => setRates(r => ({ ...r, outlier: parseFloat(e.target.value) || 0 }))} /></div><span className="an__rate-current">Current: $32.50</span></div>
        </div>
        <RateCalculator data={data} rates={rates} OUTLIER_ZIPS={OUTLIER_ZIPS} />
      </div>

      {/* Driver Pay Simulator */}
      <div className="an__card an__card--full">
        <h3 className="an__card-title">Driver Pay Simulator</h3>
        <p className="an__card-sub">Adjust per-stop rates to see how driver pay changes. Based on last 6 months of actual stops.</p>
        <PaySimulator data={data} payRates={payRates} setPayRates={setPayRates} />
      </div>
    </div>
  )
}

function RateCalculator({ data, rates, OUTLIER_ZIPS }) {
  const stops = data.rateCalcStops || []
  if (stops.length === 0) return <p style={{ color: 'var(--gray-400)', padding: 16 }}>No stop data available</p>

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

  const byMonth = {}
  stops.forEach(s => {
    const m = s.date.slice(0, 7)
    if (!byMonth[m]) byMonth[m] = { current: 0, proposed: 0, stops: 0 }
    const isOutlier = OUTLIER_ZIPS.has(s.zip)
    byMonth[m].current += (isOutlier ? 32.50 : 11.00) + (s.count - 1) * 9.40
    byMonth[m].proposed += (isOutlier ? rates.outlier : rates.first) + (s.count - 1) * rates.additional
    byMonth[m].stops += s.count
  })
  const monthlyRows = Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0]))

  return <>
    <div className="an__rate-summary">
      <div className="an__rate-stat"><span className="an__rate-stat-label">Current Revenue</span><span className="an__rate-stat-value">${currentRev.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
      <div className="an__rate-stat"><span className="an__rate-stat-label">Proposed Revenue</span><span className="an__rate-stat-value" style={{ color: 'var(--navy)' }}>${newRev.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
      <div className="an__rate-stat"><span className="an__rate-stat-label">Difference</span><span className="an__rate-stat-value" style={{ color: diff >= 0 ? '#16a34a' : '#dc4a4a' }}>{diff >= 0 ? '+' : ''}${diff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<span style={{ fontSize: 13, fontWeight: 500, marginLeft: 6 }}>({pctChange >= 0 ? '+' : ''}{pctChange.toFixed(1)}%)</span></span></div>
      <div className="an__rate-stat"><span className="an__rate-stat-label">Based On</span><span className="an__rate-stat-value" style={{ fontSize: 16 }}>{totalStops.toLocaleString()} stops · {uniqueDays} days</span></div>
    </div>
    <table className="an__insight-table" style={{ marginTop: 16 }}>
      <thead><tr><th>Month</th><th className="rev__th-num">Stops</th><th className="rev__th-num">Current</th><th className="rev__th-num">Proposed</th><th className="rev__th-num">Diff</th></tr></thead>
      <tbody>
        {monthlyRows.map(([month, d]) => {
          const mDiff = d.proposed - d.current
          return <tr key={month}><td style={{ fontWeight: 600 }}>{month}</td><td className="rev__cell-num">{d.stops.toLocaleString()}</td><td className="rev__cell-num">${d.current.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td className="rev__cell-num" style={{ fontWeight: 700, color: 'var(--navy)' }}>${d.proposed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td className="rev__cell-num" style={{ fontWeight: 600, color: mDiff >= 0 ? '#16a34a' : '#dc4a4a' }}>{mDiff >= 0 ? '+' : ''}${mDiff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
        })}
      </tbody>
    </table>
  </>
}

function PaySimulator({ data, payRates, setPayRates }) {
  const driverRatesData = data.driverRates || []
  const driverPay = data.driverPayData || []
  if (driverRatesData.length === 0) return <p style={{ color: 'var(--gray-400)', padding: 16 }}>No driver data</p>

  let totalCurrentPay = 0, totalProposedPay = 0
  const rows = driverRatesData.map(dr => {
    const stops = driverPay.find(d => d.name === dr.name)
    if (!stops) return null
    const pr = payRates[dr.name] || { mth: dr.rateMth, wf: dr.rateWf }
    let currentPay, proposedPay
    if (dr.flatSalary) { const weeks = Math.ceil(stops.activeDays / 5); currentPay = dr.flatSalary * weeks; proposedPay = currentPay }
    else { currentPay = (stops.mthStops * dr.rateMth) + (stops.wfStops * dr.rateWf); proposedPay = (stops.mthStops * pr.mth) + (stops.wfStops * pr.wf) }
    totalCurrentPay += currentPay; totalProposedPay += proposedPay
    return { name: dr.name, mthStops: stops.mthStops, wfStops: stops.wfStops, currentRate: { mth: dr.rateMth, wf: dr.rateWf }, proposedRate: pr, currentPay, proposedPay, isFlat: !!dr.flatSalary, diff: proposedPay - currentPay }
  }).filter(Boolean).sort((a, b) => b.currentPay - a.currentPay)

  const payDiff = totalProposedPay - totalCurrentPay

  return <>
    <div className="an__rate-summary" style={{ marginBottom: 16 }}>
      <div className="an__rate-stat"><span className="an__rate-stat-label">Current Total Pay</span><span className="an__rate-stat-value">${totalCurrentPay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
      <div className="an__rate-stat"><span className="an__rate-stat-label">Proposed Total Pay</span><span className="an__rate-stat-value" style={{ color: 'var(--navy)' }}>${totalProposedPay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
      <div className="an__rate-stat"><span className="an__rate-stat-label">Pay Difference</span><span className="an__rate-stat-value" style={{ color: payDiff <= 0 ? '#16a34a' : '#dc4a4a' }}>{payDiff >= 0 ? '+' : ''}${payDiff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
      <div className="an__rate-stat"><span className="an__rate-stat-label">Profit Impact</span><span className="an__rate-stat-value" style={{ color: payDiff <= 0 ? '#16a34a' : '#dc4a4a', fontSize: 16 }}>{payDiff <= 0 ? '+' : '-'}${Math.abs(payDiff).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} profit</span></div>
    </div>
    <div className="rev__profit-table-wrap" style={{ maxHeight: 500, overflowY: 'auto' }}>
      <table className="an__insight-table">
        <thead><tr><th>Driver</th><th className="rev__th-num">MTH Stops</th><th className="rev__th-num">WF Stops</th><th className="rev__th-num">MTH Rate</th><th className="rev__th-num">WF Rate</th><th className="rev__th-num">Current Pay</th><th className="rev__th-num">Proposed Pay</th><th className="rev__th-num">Diff</th></tr></thead>
        <tbody>
          {rows.map(d => (
            <tr key={d.name}>
              <td style={{ fontWeight: 600 }}>{d.name} {d.isFlat && <span style={{ fontSize: 10, color: 'var(--gray-400)' }}>(flat)</span>}</td>
              <td className="rev__cell-num">{d.mthStops.toLocaleString()}</td>
              <td className="rev__cell-num">{d.wfStops.toLocaleString()}</td>
              <td className="rev__cell-num">{d.isFlat ? '—' : <input type="number" step="0.25" style={{ width: 60, padding: '2px 4px', textAlign: 'center', border: '1px solid var(--gray-200)', borderRadius: 4, fontSize: 13, fontFamily: 'ui-monospace, monospace' }} value={payRates[d.name]?.mth ?? d.currentRate.mth} onChange={e => setPayRates(p => ({ ...p, [d.name]: { ...p[d.name], mth: parseFloat(e.target.value) || 0, wf: p[d.name]?.wf ?? d.currentRate.wf } }))} />}</td>
              <td className="rev__cell-num">{d.isFlat ? '—' : <input type="number" step="0.25" style={{ width: 60, padding: '2px 4px', textAlign: 'center', border: '1px solid var(--gray-200)', borderRadius: 4, fontSize: 13, fontFamily: 'ui-monospace, monospace' }} value={payRates[d.name]?.wf ?? d.currentRate.wf} onChange={e => setPayRates(p => ({ ...p, [d.name]: { mth: p[d.name]?.mth ?? d.currentRate.mth, wf: parseFloat(e.target.value) || 0 } }))} />}</td>
              <td className="rev__cell-num">${d.currentPay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td className="rev__cell-num" style={{ fontWeight: 700, color: 'var(--navy)' }}>${d.proposedPay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td className="rev__cell-num" style={{ fontWeight: 600, color: d.diff <= 0 ? '#16a34a' : '#dc4a4a' }}>{d.diff >= 0 ? '+' : ''}${d.diff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </>
}
