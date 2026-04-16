import { useState } from 'react'

export default function UnassignedSection({ unassigned, drivers, selectedDay, onRefresh, onDismiss }) {
  const [assigning, setAssigning] = useState(null)

  async function handleAssign(order, driverTabName) {
    if (!driverTabName) return
    setAssigning(order['Order ID'])
    try {
      const res = await fetch('/api/reassign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          day: selectedDay,
          fromDriver: 'Unassigned',
          toDriver: driverTabName,
          orderIds: [order['Order ID'] || order['Order_ID']],
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (onRefresh) setTimeout(onRefresh, 500)
    } catch {
      // Will refresh anyway
    } finally {
      setAssigning(null)
    }
  }

  const driverOptions = drivers?.filter(d => d.tabName) || []

  return (
    <section className="dispatch__section">
      <div className="dispatch__section-header">
        <h2 className="dispatch__section-title dispatch__section-title--warn">
          Unassigned Orders
          <span className="dispatch__section-count dispatch__section-count--warn">
            {unassigned.length}
          </span>
        </h2>
        <button className="dispatch__dismiss" onClick={onDismiss}>Dismiss</button>
      </div>
      <div className="dispatch__table-wrap">
        <table className="dispatch__table">
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Name</th>
              <th>Address</th>
              <th>City</th>
              <th>ZIP</th>
              <th>Status</th>
              <th>Assign To</th>
            </tr>
          </thead>
          <tbody>
            {unassigned.map((u, i) => {
              const oid = u['Order ID'] || u['Order_ID'] || ''
              return (
                <tr key={i}>
                  <td>{oid || '—'}</td>
                  <td>{u['Name'] || u['Patient'] || '—'}</td>
                  <td>{u['Address'] || '—'}</td>
                  <td>{u['City'] || '—'}</td>
                  <td className="dispatch__zip">{u['ZIP'] || '—'}</td>
                  <td>{u['Status'] || '—'}</td>
                  <td>
                    {assigning === oid ? (
                      <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>Moving...</span>
                    ) : (
                      <select
                        className="dispatch__assign-select"
                        defaultValue=""
                        onChange={(e) => handleAssign(u, e.target.value)}
                      >
                        <option value="">Assign...</option>
                        {driverOptions.map(d => (
                          <option key={d.tabName} value={d.tabName}>
                            {d['Driver Name']} ({d.stops})
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
