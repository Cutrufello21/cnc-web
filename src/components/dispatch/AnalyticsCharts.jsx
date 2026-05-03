import { useRef, useEffect } from 'react'

function fmtDate(dateStr) {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length < 3) return dateStr
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[+parts[1] - 1]} ${+parts[2]}`
}

export function BarChart({ data, maxVol, target }) {
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

export function TrendChart({ data, movingAvg, target }) {
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

export function LineChart({ data, color }) {
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

export { fmtDate }
