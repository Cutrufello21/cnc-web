import './StopDistribution.css'

export default function StopDistribution({ drivers }) {
  const active = drivers?.filter(d => d.stops > 0) || []
  if (active.length === 0) return null

  const totalStops = active.reduce((s, d) => s + d.stops, 0)
  const avg = Math.round(totalStops / active.length)
  const sorted = [...active].sort((a, b) => b.stops - a.stops)

  function getColor(stops) {
    const diff = (stops - avg) / avg
    if (diff > 0.4) return 'sd__seg--over'
    if (diff < -0.4) return 'sd__seg--under'
    return 'sd__seg--ok'
  }

  return (
    <div className="sd">
      <div className="sd__header">
        <span className="sd__title">Stop Distribution</span>
        <span className="sd__avg">{totalStops} total — avg {avg}/driver</span>
      </div>
      <div className="sd__bar">
        {sorted.map(d => {
          const pct = (d.stops / totalStops) * 100
          return (
            <div
              key={d['Driver Name']}
              className={`sd__seg ${getColor(d.stops)}`}
              style={{ width: `${pct}%` }}
              title={`${d['Driver Name']}: ${d.stops} stops`}
            >
              {pct > 4 && <span className="sd__seg-name">{d['Driver Name']}</span>}
              <span className="sd__seg-count">{d.stops}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
