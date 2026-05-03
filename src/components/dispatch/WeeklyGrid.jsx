import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { dbInsert, dbDelete, dbUpsert } from '../../lib/db'

export default function WeeklyGrid({ drivers, requests, onToggle }) {
  const [weekOffset, setWeekOffset] = useState(0)
  const [saving, setSaving] = useState(null)
  const [schedule, setSchedule] = useState({}) // driverName → { mon, tue, wed, thu, fri }
  const [saveDefault, setSaveDefault] = useState(false)

  const dayCols = ['mon', 'tue', 'wed', 'thu', 'fri']
  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

  // Load default schedule
  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('driver_schedule').select('*')
      const map = {}
      ;(data || []).forEach(r => { map[r.driver_name] = r })
      setSchedule(map)
    }
    load()
  }, [])

  // Calculate week dates
  const now = new Date()
  const monday = new Date(now)
  const dow = monday.getDay()
  monday.setDate(monday.getDate() - (dow === 0 ? 6 : dow - 1) + weekOffset * 7)

  const dates = dayLabels.map((_, i) => {
    const d = new Date(monday)
    d.setDate(d.getDate() + i)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })

  const isThisWeek = weekOffset === 0
  const weekLabel = `${new Date(dates[0] + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — ${new Date(dates[4] + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

  // Build lookup: dateStr → Set of driver names who have a time_off_request
  const offOverrides = {}
  requests.filter(r => r.status === 'approved' || r.status === 'pending').forEach(r => {
    if (!offOverrides[r.date_off]) offOverrides[r.date_off] = new Set()
    offOverrides[r.date_off].add(r.driver_name)
  })

  function findRequest(driverName, dateStr) {
    return requests.find(r => r.driver_name === driverName && r.date_off === dateStr && r.status !== 'denied')
  }

  // Determine if a driver is working on a specific date
  function isWorking(driverName, dateStr, dayIndex) {
    // Check for specific override (time_off_request)
    if (offOverrides[dateStr]?.has(driverName)) return false
    // Check default schedule
    const sched = schedule[driverName]
    if (sched) return sched[dayCols[dayIndex]] !== false
    // No schedule set = working by default
    return true
  }

  // Check if a day is off by default schedule (not a time off request)
  function isDefaultOff(driverName, dayIndex) {
    const sched = schedule[driverName]
    if (!sched) return false
    return sched[dayCols[dayIndex]] === false
  }

  async function handleToggle(driverName, dateStr, dayIndex) {
    setSaving(`${driverName}|${dateStr}`)
    const working = isWorking(driverName, dateStr, dayIndex)
    const defaultOff = isDefaultOff(driverName, dayIndex)
    const hasRequest = !!findRequest(driverName, dateStr)

    if (working) {
      if (defaultOff) {
        // They're working because of an override on a default-off day
        // Remove the override to go back to default (off)
        if (hasRequest) {
          await dbDelete('time_off_requests', { id: findRequest(driverName, dateStr).id })
        }
      } else {
        // Normally working → mark as off with time_off_request
        await dbInsert('time_off_requests', {
          driver_name: driverName, date_off: dateStr,
          reason: 'Day off', status: 'approved', reviewed_by: 'Dispatch',
        })
      }
    } else {
      if (defaultOff && !hasRequest) {
        // Default off, no request — they want to work this day as exception
        // We don't create a time_off_request — instead we need a "work override"
        // For now, toggle the default schedule for this specific day isn't tracked
        // Just skip — default off days stay off unless schedule is changed
      } else if (hasRequest) {
        // Has a time_off_request → remove it to go back to working
        await dbDelete('time_off_requests', { id: findRequest(driverName, dateStr).id })
      }
    }
    setSaving(null)
    onToggle()
  }

  async function handleSaveAsDefault() {
    setSaveDefault(true)
    try {
      // For each driver, save this week's pattern as their default
      for (const name of activeDrivers) {
        const pattern = {}
        dayCols.forEach((col, i) => {
          pattern[col] = isWorking(name, dates[i], i)
        })

        await dbUpsert('driver_schedule', {
          driver_name: name, ...pattern,
        }, 'driver_name')
      }
      // Reload schedule
      const { data } = await supabase.from('driver_schedule').select('*')
      const map = {}
      ;(data || []).forEach(r => { map[r.driver_name] = r })
      setSchedule(map)
    } catch {}
    setSaveDefault(false)
  }

  const activeDrivers = drivers.filter(d => d.driver_name).map(d => d.driver_name).sort()

  return (
    <div className="wg">
      <div className="wg__nav">
        <button className="wg__arrow" onClick={() => setWeekOffset(weekOffset - 1)}>&larr;</button>
        <span className="wg__week-label">{weekLabel}</span>
        <button className="wg__arrow" onClick={() => setWeekOffset(weekOffset + 1)}>&rarr;</button>
        {weekOffset !== 0 && <button className="wg__today" onClick={() => setWeekOffset(0)}>This Week</button>}
        <button className="wg__save-default" onClick={handleSaveAsDefault} disabled={saveDefault}>
          {saveDefault ? 'Saving...' : 'Save as Default'}
        </button>
      </div>

      <div className="wg__grid">
        <div className="wg__header-row">
          <div className="wg__driver-col">Driver</div>
          {dayLabels.map((day, i) => (
            <div key={day} className="wg__day-col">
              <span className="wg__day-name">{day}</span>
              <span className="wg__day-date">{new Date(dates[i] + 'T12:00:00').getDate()}</span>
            </div>
          ))}
        </div>

        {activeDrivers.map(name => (
          <div key={name} className="wg__row">
            <div className="wg__driver-col wg__driver-name">{name}</div>
            {dates.map((dateStr, i) => {
              const working = isWorking(name, dateStr, i)
              const isSaving = saving === `${name}|${dateStr}`
              const hasOverride = offOverrides[dateStr]?.has(name)
              const defaultOff = schedule[name] && schedule[name][dayCols[i]] === false

              return (
                <div key={dateStr} className="wg__day-col" onClick={() => !isSaving && handleToggle(name, dateStr, i)}>
                  <div className={`wg__cell ${working ? 'wg__cell--on' : 'wg__cell--off'} ${isSaving ? 'wg__cell--saving' : ''} ${hasOverride ? 'wg__cell--override' : ''} ${defaultOff && !hasOverride ? 'wg__cell--default-off' : ''}`}>
                    {working ? '✓' : '—'}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <div className="wg__legend">
        <span><span className="wg__legend-on" />Working</span>
        <span><span className="wg__legend-off" />Off</span>
        <span className="wg__legend-hint">Click to toggle · "Save as Default" locks this pattern for future weeks</span>
      </div>
    </div>
  )
}
