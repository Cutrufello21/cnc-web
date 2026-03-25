import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import './WeeklyBar.css'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

export default function WeeklyBar({ dailyStops = {}, weekTotal = 0, driverName }) {
  const maxStops = Math.max(...DAY_LABELS.map((d) => dailyStops[d] || 0), 1)
  const [recon, setRecon] = useState({})

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
        ;(data || []).forEach(r => { map[r.day] = { actual: r.actual_stops, locked: r.locked || false, id: r.id } })
        setRecon(map)
      })
  }, [driverName, weekOf])

  function handleActualChange(day, value) {
    setRecon(prev => ({ ...prev, [day]: { ...prev[day], actual: value === '' ? null : value } }))
  }

  async function handleLock(day) {
    const r = recon[day] || {}
    const actual = r.actual
    if (actual == null || actual === '') return

    const row = {
      driver_name: driverName,
      week_of: weekOf,
      day,
      actual_stops: parseInt(actual),
      locked: true,
    }

    if (r.id) {
      await supabase.from('stop_reconciliation').update(row).eq('id', r.id)
    } else {
      const { data } = await supabase.from('stop_reconciliation').insert(row).select('id')
      if (data?.[0]) row.id = data[0].id
    }
    setRecon(prev => ({ ...prev, [day]: { ...prev[day], locked: true, id: row.id || prev[day]?.id } }))
  }

  async function handleUnlock(day) {
    const r = recon[day]
    if (!r?.id) return
    await supabase.from('stop_reconciliation').update({ locked: false }).eq('id', r.id)
    setRecon(prev => ({ ...prev, [day]: { ...prev[day], locked: false } }))
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
            const hasActual = r.actual != null && r.actual !== ''
            const diff = hasActual ? parseInt(r.actual) - dispatched : null
            const locked = r.locked

            return (
              <div className={`weekly__recon-day ${locked ? 'weekly__recon-day--locked' : ''}`} key={day}>
                <span className="weekly__recon-day-label">{day}</span>
                <div className="weekly__recon-row">
                  <span className="weekly__recon-field-label">Dispatched</span>
                  <span className="weekly__recon-dispatched">{dispatched}</span>
                </div>
                <div className="weekly__recon-row">
                  <span className="weekly__recon-field-label">Actual</span>
                  {locked ? (
                    <span className="weekly__recon-dispatched">{r.actual}</span>
                  ) : (
                    <input
                      type="number"
                      className="weekly__recon-input"
                      placeholder="Enter actual"
                      value={hasActual ? r.actual : ''}
                      onChange={(e) => handleActualChange(day, e.target.value)}
                    />
                  )}
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
                {locked ? (
                  <button className="weekly__recon-lock-btn weekly__recon-lock-btn--unlock" onClick={() => handleUnlock(day)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    Locked
                  </button>
                ) : (
                  <button
                    className="weekly__recon-lock-btn"
                    onClick={() => handleLock(day)}
                    disabled={!hasActual}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" />
                    </svg>
                    Lock
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
