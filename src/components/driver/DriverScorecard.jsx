import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import './DriverScorecard.css'

export default function DriverScorecard({ driverName, deliveryDate }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!driverName) return
    fetchStats()
  }, [driverName])

  async function fetchStats() {
    setLoading(true)
    try {
      // Last 30 days
      const endDate = deliveryDate || new Date().toISOString().slice(0, 10)
      const start = new Date(endDate + 'T12:00:00')
      start.setDate(start.getDate() - 30)
      const startDate = start.toISOString().slice(0, 10)

      const { data: stops } = await supabase
        .from('daily_stops')
        .select('delivery_date, status, delivered_at, photo_url, photo_urls')
        .eq('driver_name', driverName)
        .gte('delivery_date', startDate)
        .lte('delivery_date', endDate)

      if (!stops || stops.length === 0) {
        setStats(null)
        setLoading(false)
        return
      }

      const total = stops.length
      const delivered = stops.filter(s => s.status === 'delivered').length
      const failed = stops.filter(s => s.status === 'failed').length
      const completionRate = total > 0 ? Math.round(((delivered + failed) / total) * 100) : 0

      // Photo compliance: delivered stops that have at least one photo
      const deliveredStops = stops.filter(s => s.status === 'delivered')
      const withPhotos = deliveredStops.filter(s =>
        (s.photo_urls && Array.isArray(s.photo_urls) && s.photo_urls.length > 0) || s.photo_url
      ).length
      const photoCompliance = deliveredStops.length > 0 ? Math.round((withPhotos / deliveredStops.length) * 100) : 0

      // Average delivery time spread
      const deliveredTimes = deliveredStops
        .filter(s => s.delivered_at)
        .map(s => new Date(s.delivered_at))
        .sort((a, b) => a - b)

      let avgDeliveryTime = '--'
      if (deliveredTimes.length >= 2) {
        const earliest = deliveredTimes[0]
        const latest = deliveredTimes[deliveredTimes.length - 1]
        const spreadHours = (latest - earliest) / (1000 * 60 * 60)
        avgDeliveryTime = spreadHours.toFixed(1) + 'h'
      }

      // On-time: delivered before 6 PM
      const onTime = deliveredStops.filter(s => {
        if (!s.delivered_at) return false
        const dt = new Date(s.delivered_at)
        return dt.getHours() < 18
      }).length
      const onTimeRate = deliveredStops.length > 0 ? Math.round((onTime / deliveredStops.length) * 100) : 0

      // Current streak: consecutive days with 100% completion
      const byDate = {}
      stops.forEach(s => {
        if (!byDate[s.delivery_date]) byDate[s.delivery_date] = { total: 0, completed: 0 }
        byDate[s.delivery_date].total++
        if (s.status === 'delivered' || s.status === 'failed') byDate[s.delivery_date].completed++
      })
      const dates = Object.keys(byDate).sort().reverse()
      let streak = 0
      for (const d of dates) {
        if (byDate[d].completed === byDate[d].total) {
          streak++
        } else {
          break
        }
      }

      setStats({
        completionRate,
        photoCompliance,
        avgDeliveryTime,
        onTimeRate,
        totalDeliveries: delivered,
        streak,
      })
    } catch (err) {
      console.error('Scorecard error:', err)
      setStats(null)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="scorecard__loading">
        <div className="dispatch__spinner" />
        <p>Loading stats...</p>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="scorecard__empty">
        <h3>No delivery data</h3>
        <p>Stats will appear after you start making deliveries.</p>
      </div>
    )
  }

  const metrics = [
    { label: 'Completion Rate', value: stats.completionRate + '%', pct: stats.completionRate, color: '#16a34a' },
    { label: 'Photo Compliance', value: stats.photoCompliance + '%', pct: stats.photoCompliance, color: '#2563eb' },
    { label: 'Delivery Spread', value: stats.avgDeliveryTime, pct: null, color: '#7c3aed' },
    { label: 'On-Time Rate', value: stats.onTimeRate + '%', pct: stats.onTimeRate, color: '#ea580c' },
    { label: 'Total Deliveries', value: stats.totalDeliveries, pct: null, color: '#0d9488' },
    { label: 'Day Streak', value: stats.streak + 'd', pct: Math.min(stats.streak * 10, 100), color: '#db2777' },
  ]

  return (
    <div className="scorecard">
      <h3 className="scorecard__title">30-Day Scorecard</h3>
      <div className="scorecard__grid">
        {metrics.map((m, i) => (
          <div key={i} className="scorecard__item">
            <span className="scorecard__value" style={{ color: m.color }}>{m.value}</span>
            <span className="scorecard__label">{m.label}</span>
            {m.pct !== null && (
              <div className="scorecard__bar">
                <div
                  className="scorecard__bar-fill"
                  style={{ '--bar-width': m.pct + '%', '--bar-color': m.color }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
