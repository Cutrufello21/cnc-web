import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { dbInsert, dbUpdate } from '../../lib/db'
import PortalShell from '../../components/portal/PortalShell'

const REASONS = [
  'Wrong medication',
  'Patient refused',
  'Recalled lot',
  'Cold pack damaged',
  'Pharmacist callback',
  'Other',
]

const URGENCY = [
  { value: 'asap', label: 'ASAP — interrupt route' },
  { value: 'next_route', label: 'Next route (default)' },
  { value: 'eod', label: 'End of day' },
]

const STATUS_LABELS = {
  pending: { label: 'Pending', color: '#f59e0b' },
  assigned: { label: 'Assigned', color: '#2563eb' },
  picked_up: { label: 'Picked up', color: '#0d9488' },
  returned: { label: 'Returned', color: '#16a34a' },
  cancelled: { label: 'Cancelled', color: '#94a3b8' },
}

export default function PortalPickups() {
  const { profile } = useAuth()
  const pharmacyName = profile?.pharmacy_name || profile?.pharmacy || 'SHSP'
  const isAdmin = pharmacyName === 'all' || profile?.role === 'dispatcher'

  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Form state
  const [addrSearch, setAddrSearch] = useState('')
  const [addrResults, setAddrResults] = useState([])
  const [picked, setPicked] = useState(null) // { address, city, zip, lat, lng }
  const [patient, setPatient] = useState('')
  const [reason, setReason] = useState(REASONS[0])
  const [reasonDetail, setReasonDetail] = useState('')
  const [urgency, setUrgency] = useState('next_route')

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('pickup_requests').select('*').order('created_at', { ascending: false }).limit(100)
    if (!isAdmin) q = q.eq('pharmacy', pharmacyName)
    const { data, error: e } = await q
    if (e) setError(e.message)
    setRequests(data || [])
    setLoading(false)
  }, [isAdmin, pharmacyName])

  useEffect(() => { load() }, [load])

  // Mapbox autocomplete for the pickup address
  async function searchAddress(text) {
    setAddrSearch(text)
    if (text.length < 4) { setAddrResults([]); return }
    try {
      const token = import.meta.env.VITE_MAPBOX_TOKEN
      const r = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(text)}.json?proximity=-81.38,40.80&country=US&types=address&limit=5&access_token=${token}`)
      const d = await r.json()
      setAddrResults(d.features || [])
    } catch {}
  }

  function pickAddress(f) {
    const [lng, lat] = f.center
    const ctx = f.context || []
    const city = ctx.find(c => c.id?.startsWith('place'))?.text || ''
    const zip = ctx.find(c => c.id?.startsWith('postcode'))?.text || ''
    // f.place_name is full "123 Main St, City, State ZIP" — we want just the street part.
    const street = (f.address ? `${f.address} ${f.text}` : f.text) || f.place_name.split(',')[0]
    setPicked({ address: street, city, zip, lat, lng })
    setAddrSearch(f.place_name)
    setAddrResults([])
  }

  async function submit() {
    setError('')
    if (!picked) { setError('Pickup address is required'); return }
    if (!reason) { setError('Reason is required'); return }
    setSubmitting(true)
    try {
      const row = {
        pharmacy: pharmacyName === 'all' ? 'SHSP' : pharmacyName,
        pickup_address: picked.address,
        pickup_city: picked.city,
        pickup_zip: picked.zip,
        pickup_lat: picked.lat,
        pickup_lng: picked.lng,
        patient_name: patient.trim() || null,
        reason,
        reason_detail: reasonDetail.trim() || null,
        urgency,
        requested_by: profile?.email || profile?.id || null,
        status: 'pending',
      }
      await dbInsert('pickup_requests', row)
      // Reset form
      setPicked(null); setAddrSearch(''); setAddrResults([])
      setPatient(''); setReason(REASONS[0]); setReasonDetail(''); setUrgency('next_route')
      setShowForm(false)
      load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function cancel(id) {
    if (!confirm('Cancel this pickup request?')) return
    await dbUpdate('pickup_requests', { status: 'cancelled' }, { id })
    load()
  }

  return (
    <PortalShell title="Pickups">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--p-text)' }}>Pickup Requests</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--p-text-faint)', fontSize: 13 }}>
            Send a driver to retrieve an order and bring it back to the pharmacy.
          </p>
        </div>
        <button
          className="portal-btn-primary"
          onClick={() => setShowForm(s => !s)}
          style={{ padding: '10px 18px', fontSize: 14 }}
        >
          {showForm ? 'Close' : '+ Request Pickup'}
        </button>
      </div>

      {showForm && (
        <div style={{ background: 'var(--p-card)', border: '1px solid var(--p-border)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 14px', color: 'var(--p-text)' }}>New Pickup</h3>

          <label style={lbl}>Pickup Address</label>
          <input
            type="text"
            value={addrSearch}
            onChange={e => searchAddress(e.target.value)}
            placeholder="Start typing address..."
            style={inp}
          />
          {addrResults.length > 0 && (
            <div style={{ background: 'var(--p-bg)', border: '1px solid var(--p-border)', borderRadius: 8, marginTop: 4, maxHeight: 200, overflowY: 'auto' }}>
              {addrResults.map((f, i) => (
                <div key={i} onClick={() => pickAddress(f)} style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--p-border)', fontSize: 14, color: 'var(--p-text)' }}>
                  {f.place_name}
                </div>
              ))}
            </div>
          )}

          <label style={lbl}>Patient Name <span style={{ color: 'var(--p-text-faint)', fontWeight: 400 }}>(optional)</span></label>
          <input type="text" value={patient} onChange={e => setPatient(e.target.value)} placeholder="Recipient or clinic" style={inp} />

          <label style={lbl}>Reason</label>
          <select value={reason} onChange={e => setReason(e.target.value)} style={inp}>
            {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>

          <label style={lbl}>Detail <span style={{ color: 'var(--p-text-faint)', fontWeight: 400 }}>(optional)</span></label>
          <textarea
            value={reasonDetail}
            onChange={e => setReasonDetail(e.target.value)}
            placeholder="Anything dispatch / driver should know"
            rows={3}
            style={{ ...inp, resize: 'vertical', minHeight: 60 }}
          />

          <label style={lbl}>Urgency</label>
          <select value={urgency} onChange={e => setUrgency(e.target.value)} style={inp}>
            {URGENCY.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
          </select>

          {error && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 12 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button onClick={submit} disabled={submitting || !picked} className="portal-btn-primary" style={{ padding: '10px 18px', fontSize: 14 }}>
              {submitting ? 'Submitting...' : 'Submit Request'}
            </button>
            <button onClick={() => { setShowForm(false); setError('') }} className="portal-btn-ghost" style={{ padding: '10px 18px', fontSize: 14 }}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--p-text-faint)' }}>Loading…</div>
      ) : requests.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--p-text-faint)' }}>No pickup requests yet.</div>
      ) : (
        <div style={{ background: 'var(--p-card)', border: '1px solid var(--p-border)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--p-bg)', textAlign: 'left' }}>
                <th style={th}>Created</th>
                {isAdmin && <th style={th}>Pharmacy</th>}
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
              {requests.map(r => {
                const s = STATUS_LABELS[r.status] || { label: r.status, color: '#94a3b8' }
                const created = new Date(r.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                return (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--p-border)' }}>
                    <td style={td}>{created}</td>
                    {isAdmin && <td style={td}>{r.pharmacy}</td>}
                    <td style={td}>
                      <div style={{ fontWeight: 600, color: 'var(--p-text)' }}>{r.pickup_address}</div>
                      <div style={{ color: 'var(--p-text-faint)', fontSize: 12 }}>{[r.pickup_city, r.pickup_zip].filter(Boolean).join(', ')}</div>
                    </td>
                    <td style={td}>{r.patient_name || '—'}</td>
                    <td style={td}>
                      {r.reason}
                      {r.reason_detail && <div style={{ color: 'var(--p-text-faint)', fontSize: 12 }}>{r.reason_detail}</div>}
                    </td>
                    <td style={td}>{r.urgency === 'asap' ? 'ASAP' : r.urgency === 'eod' ? 'EOD' : 'Next route'}</td>
                    <td style={td}>{r.driver_name || <span style={{ color: 'var(--p-text-faint)' }}>—</span>}</td>
                    <td style={td}>
                      <span style={{ background: `${s.color}1a`, color: s.color, padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>{s.label}</span>
                    </td>
                    <td style={td}>
                      {(r.status === 'pending' || r.status === 'assigned') && (
                        <button onClick={() => cancel(r.id)} className="portal-btn-ghost" style={{ padding: '4px 10px', fontSize: 12, color: '#dc2626' }}>Cancel</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </PortalShell>
  )
}

const lbl = { display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--p-text-faint)', letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 12, marginBottom: 4 }
const inp = { width: '100%', padding: '10px 12px', border: '1px solid var(--p-border)', borderRadius: 8, fontSize: 14, color: 'var(--p-text)', background: 'var(--p-bg)' }
const th = { padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--p-text-faint)', textTransform: 'uppercase', letterSpacing: 0.4 }
const td = { padding: '12px 14px', verticalAlign: 'top', color: 'var(--p-text)' }
