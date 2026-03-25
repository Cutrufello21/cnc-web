import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import './WeeklyBar.css'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

export default function WeeklyBar({ dailyStops = {}, weekTotal = 0, driverName }) {
  const maxStops = Math.max(...DAY_LABELS.map((d) => dailyStops[d] || 0), 1)
  const [recon, setRecon] = useState({})
  const saveTimers = useRef({})

  // Get the Monday of current week
  const now = new Date()
  const dayOfWeek = now.getDay()
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = new Date(now)
  monday.setDate(now.getDate() + mondayOffset)
  const weekOf = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`

  useEffect(() => {
    if (!driverName) return
    supabase.from('stop_reconciliation').select('*')
      .eq('driver_name', driverName).eq('week_of', weekOf)
      .then(({ data }) => {
        const map = {}
        ;(data || []).forEach(r => { map[r.day] = { actual: r.actual_stops, notes: r.notes || '', id: r.id } })
        setRecon(map)
      })
  }, [driverName, weekOf])

  function handleChange(day, field, value) {
    setRecon(prev => ({
      ...prev,
      [day]: { ...prev[day], [field]: value },
    }))

    // Debounce save
    const key = `${day}-${field}`
    clearTimeout(saveTimers.current[key])
    saveTimers.current[key] = setTimeout(() => saveRecon(day, field, value), 800)
  }

  async function saveRecon(day, field, value) {
    const existing = recon[day]
    const row = {
      driver_name: driverName,
      week_of: weekOf,
      day,
      actual_stops: field === 'actual' ? (value === '' ? null : parseInt(value)) : (existing?.actual === '' ? null : parseInt(existing?.actual) || null),
      notes: field === 'notes' ? value : (existing?.notes || ''),
    }

    if (existing?.id) {
      await supabase.from('stop_reconciliation').update(row).eq('id', existing.id)
    } else {
      const { data } = await supabase.from('stop_reconciliation').insert(row).select('id')
      if (data?.[0]) {
        setRecon(prev => ({ ...prev, [day]: { ...prev[day], id: data[0].id } }))
      }
    }
  }

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

      {/* Reconciliation */}
      <div className="weekly__recon">
        <h4 className="weekly__recon-title">Daily Reconciliation</h4>
        <div className="weekly__recon-grid">
          {DAY_LABELS.map((day) => {
            const dispatched = dailyStops[day] || 0
            const r = recon[day] || {}
            const actual = r.actual
            const hasActual = actual != null && actual !== ''
            const diff = hasActual ? parseInt(actual) - dispatched : null

            return (
              <div className="weekly__recon-day" key={day}>
                <span className="weekly__recon-day-label">{day}</span>
                <div className="weekly__recon-row">
                  <span className="weekly__recon-field-label">Dispatched</span>
                  <span className="weekly__recon-dispatched">{dispatched}</span>
                </div>
                <div className="weekly__recon-row">
                  <span className="weekly__recon-field-label">Actual</span>
                  <input
                    type="number"
                    className="weekly__recon-input"
                    placeholder="Enter actual stops"
                    value={hasActual ? actual : ''}
                    onChange={(e) => handleChange(day, 'actual', e.target.value)}
                  />
                </div>
                <div className="weekly__recon-row">
                  <span className="weekly__recon-field-label">Difference</span>
                  {hasActual ? (
                    <span className={`weekly__recon-diff ${diff === 0 ? 'weekly__recon-diff--ok' : diff < 0 ? 'weekly__recon-diff--under' : 'weekly__recon-diff--over'}`}>
                      {diff === 0 ? '✓' : (diff > 0 ? `+${diff}` : diff)}
                    </span>
                  ) : (
                    <span className="weekly__recon-diff weekly__recon-diff--empty">—</span>
                  )}
                </div>
                <div className="weekly__recon-row">
                  <input
                    type="text"
                    className="weekly__recon-notes"
                    placeholder="Notes"
                    value={r.notes || ''}
                    onChange={(e) => handleChange(day, 'notes', e.target.value)}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
