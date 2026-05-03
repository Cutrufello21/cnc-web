import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

const STATUS_TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'completed', label: 'Completed' },
  { key: 'all', label: 'All' },
]

const STATUS_COLORS = {
  pending: '#f59e0b',
  assigned: '#2563eb',
  picked_up: '#0d9488',
  returned: '#16a34a',
  cancelled: '#94a3b8',
}

export default function Pickups() {
  const [requests, setRequests] = useState([])
  const [drivers, setDrivers] = useState([])
  const [driverLoads, setDriverLoads] = useState({}) // { 'Mike|2026-04-30': 12 }
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('pending')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const today = new Date().toLocaleDateString('en-CA')
    const in7 = new Date(Date.now() + 7 * 86400000).toLocaleDateString('en-CA')
    const [reqRes, drvRes, stopsRes] = await Promise.all([
      supabase.from('pickup_requests').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('drivers').select('driver_name, driver_number, pharmacy, active').eq('active', true).order('driver_name'),
      supabase.from('daily_stops').select('driver_name, delivery_date').gte('delivery_date', today).lte('delivery_date', in7),
    ])
    if (reqRes.error) setError(reqRes.error.message)
    setRequests(reqRes.data || [])
    setDrivers(drvRes.data || [])
    const loads = {}
    ;(stopsRes.data || []).forEach(s => {
      if (!s.driver_name || !s.delivery_date) return
      const k = `${s.driver_name}|${s.delivery_date}`
      loads[k] = (loads[k] || 0) + 1
    })
    setDriverLoads(loads)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Auto-refresh every 45s so new ASAP requests surface without manual refresh
  useEffect(() => {
    const t = setInterval(() => { load() }, 45000)
    return () => clearInterval(t)
  }, [load])

  const filtered = requests
    .filter(r => {
      if (tab === 'all') return true
      if (tab === 'pending') return r.status === 'pending'
      if (tab === 'assigned') return r.status === 'assigned'
      if (tab === 'completed') return r.status === 'picked_up' || r.status === 'returned' || r.status === 'cancelled'
      return true
    })
    .sort((a, b) => {
      // ASAP rows always pin to top within the tab
      const aAsap = a.urgency === 'asap' && a.status !== 'cancelled' && a.status !== 'returned' && a.status !== 'picked_up'
      const bAsap = b.urgency === 'asap' && b.status !== 'cancelled' && b.status !== 'returned' && b.status !== 'picked_up'
      if (aAsap && !bAsap) return -1
      if (!aAsap && bAsap) return 1
      return new Date(b.created_at) - new Date(a.created_at)
    })

  const counts = {
    pending: requests.filter(r => r.status === 'pending').length,
    assigned: requests.filter(r => r.status === 'assigned').length,
    completed: requests.filter(r => ['picked_up', 'returned', 'cancelled'].includes(r.status)).length,
    all: requests.length,
  }

  async function assign(id, driverName, deliveryDate) {
    if (!driverName || !deliveryDate) return
    const r = requests.find(x => x.id === id)
    await fetch('/api/db', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: 'pickup_requests', operation: 'update',
        data: { driver_name: driverName, delivery_date: deliveryDate, status: 'assigned' },
        match: { id },
      }),
    })

    // Notify the driver — push + saved to driver_notifications history
    try {
      const dateLabel = new Date(deliveryDate + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
      })
      const isAsap = r?.urgency === 'asap'
      const titlePrefix = isAsap ? '🚨 ASAP Pickup — ' : 'New Pickup — '
      const patient = r?.patient_name ? ` (${r.patient_name})` : ''
      const where = [r?.pickup_address, r?.pickup_city].filter(Boolean).join(', ')
      await fetch('/api/actions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'push_notify',
          driverNames: [driverName],
          title: `${titlePrefix}${r?.pharmacy || ''}`.trim(),
          body: `${where}${patient} — ${dateLabel}${r?.reason ? ` · ${r.reason}` : ''}`,
        }),
      })
    } catch {}

    load()
  }

  async function unassign(id) {
    await fetch('/api/db', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: 'pickup_requests', operation: 'update',
        data: { driver_name: null, delivery_date: null, status: 'pending' },
        match: { id },
      }),
    })
    load()
  }

  async function cancel(id) {
    if (!confirm('Cancel this pickup request? The pharmacy will see it as cancelled.')) return
    await fetch('/api/db', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: 'pickup_requests', operation: 'update',
        data: { status: 'cancelled' },
        match: { id },
      }),
    })
    load()
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Pickups Inbox</h1>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>Pickup requests from pharmacy staff. Assign a driver + date to push to their route.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: '#6b7280', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />
            Live · auto-refresh 45s
          </span>
          <button onClick={load} className="btn btn-ghost" style={{ fontSize: 13 }}>Refresh</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid #e5e7eb' }}>
        {STATUS_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '10px 16px', fontSize: 13, fontWeight: 600,
              border: 'none', background: 'transparent', cursor: 'pointer',
              color: tab === t.key ? '#0A2463' : '#6b7280',
              borderBottom: tab === t.key ? '2px solid #0A2463' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t.label} <span style={{ background: tab === t.key ? '#0A2463' : '#e5e7eb', color: tab === t.key ? '#fff' : '#6b7280', borderRadius: 10, padding: '1px 8px', fontSize: 11, marginLeft: 4 }}>{counts[t.key]}</span>
          </button>
        ))}
      </div>

      {error && <div style={{ color: '#dc2626', marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#6b7280', background: '#f8fafc', borderRadius: 12 }}>
          No {tab === 'all' ? '' : tab} pickup requests.
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                <th style={th}>Created</th>
                <th style={th}>Pharmacy</th>
                <th style={th}>Pickup</th>
                <th style={th}>Patient</th>
                <th style={th}>Reason</th>
                <th style={th}>Urgency</th>
                <th style={th}>Driver</th>
                <th style={th}>Status</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const created = new Date(r.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                const sColor = STATUS_COLORS[r.status] || '#94a3b8'
                const driverPool = drivers // any active driver — dispatcher can assign cross-pharmacy
                const isAsapActive = r.urgency === 'asap' && r.status !== 'cancelled' && r.status !== 'returned' && r.status !== 'picked_up'
                return (
                  <PickupRow
                    key={r.id}
                    request={r}
                    created={created}
                    sColor={sColor}
                    drivers={driverPool}
                    driverLoads={driverLoads}
                    isAsapActive={isAsapActive}
                    onAssign={assign}
                    onUnassign={unassign}
                    onCancel={cancel}
                  />
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function PickupRow({ request: r, created, sColor, drivers, driverLoads = {}, isAsapActive, onAssign, onUnassign, onCancel }) {
  const [picking, setPicking] = useState(false)
  const [pickDriver, setPickDriver] = useState(r.driver_name || '')
  const todayCa = new Date().toLocaleDateString('en-CA')
  const [pickDate, setPickDate] = useState(r.delivery_date || todayCa)

  return (
    <tr style={{
      borderTop: '1px solid #e5e7eb',
      borderLeft: isAsapActive ? '4px solid #dc2626' : '4px solid transparent',
      background: isAsapActive ? '#fef2f2' : 'transparent',
    }}>
      <td style={td}>{created}</td>
      <td style={td}><span style={{ fontWeight: 600 }}>{r.pharmacy}</span></td>
      <td style={td}>
        <div style={{ fontWeight: 600 }}>{r.pickup_address}</div>
        <div style={{ color: '#6b7280', fontSize: 12 }}>{[r.pickup_city, r.pickup_zip].filter(Boolean).join(', ')}</div>
      </td>
      <td style={td}>{r.patient_name || '—'}</td>
      <td style={td}>
        {r.reason}
        {r.reason_detail && <div style={{ color: '#6b7280', fontSize: 12 }}>{r.reason_detail}</div>}
      </td>
      <td style={td}>
        {r.urgency === 'asap' ? <span style={{ color: '#dc2626', fontWeight: 700 }}>ASAP</span> : r.urgency === 'eod' ? 'EOD' : 'Next route'}
      </td>
      <td style={td}>
        {r.driver_name ? (
          <div>
            <div style={{ fontWeight: 600 }}>{r.driver_name}</div>
            <div style={{ color: '#6b7280', fontSize: 12 }}>{r.delivery_date}</div>
          </div>
        ) : <span style={{ color: '#94a3b8' }}>—</span>}
      </td>
      <td style={td}>
        <span style={{ background: `${sColor}1a`, color: sColor, padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>{r.status}</span>
      </td>
      <td style={td}>
        {r.status === 'pending' && !picking && (
          <button onClick={() => setPicking(true)} className="btn btn-primary" style={{ fontSize: 12, padding: '4px 10px' }}>Assign</button>
        )}
        {r.status === 'pending' && picking && (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <select value={pickDriver} onChange={e => setPickDriver(e.target.value)} style={{ fontSize: 12, padding: '4px 6px', borderRadius: 4, border: '1px solid #cbd5e1', minWidth: 160 }}>
              <option value="">Driver…</option>
              {drivers.map(d => {
                const cnt = driverLoads[`${d.driver_name}|${pickDate}`] || 0
                const ph = d.pharmacy ? ` · ${d.pharmacy}` : ''
                return (
                  <option key={d.driver_name} value={d.driver_name}>
                    {d.driver_name}{ph} ({cnt} stop{cnt === 1 ? '' : 's'})
                  </option>
                )
              })}
            </select>
            <input type="date" value={pickDate} onChange={e => setPickDate(e.target.value)} style={{ fontSize: 12, padding: '4px 6px', borderRadius: 4, border: '1px solid #cbd5e1' }}/>
            <button onClick={() => { onAssign(r.id, pickDriver, pickDate); setPicking(false) }} disabled={!pickDriver} className="btn btn-primary" style={{ fontSize: 12, padding: '4px 10px' }}>OK</button>
            <button onClick={() => setPicking(false)} className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }}>×</button>
          </div>
        )}
        {r.status === 'assigned' && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => onUnassign(r.id)} className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }}>Unassign</button>
            <button onClick={() => onCancel(r.id)} className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px', color: '#dc2626' }}>Cancel</button>
          </div>
        )}
      </td>
    </tr>
  )
}

const th = { padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.4 }
const td = { padding: '12px 14px', verticalAlign: 'top' }
