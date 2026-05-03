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
    </div>
  )
}
