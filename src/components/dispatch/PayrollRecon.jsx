import { dbUpdate } from '../../lib/db'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

export default function PayrollRecon({ drivers, reconApproved, setReconApproved, loadPayroll }) {
  const withRecon = (drivers || []).filter(d => d.recon && Object.keys(d.recon).length > 0)
  if (withRecon.length === 0) return null

  async function approveDriver(name, recon) {
    const ids = Object.values(recon).filter(r => r.id).map(r => r.id)
    for (const id of ids) {
      await dbUpdate('stop_reconciliation', { approved: true }, { id })
    }

    const driver = drivers.find(d => d.name === name)
    if (driver) {
      const dayFieldMap = { Mon: 'Mon', Tue: 'Tue', Wed: 'Wed', Thu: 'Thu', Fri: 'Fri' }
      for (const [day, field] of Object.entries(dayFieldMap)) {
        if (recon[day]?.actual != null) {
          await fetch('/api/payroll', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ driverRow: driver.rowIndex, field, value: recon[day].actual }),
          })
        }
      }
    }

    setReconApproved(prev => ({ ...prev, [name]: true }))
    await loadPayroll()
  }

  return (
    <div className="pay__recon">
      <h3 className="pay__recon-title">Driver Reconciliation ({withRecon.length} of {drivers.length} submitted)</h3>
      <p className="pay__recon-sub">Drivers reported their actual stop counts. Review and approve below.</p>
      <div className="pay__recon-table-wrap">
        <table className="pay__recon-table">
          <thead>
            <tr>
              <th>Driver</th>
              {DAYS.map(d => <th key={d}>{d}</th>)}
              <th>Diff</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {withRecon.map(d => {
              let totalDisp = 0, totalActual = 0, complete = true
              DAYS.forEach(day => {
                totalDisp += d[day.toLowerCase()] || 0
                if (d.recon[day]?.actual != null) totalActual += d.recon[day].actual
                else complete = false
              })
              const diff = totalActual - totalDisp
              const isApproved = reconApproved[d.name] || (Object.values(d.recon).length > 0 && Object.values(d.recon).every(r => r.approved))

              return (
                <tr key={d.name} className={isApproved ? 'pay__recon-row--approved' : ''}>
                  <td className="pay__recon-name">{d.name}</td>
                  {DAYS.map(day => {
                    const disp = d[day.toLowerCase()] || 0
                    const actual = d.recon[day]?.actual
                    const has = actual != null
                    const dd = has ? actual - disp : null
                    return (
                      <td key={day} className={`pay__recon-num ${!has ? 'pay__recon-empty' : dd === 0 ? 'pay__recon-ok' : dd < 0 ? 'pay__recon-under' : 'pay__recon-over'}`}>
                        {has ? `${actual}` : '—'}
                        {has && dd !== 0 ? <span className="pay__recon-diff"> ({dd > 0 ? '+' : ''}{dd})</span> : ''}
                      </td>
                    )
                  })}
                  <td className={`pay__recon-num ${!complete ? '' : diff === 0 ? 'pay__recon-ok' : diff < 0 ? 'pay__recon-under' : 'pay__recon-over'}`}>
                    {complete ? (diff === 0 ? 'Match' : (diff > 0 ? `+${diff}` : diff)) : 'Pending'}
                  </td>
                  <td>
                    {isApproved
                      ? <span className="pay__recon-approved-tag">Approved</span>
                      : <button className="pay__recon-approve-btn" onClick={() => approveDriver(d.name, d.recon)}>Approve</button>
                    }
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
