import './WeeklyBar.css'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

export default function WeeklyBar({ dailyStops = {}, weekTotal = 0 }) {
  const maxStops = Math.max(...DAY_LABELS.map((d) => dailyStops[d] || 0), 1)

  return (
    <div className="weekly">
      <div className="weekly__header">
        <h3 className="weekly__title">This Week</h3>
        <span className="weekly__total">{weekTotal} total stops</span>
      </div>

      <div className="weekly__chart">
        {DAY_LABELS.map((day) => {
          const count = dailyStops[day] || 0
          const pct = (count / maxStops) * 100

          return (
            <div className="weekly__bar-col" key={day}>
              <span className="weekly__bar-value">{count}</span>
              <div className="weekly__bar-track">
                <div
                  className="weekly__bar-fill"
                  style={{ height: `${Math.max(pct, count > 0 ? 8 : 0)}%` }}
                />
              </div>
              <span className="weekly__bar-label">{day}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
