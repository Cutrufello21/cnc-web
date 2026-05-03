import { useState } from 'react'
import { dbUpdate } from '../../lib/db'

export function PendingPanel({ pendingRequests, allTimeOff = [], onClose, showToastMsg, loadData }) {
  const [showAll, setShowAll] = useState(false)

  const resolvedRequests = (allTimeOff || []).filter(r => r.status === 'approved' || r.status === 'denied')
  const displayList = showAll ? [...pendingRequests, ...resolvedRequests] : pendingRequests

  return (
    <div style={{ background: '#fffbeb', border: '1px solid #fbbf24', borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 700, color: '#92400e', fontSize: 14 }}>Time Off Requests</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => setShowAll(!showAll)}
            style={{
              background: showAll ? '#92400e' : 'transparent', color: showAll ? '#fff' : '#92400e',
              border: '1px solid #92400e', borderRadius: 6, padding: '3px 10px',
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {showAll ? 'Show Pending' : 'Show All'}
          </button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#92400e' }}>×</button>
        </div>
      </div>
      {displayList.length === 0 ? (
        <div style={{ padding: '16px 0', fontSize: 13, color: '#92400e', fontWeight: 500 }}>
          {showAll ? 'No time off requests in this window' : 'No pending time off requests'}
        </div>
      ) : displayList.map(r => {
        const dayLabel = new Date(r.date_off + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        const isPending = r.status === 'pending'
        const isApproved = r.status === 'approved'
        const isDenied = r.status === 'denied'
        return (
        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #fde68a' }}>
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 600, color: '#1a1a1a' }}>{r.driver_name}</span>
            <span style={{ color: '#6b7280', fontSize: 13, marginLeft: 8 }}>{dayLabel}</span>
            {r.reason && <span style={{ color: '#9ca3af', fontSize: 12, marginLeft: 8 }}>— {r.reason}</span>}
            {!isPending && (
              <span style={{
                marginLeft: 8, fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                background: isApproved ? '#dcfce7' : '#fee2e2',
                color: isApproved ? '#166534' : '#991b1b',
              }}>
                {isApproved ? 'Approved' : 'Denied'}
              </span>
            )}
          </div>
          {isPending ? (
            <>
              <button onClick={async () => {
                await dbUpdate('time_off_requests', { status: 'approved', reviewed_by: 'Dispatch' }, { id: r.id })
                fetch('/api/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'push_notify', driverNames: [r.driver_name],
                    title: 'Time Off Approved', body: `Your request for ${dayLabel} has been approved.` })
                }).catch(() => {})
                showToastMsg(`${r.driver_name} — ${dayLabel} approved`)
                loadData()
              }} style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Approve</button>
              <button onClick={async () => {
                await dbUpdate('time_off_requests', { status: 'denied', reviewed_by: 'Dispatch' }, { id: r.id })
                fetch('/api/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'push_notify', driverNames: [r.driver_name],
                    title: 'Time Off Denied', body: `Your request for ${dayLabel} has been denied.` })
                }).catch(() => {})
                showToastMsg(`${r.driver_name} — ${dayLabel} denied`)
                loadData()
              }} style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Deny</button>
            </>
          ) : (
            <button onClick={async () => {
              await dbUpdate('time_off_requests', { status: 'pending', reviewed_by: null }, { id: r.id })
              showToastMsg(`${r.driver_name} — ${dayLabel} reopened`)
              loadData()
            }} style={{
              background: 'transparent', color: '#92400e', border: '1px solid #d97706',
              borderRadius: 8, padding: '6px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
            }}>Reopen</button>
          )}
        </div>
        )
      })}
    </div>
  )
}

export function PendingRequestsList({ pendingRequests, showToastMsg, loadData }) {
  if (pendingRequests.length === 0) return null
  return (
    <div className="ops__pending">
      <div className="ops__pending-header">
        <h3>Pending Time Off Requests</h3>
        <span className="ops__pending-count">{pendingRequests.length}</span>
      </div>
      <div className="ops__pending-list">
        {pendingRequests.map(r => {
          const d = new Date(r.date_off + 'T12:00:00')
          const dayLabel = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
          return (
            <div key={r.id} className="ops__pending-row">
              <div className="ops__pending-info">
                <span className="ops__pending-name">{r.driver_name}</span>
                <span className="ops__pending-date">{dayLabel}</span>
                {r.reason && <span className="ops__pending-reason">{r.reason}</span>}
              </div>
              <div className="ops__pending-actions">
                <button className="ops__pending-approve" onClick={async () => {
                  await dbUpdate('time_off_requests', { status: 'approved', reviewed_by: 'Dispatch' }, { id: r.id })
                  fetch('/api/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'push_notify', driverNames: [r.driver_name],
                      title: 'Time Off Approved', body: `Your request for ${dayLabel} has been approved.` })
                  }).catch(() => {})
                  showToastMsg(`${r.driver_name} — ${dayLabel} approved`)
                  loadData()
                }}>Approve</button>
                <button className="ops__pending-deny" onClick={async () => {
                  await dbUpdate('time_off_requests', { status: 'denied', reviewed_by: 'Dispatch' }, { id: r.id })
                  fetch('/api/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'push_notify', driverNames: [r.driver_name],
                      title: 'Time Off Denied', body: `Your request for ${dayLabel} has been denied.` })
                  }).catch(() => {})
                  showToastMsg(`${r.driver_name} — ${dayLabel} denied`)
                  loadData()
                }}>Deny</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
