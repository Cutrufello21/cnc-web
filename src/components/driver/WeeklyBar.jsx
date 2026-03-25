import { useState, useEffect, useRef } from 'react'
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

  const saveTimers = useRef({})

  function handleActualChange(day, value) {
    const val = value === '' ? null : value
    setRecon(prev => ({ ...prev, [day]: { ...prev[day], actual: val } }))

    // Auto-save with debounce
    clearTimeout(saveTimers.current[day])
    saveTimers.current[day] = setTimeout(() => saveActual(day, val), 600)
  }

  async function saveActual(day, value) {
    const existing = recon[day]
    const row = {
      driver_name: driverName,
      week_of: weekOf,
      day,
      actual_stops: value == null ? null : parseInt(value),
    }

    if (existing?.id) {
      await supabase.from('stop_reconciliation').update(row).eq('id', existing.id)
    } else if (value != null) {
      const { data } = await supabase.from('stop_reconciliation').insert(row).select('id')
      if (data?.[0]) {
        setRecon(prev => ({ ...prev, [day]: { ...prev[day], id: data[0].id } }))
      }
    }
  }

  async function handleLock(day) {
    const r = recon[day] || {}
    const actual = r.actual
    if (actual == null || actual === '') return

    // Save and lock
    if (r.id) {
      await supabase.from('stop_reconciliation').update({ actual_stops: parseInt(actual), locked: true }).eq('id', r.id)
    } else {
      const { data } = await supabase.from('stop_reconciliation').insert({
        driver_name: driverName, week_of: weekOf, day, actual_stops: parseInt(actual), locked: true,
      }).select('id')
      if (data?.[0]) r.id = data[0].id
    }
    setRecon(prev => ({ ...prev, [day]: { ...prev[day], locked: true, id: r.id || prev[day]?.id } }))
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
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className="weekly__recon-input"
                      placeholder="Enter actual"
                      value={hasActual ? r.actual : ''}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9]/g, '')
                        handleActualChange(day, v)
                      }}
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
