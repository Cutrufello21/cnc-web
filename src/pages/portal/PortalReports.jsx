import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import PortalShell from '../../components/portal/PortalShell'
import { getDeliveryDate } from '../../lib/getDeliveryDate'
import { hasPodEvidence } from './PortalDashboard'

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('en-CA')
}

const STATUS_FAILED = s => s === 'failed' || s === 'attempted'

function niceTickStep(rawStep) {
  if (rawStep <= 0) return 1
  const exp = Math.floor(Math.log10(rawStep))
  const f = rawStep / Math.pow(10, exp)
  let nice
  if (f <= 1) nice = 1
  else if (f <= 2) nice = 2
  else if (f <= 5) nice = 5
  else nice = 10
  return nice * Math.pow(10, exp)
}

function VolumeChart({ byDay }) {
  const entries = Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0]))
  if (entries.length === 0) return null

  const dataMax = Math.max(...entries.map(([, v]) => v.total), 1)
  const TICK_COUNT = 4
  const tickStep = niceTickStep(dataMax / TICK_COUNT)
  const niceMax = tickStep * TICK_COUNT
  const ticks = Array.from({ length: TICK_COUNT + 1 }, (_, i) => i * tickStep)

  const W = 880
  const H = 280
  const pad = { l: 48, r: 20, t: 16, b: 44 }
  const innerW = W - pad.l - pad.r
  const innerH = H - pad.t - pad.b
  const slotW = innerW / entries.length
  const barW = Math.min(28, Math.max(4, slotW * 0.62))

  // Pick ~7 evenly-spaced label indices so dates never collide
  const targetLabels = Math.min(7, entries.length)
  const labelStep = Math.max(1, Math.floor(entries.length / targetLabels))
  const labelIndices = new Set()
  for (let i = 0; i < entries.length; i += labelStep) labelIndices.add(i)
  labelIndices.add(entries.length - 1) // always pin the last
  // If second-to-last is too close to last (would overlap), drop it
  if (entries.length >= 2 && labelIndices.has(entries.length - 1) && labelIndices.has(entries.length - 1 - labelStep) && labelStep < 3) {
    labelIndices.delete(entries.length - 1 - labelStep)
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet" style={{ display: 'block', minWidth: 560 }}>
        {/* gridlines + y-axis labels */}
        {ticks.map((t) => {
          const y = pad.t + innerH * (1 - t / niceMax)
          return (
            <g key={t}>
              <line
                x1={pad.l} x2={W - pad.r}
                y1={y} y2={y}
                stroke="var(--p-border)"
                strokeDasharray={t === 0 ? '0' : '2 4'}
              />
              <text x={pad.l - 8} y={y + 3} fontSize="10" textAnchor="end" fill="var(--p-text-faint)">
                {t}
              </text>
            </g>
          )
        })}

        {/* bars */}
        {entries.map(([date, v], i) => {
          const cx = pad.l + slotW * (i + 0.5)
          const x = cx - barW / 2
          const baseline = pad.t + innerH

          // Find which segment is on top so we can round only its top corners
          const segs = [
            { val: v.delivered, color: '#10B981' },
            { val: v.failed, color: '#EF4444' },
            { val: v.total - v.delivered - v.failed, color: 'rgba(148,163,184,0.55)' },
          ]
          const lastNonZeroIdx = (() => {
            for (let k = segs.length - 1; k >= 0; k--) if (segs[k].val > 0) return k
            return -1
          })()

          let y = baseline
          return (
            <g key={date}>
              <title>{`${date} · ${v.total} total · ${v.delivered} delivered · ${v.failed} failed`}</title>
              {segs.map((seg, k) => {
                if (seg.val <= 0) return null
                const h = (seg.val / niceMax) * innerH
                y -= h
                const isTop = k === lastNonZeroIdx
                const r = isTop ? 3 : 0
                // Use a path so we can round only the top corners
                return (
                  <path
                    key={k}
                    d={
                      isTop
                        ? `M ${x} ${y + h} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} L ${x + barW - r} ${y} Q ${x + barW} ${y} ${x + barW} ${y + r} L ${x + barW} ${y + h} Z`
                        : `M ${x} ${y + h} L ${x} ${y} L ${x + barW} ${y} L ${x + barW} ${y + h} Z`
                    }
                    fill={seg.color}
                  />
                )
              })}
            </g>
          )
        })}

        {/* x-axis labels */}
        {entries.map(([date], i) => {
          if (!labelIndices.has(i)) return null
          const cx = pad.l + slotW * (i + 0.5)
          return (
            <text
              key={`l-${date}`}
              x={cx}
              y={H - pad.b + 18}
              fontSize="10"
              textAnchor="middle"
              fill="var(--p-text-faint)"
            >
              {date.slice(5)}
            </text>
          )
        })}
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 18, fontSize: 11, color: 'var(--p-text-muted)', justifyContent: 'center', marginTop: 6 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, background: '#10B981', borderRadius: 2 }} /> Delivered
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, background: '#EF4444', borderRadius: 2 }} /> Failed
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, background: 'rgba(148,163,184,0.55)', borderRadius: 2 }} /> Pending
        </span>
      </div>
    </div>
  )
}

