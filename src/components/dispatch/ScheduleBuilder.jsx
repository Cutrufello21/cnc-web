const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const DAY_COLS = ['mon', 'tue', 'wed', 'thu', 'fri']

const STATES = [
  { key: 'off', on: false, shift: null, pharm: null },
  { key: 'shsp', on: true, shift: 'AM', pharm: 'SHSP' },
  { key: 'aultman', on: true, shift: 'AM', pharm: 'Aultman' },
  { key: 'pm', on: true, shift: 'PM', pharm: 'SHSP' },
  { key: 'ampm', on: true, shift: 'BOTH', pharm: 'SHSP' },
]

export function getCurrentStateIdx(sched, col) {
  const isOn = sched[col] !== false && sched[col] !== 'false' && sched[col] !== 0
  if (!isOn) return 0
  const shift = sched[`${col}_shift`] || 'AM'
  const pharm = sched[`${col}_pharm`] || 'SHSP'
  if (shift === 'PM') return 3
  if (shift === 'BOTH') return 4
  if (pharm === 'Aultman') return 2
  return 1
}

export { STATES }

export default function ScheduleBuilder({ drivers, schedule, saving, onToggle }) {
  return (
    <div className="ops__builder">
      <div className="ops__builder-header">
        <h3>Default Weekly Schedule</h3>
        <span className="ops__builder-hint">Click to cycle: Off → SHSP → Aultman → PM → AM+PM → Off</span>
      </div>
      <div className="ops__builder-grid-wrap">
        <table className="ops__builder-grid">
          <thead><tr>
            <th className="ops__bth">Driver</th>
            {DAY_LABELS.map(d => <th key={d} className="ops__bth-day">{d}</th>)}
          </tr></thead>
          <tbody>
            {drivers.sort((a, b) => a.driver_name.localeCompare(b.driver_name)).map(driver => (
              <tr key={driver.driver_name}>
                <td className="ops__bcell-name">{driver.driver_name}</td>
                {DAY_COLS.map((col, i) => {
                  const sched = schedule[driver.driver_name] || {}
                  const stateIdx = getCurrentStateIdx(sched, col)
                  const state = STATES[stateIdx]
                  const isSav = saving === `${driver.driver_name}|${col}`
                  let cls = !state.on ? '' : state.shift === 'PM' ? 'ops__btn--pm' : state.shift === 'BOTH' ? 'ops__btn--ampm' : state.pharm === 'Aultman' ? 'ops__btn--alt' : 'ops__btn--shsp'
                  const lbl = !state.on ? '—' : state.pharm === 'Aultman' ? 'ALT' : state.shift === 'PM' ? 'PM' : state.shift === 'BOTH' ? 'A+P' : 'SHSP'
                  return <td key={col} className="ops__bcell"><button className={`ops__btn ${cls} ${isSav ? 'ops__btn--saving' : ''}`} onClick={() => onToggle(driver.driver_name, i)} disabled={isSav}>{lbl}</button></td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
