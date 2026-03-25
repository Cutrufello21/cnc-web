import './StopDistribution.css'

export default function StopDistribution({ drivers }) {
  const active = drivers?.filter(d => d.stops > 0) || []
  if (active.length === 0) return null

  const totalStops = active.reduce((s, d) => s + d.stops, 0)
  const avg = Math.round(totalStops / active.length)
  const sorted = [...active].sort((a, b) => b.stops - a.stops)

  function getColor(stops) {
    const diff = Math.abs(stops - avg) / avg
    if (diff > 0.4) return 'sd__seg--red'
    if (diff > 0.2) return 'sd__seg--amber'
    return 'sd__seg--green'
  }

  const overloaded = active.filter(d => (d.stops - avg) / avg > 0.4)
  const underloaded = active.filter(d => (avg - d.stops) / avg > 0.4)

  return (
    <div className="sd">
      <div className="sd__header">
        <span className="sd__title">Stop Distribution</span>
        <span className="sd__avg">avg {avg} stops/driver</span>
      </div>
      <div className="sd__bar">
        {sorted.map(d => (
          <div
            key={d['Driver Name']}
            className={`sd__seg ${getColor(d.stops)}`}
            style={{ width: `${(d.stops / totalStops) * 100}%` }}
            title={`${d['Driver Name']}: ${d.stops} stops`}
          >
            <span className="sd__seg-label">
              {d['Driver Name']}
            </span>
          </div>
        ))}
      </div>
      {(overloaded.length > 0 || underloaded.length > 0) && (
        <div className="sd__flags">
          {overloaded.map(d => (
            <span key={d['Driver Name']} className="sd__flag sd__flag--over">
              {d['Driver Name']} ({d.stops}) — heavy load
            </span>
          ))}
          {underloaded.map(d => (
            <span key={d['Driver Name']} className="sd__flag sd__flag--under">
              {d['Driver Name']} ({d.stops}) — light load
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
