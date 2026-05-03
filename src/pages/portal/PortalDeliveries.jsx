import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import PortalShell from '../../components/portal/PortalShell'
import { getDeliveryDate } from '../../lib/getDeliveryDate'
import { PODModal, hasPodEvidence, getPhotoUrls, getStatusClass, getStatusLabel, formatTime } from './PortalDashboard'

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('en-CA')
}

export default function PortalDeliveries() {
  const { profile } = useAuth()
  const [searchParams] = useSearchParams()
  const [stops, setStops] = useState([])
  const [confirmations, setConfirmations] = useState({})
  const [loading, setLoading] = useState(true)
  const [podStop, setPodStop] = useState(null)
  const [expandedRow, setExpandedRow] = useState(null)
  const [startDate, setStartDate] = useState(searchParams.get('start') || daysAgo(7))
  const [endDate, setEndDate] = useState(searchParams.get('end') || getDeliveryDate())
  const [search, setSearch] = useState(searchParams.get('q') || '')
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all')
  const [driverFilter, setDriverFilter] = useState(searchParams.get('driver') || 'all')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 100

  const pharmacyName = profile?.pharmacy_name || profile?.pharmacy || 'SHSP'
  const isAdmin = pharmacyName === 'all' || profile?.role === 'dispatcher'

  const loadData = useCallback(async () => {
    setLoading(true)
    // Paginate to get all results
    const allStops = []
    let offset = 0
    while (true) {
      let q = supabase
        .from('daily_stops')
        .select('*')
        .gte('delivery_date', startDate)
        .lte('delivery_date', endDate)
        .order('delivery_date', { ascending: false })
      if (!isAdmin) q = q.eq('pharmacy', pharmacyName)
      const { data, error } = await q
        .order('patient_name', { ascending: true })
        .range(offset, offset + 999)

      if (error || !data || data.length === 0) break
      allStops.push(...data)
      if (data.length < 1000) break
      offset += 1000
    }
    setStops(allStops)
    setPage(0)

    // Batch-fetch confirmations for delivered stops with POD evidence
    const ids = allStops
      .filter(s => hasPodEvidence(s))
      .map(s => String(s.id || s.order_id))
      .filter(Boolean)
    if (ids.length > 0) {
      // Supabase .in() caps URL length — chunk to be safe on large date ranges
      const map = {}
      const CHUNK = 500
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK)
        const { data: confs } = await supabase
          .from('delivery_confirmations')
          .select('stop_id, gps_distance_feet, geofence_overridden, barcode_scanned, barcode_matched, handed_directly')
          .in('stop_id', slice)
        ;(confs || []).forEach(c => { if (!map[c.stop_id]) map[c.stop_id] = c })
      }
      setConfirmations(map)
    } else {
      setConfirmations({})
    }
    setLoading(false)
  }, [pharmacyName, startDate, endDate])

  useEffect(() => { loadData() }, [loadData])

  const drivers = useMemo(() => {
    const set = new Set()
    stops.forEach(s => { if (s.driver_name) set.add(s.driver_name) })
    return Array.from(set).sort()
  }, [stops])

  // Patient delivery counts
  const patientCounts = useMemo(() => {
    const counts = {}
    stops.forEach(s => {
      const name = (s.patient_name || '').trim().toLowerCase()
      if (name) counts[name] = (counts[name] || 0) + 1
    })
    return counts
  }, [stops])

  const filtered = useMemo(() => {
    return stops.filter(s => {
      if (search) {
        const q = search.toLowerCase()
        const matchName = (s.patient_name || '').toLowerCase().includes(q)
        const matchAddr = (s.address || '').toLowerCase().includes(q)
        const matchOrder = String(s.order_id || '').includes(q)
        const matchZip = String(s.zip || '').includes(q)
        if (!matchName && !matchAddr && !matchOrder && !matchZip) return false
      }
      if (statusFilter !== 'all') {
        const cls = getStatusClass(s.status)
        if (statusFilter !== cls) return false
      }
      if (driverFilter !== 'all' && s.driver_name !== driverFilter) return false
      return true
    })
  }, [stops, search, statusFilter, driverFilter])

  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  // Stats
  const deliveredCount = filtered.filter(s => getStatusClass(s.status) === 'delivered').length
  const failedCount = filtered.filter(s => getStatusClass(s.status) === 'failed').length
  const pendingCount = filtered.filter(s => getStatusClass(s.status) === 'pending').length

  return (
    <PortalShell title="Deliveries">
      {/* Search bar — prominent */}
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          className="portal-input"
          placeholder="Search by patient name, address, ZIP, or order ID..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0) }}
          style={{ width: '100%', padding: '12px 16px', fontSize: '0.95rem' }}
        />
      </div>

      <div className="portal-filters">
        <div className="portal-filter-group">
          <span className="portal-filter-label">Start</span>
          <input type="date" className="portal-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div className="portal-filter-group">
          <span className="portal-filter-label">End</span>
          <input type="date" className="portal-input" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
        <div className="portal-filter-group">
          <span className="portal-filter-label">Status</span>
          <select className="portal-select" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0) }}>
            <option value="all">All</option>
            <option value="delivered">Delivered</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        <div className="portal-filter-group">
          <span className="portal-filter-label">Driver</span>
          <select className="portal-select" value={driverFilter} onChange={e => { setDriverFilter(e.target.value); setPage(0) }}>
            <option value="all">All Drivers</option>
            {drivers.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--p-text-muted)' }}>
          {filtered.length} total
        </div>
        <div style={{ fontSize: '0.75rem', color: '#16a34a' }}>
          {deliveredCount} delivered
        </div>
        <div style={{ fontSize: '0.75rem', color: '#f97316' }}>
          {pendingCount} pending
        </div>
        {failedCount > 0 && (
          <div style={{ fontSize: '0.75rem', color: '#dc2626' }}>
            {failedCount} failed
          </div>
        )}
      </div>

      {loading ? (
        <div className="portal-loading">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="portal-empty">No deliveries match your filters.</div>
      ) : (
        <>
          <div className="portal-table-wrap">
            <table className="portal-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Patient</th>
                  <th>Address</th>
                  <th>City</th>
                  <th>Zip</th>
                  <th>Driver</th>
                  <th>Status</th>
                  <th>Time</th>
                  <th>POD</th>
                </tr>
              </thead>
              <tbody>
                {paged.map(stop => {
                  const isExpanded = expandedRow === stop.id
                  const patientKey = (stop.patient_name || '').trim().toLowerCase()
                  const deliveryCount = patientCounts[patientKey] || 0
                  const photos = getPhotoUrls(stop)

                  return (
                    <>
                      <tr
                        key={stop.id}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setExpandedRow(stop.id)}
                      >
                        <td>{stop.delivery_date || '-'}</td>
                        <td>
                          {stop.patient_name || '-'}
                          {stop.cold_chain && (
                            <span style={{ marginLeft: 6, fontSize: '0.65rem', color: '#60A5FA', fontWeight: 700, letterSpacing: 0.4 }}>COLD</span>
                          )}
                          {deliveryCount > 1 && (
                            <span style={{ fontSize: '0.65rem', color: '#60A5FA', marginLeft: 6, fontWeight: 700 }}>
                              {deliveryCount}x
                            </span>
                          )}
                        </td>
                        <td>{stop.address || '-'}</td>
                        <td>{stop.city || '-'}</td>
                        <td>{stop.zip || '-'}</td>
                        <td>{stop.driver_name || '-'}</td>
                        <td>
                          <span className={`portal-badge ${getStatusClass(stop.status)}`}>
                            {getStatusLabel(stop.status)}
                          </span>
                        </td>
                        <td>{formatTime(stop.delivered_at)}</td>
                        <td>
                          {hasPodEvidence(stop) ? (
                            <button className="portal-pod-btn" onClick={e => { e.stopPropagation(); setPodStop(stop) }}>
                              POD
                            </button>
                          ) : <span style={{ color: 'var(--p-text-ghost)' }}>-</span>}
                        </td>
                      </tr>
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16 }}>
              <button
                className="portal-btn-sm"
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
              >
                Previous
              </button>
              <span style={{ fontSize: '0.8rem', color: 'var(--p-text-muted)' }}>
                Page {page + 1} of {totalPages}
              </span>
              <button
                className="portal-btn-sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage(p => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {podStop && <PODModal stop={podStop} onClose={() => setPodStop(null)} />}

      {/* Delivery Detail Modal */}
      {expandedRow && (() => {
        const stop = stops.find(s => s.id === expandedRow)
        if (!stop) return null
        const photos = getPhotoUrls(stop)
        const patientKey = (stop.patient_name || '').trim().toLowerCase()
        const deliveryCount = patientCounts[patientKey] || 0
        const conf = confirmations[String(stop.id || stop.order_id)]
        const photoCount = photos.length
        const handedDirectly = !!conf?.handed_directly
        const photosOk = photoCount >= 2 || (handedDirectly && photoCount >= 1)
        const geoOk = conf && !conf.geofence_overridden && conf.gps_distance_feet != null
        const geoFail = conf && conf.geofence_overridden
        const barcodeOk = conf && conf.barcode_scanned && conf.barcode_matched
        const sigRequired = !!stop.sig_required || (stop.notes || '').toLowerCase().includes('signature')
        const sigOk = !!stop.signature_url
        const isDelivered = getStatusClass(stop.status) === 'delivered'

        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setExpandedRow(null)}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} />
            <div style={{ position: 'relative', background: 'var(--p-card)', borderRadius: 16, padding: 32, maxWidth: 560, width: '90%', maxHeight: '85vh', overflowY: 'auto', border: '1px solid var(--p-border)' }} onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: 'var(--p-text)' }}>{stop.patient_name || 'Unknown'}</h2>
                  <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--p-text-muted)' }}>
                    {stop.address}, {stop.city} {stop.zip}
                  </p>
                  {deliveryCount > 1 && (
                    <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: '#60A5FA', fontWeight: 700 }}>
                      {deliveryCount} deliveries in this period
                    </p>
                  )}
                </div>
                <button onClick={() => setExpandedRow(null)} style={{ background: 'var(--p-border)', border: 'none', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--p-text)', fontSize: 18 }}>✕</button>
              </div>

              {/* Status badge */}
              <div style={{ marginBottom: 16 }}>
                <span className={`portal-badge ${getStatusClass(stop.status)}`} style={{ fontSize: '0.85rem', padding: '6px 14px' }}>
                  {getStatusLabel(stop.status)}
                </span>
              </div>

              {/* Compliance pills */}
              {isDelivered && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 24 }}>
                  <span className={`portal-pod-pill ${photosOk ? 'portal-pod-pill--ok' : 'portal-pod-pill--fail'}`}>
                    {photoCount} Photo{photoCount !== 1 ? 's' : ''}
                  </span>
                  {conf && (
                    <span className={`portal-pod-pill ${geoOk ? 'portal-pod-pill--ok' : 'portal-pod-pill--fail'}`}>
                      Geofence {geoOk ? '✓' : geoFail ? '✗' : '—'}
                    </span>
                  )}
                  {conf && conf.barcode_scanned && (
                    <span className={`portal-pod-pill ${barcodeOk ? 'portal-pod-pill--ok' : 'portal-pod-pill--fail'}`}>
                      Scan {barcodeOk ? '✓' : '✗'}
                    </span>
                  )}
                  {handedDirectly && <span className="portal-pod-pill portal-pod-pill--info">Handed ✓</span>}
                  {(sigRequired || sigOk) && (
                    <span className={`portal-pod-pill ${sigOk ? 'portal-pod-pill--ok' : 'portal-pod-pill--fail'}`}>
                      Signed {sigOk ? '✓' : '✗'}
                    </span>
                  )}
                </div>
              )}

              {/* Info grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
                <div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--p-text-faint)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Order ID</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--p-text)', fontWeight: 600 }}>#{stop.order_id}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--p-text-faint)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Date</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--p-text)' }}>{stop.delivery_date}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--p-text-faint)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Driver</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--p-text)' }}>{stop.driver_name || '-'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--p-text-faint)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Delivered At</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--p-text)' }}>{stop.delivered_at ? new Date(stop.delivered_at).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '-'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--p-text-faint)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Cold Chain</div>
                  <div style={{ fontSize: '0.9rem', color: stop.cold_chain ? '#60A5FA' : 'var(--p-text-muted)' }}>{stop.cold_chain ? 'Yes' : 'No'}</div>
                </div>
                {stop.barcode && (
                  <div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--p-text-faint)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Barcode</div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--p-text)' }}>{stop.barcode}</div>
                  </div>
                )}
                {(stop.lat && stop.lng) && (
                  <div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--p-text-faint)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>GPS Location</div>
                    <a href={`https://maps.google.com/?q=${stop.lat},${stop.lng}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.9rem', color: '#60A5FA', textDecoration: 'none' }}>{stop.lat.toFixed(5)}, {stop.lng.toFixed(5)}</a>
                  </div>
                )}
              </div>

              {/* Failure reason */}
              {stop.failure_reason && (
                <div style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 10, padding: 14, marginBottom: 20 }}>
                  <div style={{ fontSize: '0.65rem', color: '#dc2626', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Failure Reason</div>
                  <div style={{ fontSize: '0.9rem', color: '#fca5a5' }}>{stop.failure_reason}</div>
                </div>
              )}

              {/* Notes */}
              {(stop.delivery_note || stop.notes) && (
                <div style={{ background: 'var(--p-hover)', borderRadius: 10, padding: 14, marginBottom: 20 }}>
                  {stop.delivery_note && (
                    <div style={{ marginBottom: stop.notes ? 12 : 0 }}>
                      <div style={{ fontSize: '0.65rem', color: 'var(--p-text-faint)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Delivery Note</div>
                      <div style={{ fontSize: '0.9rem', color: 'var(--p-text)' }}>{stop.delivery_note}</div>
                    </div>
                  )}
                  {stop.notes && (
                    <div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--p-text-faint)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Order Notes</div>
                      <div style={{ fontSize: '0.9rem', color: 'var(--p-text-secondary)' }}>{stop.notes}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Photos */}
              {photos.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--p-text-faint)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Proof of Delivery</div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {photos.map((url, i) => (
                      <img key={i} src={url} alt="POD" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 10, cursor: 'pointer', border: '1px solid var(--p-border)' }} onClick={() => setPodStop(stop)} />
                    ))}
                  </div>
                </div>
              )}

              {/* Signature */}
              {stop.signature_url && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--p-text-faint)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Signature</div>
                  <img src={stop.signature_url} alt="Signature" style={{ height: 60, borderRadius: 6, background: '#fff', padding: 6 }} />
                </div>
              )}
            </div>
          </div>
        )
      })()}
    </PortalShell>
  )
}