function SectionHeader({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <h3 style={{ margin: 0, color: 'var(--p-text)', fontSize: 14, fontWeight: 700 }}>{title}</h3>
      {subtitle && <div style={{ marginTop: 2, fontSize: 12, color: 'var(--p-text-faint)' }}>{subtitle}</div>}
    </div>
  )
}

function Panel({ children, style }) {
  return (
    <div style={{ background: 'var(--p-card)', border: '1px solid var(--p-border)', borderRadius: 12, padding: 16, ...(style || {}) }}>
      {children}
    </div>
  )
}

export default function PortalReports() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [stops, setStops] = useState([])
  const [loading, setLoading] = useState(true)
  const [startDate, setStartDate] = useState(daysAgo(30))
  const [endDate, setEndDate] = useState(getDeliveryDate())
  const [showDriverPerf, setShowDriverPerf] = useState(false)

  const pharmacyName = profile?.pharmacy_name || profile?.pharmacy || 'SHSP'
  const isAdmin = pharmacyName === 'all' || profile?.role === 'dispatcher'

  useEffect(() => {
    async function load() {
      setLoading(true)
      const PAGE = 1000
      const all = []
      let from = 0
      while (true) {
        let q = supabase
          .from('daily_stops')
          .select('*')
          .gte('delivery_date', startDate)
          .lte('delivery_date', endDate)
          .order('delivery_date', { ascending: false })
          .range(from, from + PAGE - 1)
        if (!isAdmin) q = q.eq('pharmacy', pharmacyName)
        const { data, error } = await q
        if (error || !data) break
        all.push(...data)
        if (data.length < PAGE) break
        from += PAGE
        if (from > 100000) break
      }
      setStops(all)
      setLoading(false)
    }
    load()
  }, [pharmacyName, startDate, endDate, isAdmin])

  const stats = useMemo(() => {
    const total = stops.length
    const delivered = stops.filter(s => s.status === 'delivered').length
    const failed = stops.filter(s => STATUS_FAILED(s.status)).length
    const pending = total - delivered - failed
    const withPod = stops.filter(s => s.status === 'delivered' && hasPodEvidence(s)).length
    const podRate = delivered > 0 ? Math.round((withPod / delivered) * 100) : 0
    const cold = stops.filter(s => s.cold_chain).length
    const coldRate = total > 0 ? Math.round((cold / total) * 100) : 0
    const failRate = total > 0 ? Math.round((failed / total) * 100) : 0

    // By day
    const byDay = {}
    stops.forEach(s => {
      const d = s.delivery_date
      if (!d) return
      if (!byDay[d]) byDay[d] = { total: 0, delivered: 0, failed: 0, cold: 0 }
      byDay[d].total += 1
      if (s.status === 'delivered') byDay[d].delivered += 1
      if (STATUS_FAILED(s.status)) byDay[d].failed += 1
      if (s.cold_chain) byDay[d].cold += 1
    })
    const dayCount = Object.keys(byDay).length
    const avgPerDay = dayCount > 0 ? Math.round(total / dayCount) : 0
    const busiestDay = Object.entries(byDay).sort((a, b) => b[1].total - a[1].total)[0]

    // Day of week pattern
    const byDow = [0, 0, 0, 0, 0, 0, 0]
    Object.entries(byDay).forEach(([d, v]) => {
      const dow = new Date(d + 'T12:00:00').getDay()
      byDow[dow] += v.total
    })

    // By driver
    const byDriver = {}
    stops.forEach(s => {
      const k = s.driver_name || '— unassigned'
      if (!byDriver[k]) byDriver[k] = { total: 0, delivered: 0, failed: 0, cold: 0, withPod: 0 }
      byDriver[k].total += 1
      if (s.status === 'delivered') byDriver[k].delivered += 1
      if (STATUS_FAILED(s.status)) byDriver[k].failed += 1
      if (s.cold_chain) byDriver[k].cold += 1
      if (s.status === 'delivered' && hasPodEvidence(s)) byDriver[k].withPod += 1
    })
    const driverRows = Object.entries(byDriver).sort((a, b) => b[1].total - a[1].total)
    const topDriver = driverRows[0]

    // By zip
    const byZip = {}
    stops.forEach(s => {
      const z = (s.zip || '').toString().slice(0, 5)
      if (!z) return
      if (!byZip[z]) byZip[z] = { total: 0, delivered: 0, city: s.city || '' }
      byZip[z].total += 1
      if (s.status === 'delivered') byZip[z].delivered += 1
      if (!byZip[z].city && s.city) byZip[z].city = s.city
    })
    const zipRows = Object.entries(byZip).sort((a, b) => b[1].total - a[1].total).slice(0, 10)

    return {
      total, delivered, failed, pending, withPod, podRate, cold, coldRate, failRate,
      avgPerDay, busiestDay, byDay, byDow, driverRows, topDriver, zipRows,
    }
  }, [stops])

  function exportCSV() {
    if (stops.length === 0) return
    const headers = ['Date', 'Patient', 'Address', 'City', 'Zip', 'Driver', 'Status', 'Cold Chain', 'Delivered At', 'Notes']
    const rows = stops.map(s => [
      s.delivery_date || '',
      s.patient_name || '',
      s.address || '',
      s.city || '',
      s.zip || '',
      s.driver_name || '',
      s.status || '',
      s.cold_chain ? 'Yes' : '',
      s.delivered_at || '',
      s.delivery_note || '',
    ])
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cnc-deliveries-${startDate}-to-${endDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const dows = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const maxDow = Math.max(...stats.byDow, 1)

  return (
    <PortalShell title="Reports">
      <div className="portal-filters">
        <div className="portal-filter-group">
          <span className="portal-filter-label">Start Date</span>
          <input type="date" className="portal-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div className="portal-filter-group">
          <span className="portal-filter-label">End Date</span>
          <input type="date" className="portal-input" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
        <div className="portal-filter-group" style={{ alignSelf: 'flex-end' }}>
          <button className="portal-btn" onClick={exportCSV} disabled={stops.length === 0}>Export CSV</button>
        </div>
      </div>

      {loading ? (
        <div className="portal-loading">Loading report...</div>
      ) : (
        <>
          {/* TOP KPIs */}
          <div className="portal-report-summary">
            <div className="portal-stat-card">
              <div className="portal-stat-label">Total Deliveries</div>
              <div className="portal-stat-value">{stats.total.toLocaleString()}</div>
              <div style={{ fontSize: 11, color: 'var(--p-text-faint)', marginTop: 4 }}>{stats.avgPerDay}/day avg</div>
            </div>
            <div className="portal-stat-card">
              <div className="portal-stat-label">Delivered</div>
              <div className="portal-stat-value" style={{ color: '#10B981' }}>{stats.delivered.toLocaleString()}</div>
              <div style={{ fontSize: 11, color: 'var(--p-text-faint)', marginTop: 4 }}>
                {stats.total > 0 ? Math.round((stats.delivered / stats.total) * 100) : 0}% of total
              </div>
            </div>
            <div className="portal-stat-card">
              <div className="portal-stat-label">Failed</div>
              <div className="portal-stat-value" style={{ color: '#EF4444' }}>{stats.failed.toLocaleString()}</div>
              <div style={{ fontSize: 11, color: 'var(--p-text-faint)', marginTop: 4 }}>{stats.failRate}% fail rate</div>
            </div>
            <div className="portal-stat-card">
              <div className="portal-stat-label">POD Capture Rate</div>
              <div className="portal-stat-value">{stats.podRate}%</div>
              <div style={{ fontSize: 11, color: 'var(--p-text-faint)', marginTop: 4 }}>{stats.withPod.toLocaleString()} with photo/sig</div>
            </div>
            <div className="portal-stat-card">
              <div className="portal-stat-label">Cold Chain</div>
              <div className="portal-stat-value" style={{ color: '#60A5FA' }}>{stats.cold.toLocaleString()}</div>
              <div style={{ fontSize: 11, color: 'var(--p-text-faint)', marginTop: 4 }}>{stats.coldRate}% of total</div>
            </div>
            <div className="portal-stat-card">
              <div className="portal-stat-label">Busiest Day</div>
              <div className="portal-stat-value" style={{ fontSize: '1rem' }}>
                {stats.busiestDay ? `${stats.busiestDay[0]}` : '-'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--p-text-faint)', marginTop: 4 }}>
                {stats.busiestDay ? `${stats.busiestDay[1].total} deliveries` : ''}
              </div>
            </div>
          </div>

          {/* VOLUME CHART */}
          {stats.total > 0 && (
            <Panel style={{ marginBottom: 18 }}>
              <SectionHeader title="Daily Volume" subtitle={`${Object.keys(stats.byDay).length} days · stacked by status`} />
              <VolumeChart byDay={stats.byDay} />
            </Panel>
          )}

          {/* TWO-COL: Day-of-week + Top zips */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
            <Panel>
              <SectionHeader title="By Day of Week" subtitle="Total deliveries per weekday" />
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 110, marginTop: 8 }}>
                {dows.map((label, i) => (
                  <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ fontSize: 10, color: 'var(--p-text-faint)' }}>{stats.byDow[i]}</div>
                    <div
                      title={`${label}: ${stats.byDow[i]}`}
                      style={{
                        width: '100%',
                        height: `${(stats.byDow[i] / maxDow) * 80}px`,
                        background: '#0A2463',
                        borderRadius: 4,
                        minHeight: 2,
                        opacity: stats.byDow[i] > 0 ? 1 : 0.2,
                      }}
                    />
                    <div style={{ fontSize: 11, color: 'var(--p-text-muted)' }}>{label}</div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel>
              <SectionHeader title="Top ZIP Codes" subtitle="Top 10 zips by volume in this range" />
              {stats.zipRows.length === 0 ? (
                <div style={{ color: 'var(--p-text-faint)', fontSize: 13, padding: '12px 0' }}>No ZIPs available.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {stats.zipRows.map(([zip, v]) => {
                    const max = stats.zipRows[0][1].total
                    const pct = (v.total / max) * 100
                    return (
                      <div key={zip} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 60px', alignItems: 'center', gap: 8, fontSize: 12 }}>
                        <span style={{ fontWeight: 700, color: 'var(--p-text)' }}>{zip}</span>
                        <div style={{ position: 'relative', height: 18, background: 'var(--p-bg)', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: '#60A5FA', opacity: 0.6 }} />
                          <span style={{ position: 'relative', paddingLeft: 8, color: 'var(--p-text-secondary)', lineHeight: '18px', fontSize: 11 }}>
                            {v.city || ''}
                          </span>
                        </div>
                        <span style={{ textAlign: 'right', color: 'var(--p-text)', fontWeight: 600 }}>{v.total}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </Panel>
          </div>

          {/* DRIVER LEADERBOARD — collapsible, default hidden */}
          {stats.driverRows.length > 0 && (
            <Panel style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <SectionHeader
                  title="Driver Performance"
                  subtitle={`${stats.driverRows.length} drivers active · optional view`}
                />
                <button
                  onClick={() => setShowDriverPerf(s => !s)}
                  style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, border: '1px solid var(--p-border)', borderRadius: 6, background: 'transparent', color: 'var(--p-text-secondary)', cursor: 'pointer' }}
                >
                  {showDriverPerf ? 'Hide' : 'Show'}
                </button>
              </div>
              {showDriverPerf && (
                <div style={{ overflowX: 'auto', marginTop: 12 }}>
                  <table className="portal-table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th>Driver</th>
                        <th style={{ textAlign: 'right' }}>Total</th>
                        <th style={{ textAlign: 'right' }}>Delivered</th>
                        <th style={{ textAlign: 'right' }}>Failed</th>
                        <th style={{ textAlign: 'right' }}>Cold Chain</th>
                        <th style={{ textAlign: 'right' }}>POD %</th>
                        <th style={{ textAlign: 'right' }}>Success %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.driverRows.map(([name, v]) => {
                        const podPct = v.delivered > 0 ? Math.round((v.withPod / v.delivered) * 100) : 0
                        const successPct = v.total > 0 ? Math.round((v.delivered / v.total) * 100) : 0
                        return (
                          <tr key={name}>
                            <td style={{ fontWeight: 600, color: 'var(--p-text)' }}>{name}</td>
                            <td style={{ textAlign: 'right' }}>{v.total}</td>
                            <td style={{ textAlign: 'right', color: '#10B981' }}>{v.delivered}</td>
                            <td style={{ textAlign: 'right', color: v.failed > 0 ? '#EF4444' : 'var(--p-text-faint)' }}>{v.failed}</td>
                            <td style={{ textAlign: 'right', color: v.cold > 0 ? '#60A5FA' : 'var(--p-text-faint)' }}>{v.cold}</td>
                            <td style={{ textAlign: 'right' }}>{podPct}%</td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>{successPct}%</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          )}

          {/* CTA — drill into the records via Deliveries page */}
          {stops.length === 0 ? (
            <div className="portal-empty">
              <div className="portal-empty-icon">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5">
                  <rect x="8" y="18" width="6" height="20" rx="1" />
                  <rect x="18" y="10" width="6" height="28" rx="1" />
                  <rect x="28" y="14" width="6" height="24" rx="1" />
                  <rect x="38" y="6" width="6" height="32" rx="1" />
                </svg>
              </div>
              <div className="portal-empty-title">No Data</div>
              <div className="portal-empty-sub">No deliveries found for the selected date range.</div>
            </div>
          ) : (
            <Panel style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ margin: 0, color: 'var(--p-text)', fontSize: 15, fontWeight: 700 }}>
                  Need to find a specific delivery?
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--p-text-faint)' }}>
                  Search and view {stops.length.toLocaleString()} records in this range from the Deliveries page.
                </p>
              </div>
              <button
                className="portal-btn-primary"
                onClick={() => navigate(`/portal/deliveries?start=${startDate}&end=${endDate}`)}
                style={{ padding: '10px 18px', fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                Open in Deliveries
                <span style={{ fontSize: 16 }}>→</span>
              </button>
            </Panel>
          )}
        </>
      )}
    </PortalShell>
  )
}
