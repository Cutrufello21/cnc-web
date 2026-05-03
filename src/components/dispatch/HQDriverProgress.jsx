const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtDate(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  return `${MONTHS[+m - 1]} ${+d}`
}

export default function HQDriverProgress({
  liveProgress,
  volumeChart,
  leaderboard,
  recentLogs,
  tableSort,
  setTableSort,
  expandedRow,
  setExpandedRow,
  hoveredBar,
  setHoveredBar,
}) {
  const maxVolume = Math.max(...(volumeChart?.map(d => d.orders) || [1]))
  const maxLeaderboard = leaderboard?.[0]?.weekTotal || 1
  const avg = volumeChart?.length ? Math.round(volumeChart.reduce((s, v) => s + v.orders, 0) / volumeChart.length) : 0

  const hasCC = recentLogs.some(l => (l.cold_chain || 0) > 0)
  const hasUnassigned = recentLogs.some(l => (l.unassigned_count || 0) > 0)

  return (
    <>
      <div className="hq__grid">
        {/* --- VOLUME TREND --- */}
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

        {/* --- DRIVER LEADERBOARD --- */}
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
                    {driverLive && driverLive.done > 0 ? <><span style={{ color: '#27AE60', fontSize: 11 }}>{driverLive.done}</span>/<strong>{d.weekTotal}</strong></> : <strong>{d.weekTotal}</strong>}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* --- THIS WEEK'S DISPATCHES --- */}
        <div className="hq__card hq__card--wide">
          <h3 className="hq__card-title">This Week's Dispatches</h3>
          {recentLogs.length === 0 ? (
            <p style={{ color: '#9BA5B4', fontSize: 14 }}>No dispatches this week yet</p>
          ) : <DispatchTable
                recentLogs={recentLogs}
                hasCC={hasCC}
                hasUnassigned={hasUnassigned}
                tableSort={tableSort}
                setTableSort={setTableSort}
                expandedRow={expandedRow}
                setExpandedRow={setExpandedRow}
              />
          }
        </div>
      </div>

      {/* --- DRIVER MILEAGE (bottom of page) --- */}
      {liveProgress && Object.keys(liveProgress.driverMap).length > 0 && (() => {
        const driversWithMiles = Object.entries(liveProgress.driverMap)
          .filter(([, d]) => d.miles > 0)
          .sort((a, b) => b[1].miles - a[1].miles)
        if (driversWithMiles.length === 0) return null
        const totalMiles = driversWithMiles.reduce((s, [, d]) => s + d.miles, 0)
        const maxMiles = driversWithMiles[0]?.[1]?.miles || 1
        return (
          <div className="hq__card" style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 className="hq__card-title" style={{ margin: 0 }}>Driver Mileage</h3>
              <span style={{ fontSize: 11, color: '#0A2463', fontWeight: 700 }}>{Math.round(totalMiles)} mi total</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {driversWithMiles.map(([name, d]) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ minWidth: 70, fontSize: 12, fontWeight: 600, color: '#374151', textAlign: 'right' }}>{name}</span>
                  <div style={{ flex: 1, height: 10, background: '#f1f5f9', borderRadius: 5, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(d.miles / maxMiles) * 100}%`, background: 'linear-gradient(90deg, #0A2463, #60A5FA)', borderRadius: 5, transition: 'width 0.4s ease' }} />
                  </div>
                  <span style={{ minWidth: 45, textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#374151' }}>{Math.round(d.miles)} mi</span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}
    </>
  )
}

function DispatchTable({ recentLogs, hasCC, hasUnassigned, tableSort, setTableSort, expandedRow, setExpandedRow }) {
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
              {tableSort.col === c.key && <span className="hq__sort-arrow">{tableSort.dir === 'asc' ? ' \u2191' : ' \u2193'}</span>}
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
}
