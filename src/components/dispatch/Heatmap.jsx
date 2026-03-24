import { useState, useMemo } from 'react'
import './Heatmap.css'

const DAY_COLS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

function getColor(stops) {
  if (!stops || stops === 0) return '#F5F5F7'
  if (stops <= 250) return '#C5D8F8'
  if (stops <= 350) return '#6495ED'
  if (stops <= 400) return '#1E3A8A'
  return '#0A2463'
}

function getTextColor(stops) {
  if (!stops || stops <= 250) return '#6b7280'
  return '#ffffff'
}

export default function Heatmap({ volumeTrend }) {
  const [tooltip, setTooltip] = useState(null)

  // Build weeks grid from volumeTrend data
  const weeks = useMemo(() => {
    if (!volumeTrend?.length) return []

    // Parse dates and group into weeks
    const entries = volumeTrend.map(d => {
      const parts = d.date?.split('/') || []
      let dateObj = null
      if (parts.length === 3) {
        dateObj = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]))
      }
      return { ...d, dateObj }
    }).filter(d => d.dateObj)

    // Group by week (week starting Monday)
    const weekMap = new Map()
    entries.forEach(entry => {
      const d = entry.dateObj
      // Get Monday of this week
      const day = d.getDay()
      const mondayOffset = day === 0 ? -6 : 1 - day
      const monday = new Date(d)
      monday.setDate(d.getDate() + mondayOffset)
      const weekKey = monday.toISOString().slice(0, 10)

      if (!weekMap.has(weekKey)) {
        weekMap.set(weekKey, {
          weekStart: monday,
          weekLabel: `${monday.getMonth() + 1}/${monday.getDate()}`,
          days: {}
        })
      }
      weekMap.get(weekKey).days[entry.day] = entry
    })

    // Convert to array sorted newest first, take last 12 weeks
    return Array.from(weekMap.values())
      .sort((a, b) => b.weekStart - a.weekStart)
      .slice(0, 12)
  }, [volumeTrend])

  if (!weeks.length) return null

  return (
    <div className="hm">
      <div className="hm__header">
        <div>
          <h3 className="hm__title">Delivery Activity</h3>
          <p className="hm__sub">Hover to explore any night</p>
        </div>
      </div>

      <div className="hm__grid-wrap">
        {/* Column headers */}
        <div className="hm__row hm__row--header">
          <div className="hm__week-label" />
          {DAY_SHORT.map(d => (
            <div key={d} className="hm__col-header">{d}</div>
          ))}
        </div>

        {/* Week rows */}
        {weeks.map((week, wi) => (
          <div className="hm__row" key={wi}>
            <div className="hm__week-label">{week.weekLabel}</div>
            {DAY_COLS.map((day, di) => {
              const entry = week.days[day]
              const stops = entry ? (parseInt(entry.orders) || 0) : 0

              return (
                <div
                  key={di}
                  className="hm__cell"
                  style={{
                    background: getColor(stops),
                    color: getTextColor(stops),
                  }}
                  onMouseEnter={(e) => {
                    if (!entry) return
                    const rect = e.currentTarget.getBoundingClientRect()
                    setTooltip({
                      x: rect.left + rect.width / 2,
                      y: rect.top - 8,
                      data: entry,
                      stops,
                    })
                  }}
                  onMouseLeave={() => setTooltip(null)}
                >
                  {stops > 0 && <span className="hm__cell-val">{stops}</span>}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="hm__tooltip"
          style={{
            left: tooltip.x,
            top: tooltip.y,
          }}
        >
          <div className="hm__tip-date">{tooltip.data.day} — {tooltip.data.date}</div>
          <div className="hm__tip-row">
            <span>Total Stops</span>
            <strong>{tooltip.stops}</strong>
          </div>
          <div className="hm__tip-row">
            <span>SHSP</span>
            <strong>{tooltip.data.shsp}</strong>
          </div>
          <div className="hm__tip-row">
            <span>Aultman</span>
            <strong>{tooltip.data.aultman}</strong>
          </div>
          <div className="hm__tip-row">
            <span>Cold Chain</span>
            <strong>{tooltip.data.coldChain}</strong>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="hm__legend">
        <span className="hm__legend-label">Less</span>
        <div className="hm__legend-scale">
          {[
            { color: '#F5F5F7', label: '0' },
            { color: '#C5D8F8', label: '1-250' },
            { color: '#6495ED', label: '251-350' },
            { color: '#1E3A8A', label: '351-400' },
            { color: '#0A2463', label: '400+' },
          ].map((s, i) => (
            <div key={i} className="hm__legend-cell" style={{ background: s.color }} title={s.label} />
          ))}
        </div>
        <span className="hm__legend-label">More</span>
      </div>
    </div>
  )
}
