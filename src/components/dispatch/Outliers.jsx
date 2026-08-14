import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import './PODRecords.css'

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function defaultRange() {
  const to = new Date()
  to.setDate(to.getDate() + 14)  // include upcoming routes drivers can already flag
  const from = new Date()
  from.setDate(from.getDate() - 29)
  return { from: ymd(from), to: ymd(to) }
}

function csvEscape(v) {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export default function Outliers() {
  const [stops, setStops] = useState([])
  const [loading, setLoading] = useState(true)
  const init = defaultRange()
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [pharmacyFilter, setPharmacyFilter] = useState('all')
  const [driverFilter, setDriverFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('daily_stops')
        .select('id, order_id, delivery_date, driver_name, pharmacy, patient_name, address, city, zip, status, is_outlier, outlier_reason')
        .eq('is_outlier', true)
        .gte('delivery_date', from)
        .lte('delivery_date', to)
        .order('delivery_date', { ascending: false })
        .limit(2000)
      if (cancelled) return
      if (!error && data) setStops(data)
      else setStops([])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [from, to, reloadKey])

  const drivers = useMemo(() => [...new Set(stops.map(s => s.driver_name).filter(Boolean))].sort(), [stops])
  const pharmacies = useMemo(() => [...new Set(stops.map(s => s.pharmacy).filter(Boolean))].sort(), [stops])

  const filtered = useMemo(() => stops.filter(s => {
    if (pharmacyFilter !== 'all' && s.pharmacy !== pharmacyFilter) return false
    if (driverFilter !== 'all' && s.driver_name !== driverFilter) return false
    if (search) {
      const q = search.toLowerCase()
      const hay = `${s.patient_name || ''} ${s.address || ''} ${s.city || ''} ${s.zip || ''} ${s.order_id || ''} ${s.outlier_reason || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  }), [stops, pharmacyFilter, driverFilter, search])

  const byDriver = useMemo(() => {
    const m = {}
    for (const s of filtered) {
      const k = s.driver_name || 'Unassigned'
      m[k] = (m[k] || 0) + 1
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [filtered])

  function exportCsv() {
    const header = ['Date', 'Driver', 'Pharmacy', 'Patient', 'Address', 'City', 'ZIP', 'Status', 'Reason', 'Order ID']
    const rows = filtered.map(s => [
      s.delivery_date || '', s.driver_name || '', s.pharmacy || '',
      s.patient_name || '', s.address || '', s.city || '', s.zip || '',
      s.status || '', s.outlier_reason || '', s.order_id || '',
    ])
    const csv = [header, ...rows].map(r => r.map(csvEscape).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `outliers_${from}_to_${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="pod-records">
      <div className="pod-records__header">
        <div>
          <h2 className="pod-records__title">Outlier Deliveries</h2>
          <p className="pod-records__sub">History of stops drivers flagged as outliers — long detour, address way off, difficult patient, etc.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="pod-records__export"
            style={{ background: '#e2e8f0', color: '#1e293b' }}
            onClick={() => setReloadKey(k => k + 1)}
            title="Reload outliers from Supabase"
          >
            Refresh
          </button>
          <button
            className="pod-records__export"
            disabled={filtered.length === 0}
            onClick={exportCsv}
          >
            Export {filtered.length} as CSV
          </button>
        </div>
      </div>

      <div className="pod-records__filters">
        <div className="pod-records__filter">
          <label>From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div className="pod-records__filter">
          <label>To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <div className="pod-records__filter">
          <label>Pharmacy</label>
          <select value={pharmacyFilter} onChange={e => setPharmacyFilter(e.target.value)}>
            <option value="all">All</option>
            {pharmacies.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="pod-records__filter">
          <label>Driver</label>
          <select value={driverFilter} onChange={e => setDriverFilter(e.target.value)}>
            <option value="all">All</option>
            {drivers.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="pod-records__filter" style={{ flex: 1, minWidth: 220 }}>
          <label>Search</label>
          <input
            type="text"
            placeholder="Patient, address, reason, order ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {byDriver.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {byDriver.slice(0, 12).map(([name, n]) => (
            <span
              key={name}
              style={{
                background: '#fee2e2', color: '#dc2626',
                fontSize: 12, fontWeight: 600,
                padding: '4px 10px', borderRadius: 999,
              }}
              title={`${name}: ${n} outlier${n === 1 ? '' : 's'}`}
            >
              🚩 {name} · {n}
            </span>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#6B7280' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#6B7280', background: '#f8fafc', borderRadius: 12 }}>
          No outlier deliveries in this range.
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: '#f8fafc' }}>
              <tr style={{ textAlign: 'left', color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                <th style={{ padding: '10px 12px' }}>Date</th>
                <th style={{ padding: '10px 12px' }}>Driver</th>
                <th style={{ padding: '10px 12px' }}>Pharmacy</th>
                <th style={{ padding: '10px 12px' }}>Patient</th>
                <th style={{ padding: '10px 12px' }}>Address</th>
                <th style={{ padding: '10px 12px' }}>City</th>
                <th style={{ padding: '10px 12px' }}>ZIP</th>
                <th style={{ padding: '10px 12px' }}>Status</th>
                <th style={{ padding: '10px 12px' }}>Reason</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{s.delivery_date}</td>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', fontWeight: 600 }}>{s.driver_name || '—'}</td>
                  <td style={{ padding: '10px 12px' }}>{s.pharmacy || '—'}</td>
                  <td style={{ padding: '10px 12px' }}>{s.patient_name || '—'}</td>
                  <td style={{ padding: '10px 12px' }}>{s.address || '—'}</td>
                  <td style={{ padding: '10px 12px' }}>{s.city || '—'}</td>
                  <td style={{ padding: '10px 12px' }}>{s.zip || '—'}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600,
                      padding: '2px 8px', borderRadius: 4,
                      background: s.status === 'delivered' ? '#dcfce7' : s.status === 'failed' ? '#fee2e2' : '#e0e7ff',
                      color: s.status === 'delivered' ? '#166534' : s.status === 'failed' ? '#991b1b' : '#3730a3',
                      textTransform: 'capitalize',
                    }}>
                      {s.status || 'dispatched'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#dc2626', maxWidth: 320 }}>
                    {s.outlier_reason ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        🚩 {s.outlier_reason}
                      </span>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>🚩 (no reason)</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
