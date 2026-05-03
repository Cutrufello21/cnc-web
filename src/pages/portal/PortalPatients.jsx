import { useState, useMemo, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import PortalShell from '../../components/portal/PortalShell'
import { getDeliveryDate } from '../../lib/getDeliveryDate'
import { PODModal, getStatusClass, getStatusLabel, formatTime, hasPodEvidence } from './PortalDashboard'

function formatDate(d) {
  if (!d) return '-'
  try {
    return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return d }
}

function daysSince(dateStr) {
  if (!dateStr) return null
  const then = new Date(dateStr + 'T12:00:00')
  const now = new Date()
  return Math.floor((now - then) / (1000 * 60 * 60 * 24))
}

export default function PortalPatients() {
  const { profile } = useAuth()
  const [search, setSearch] = useState('')
  const [stops, setStops] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState(null)
  const [patientStops, setPatientStops] = useState([])
  const [patientLoading, setPatientLoading] = useState(false)
  const [podStop, setPodStop] = useState(null)

  const pharmacyName = profile?.pharmacy_name || profile?.pharmacy || 'SHSP'
  const isAdmin = pharmacyName === 'all' || profile?.role === 'dispatcher'

  // Search across all dates — match all words in any order
  const handleSearch = useCallback(async () => {
    if (!search.trim()) return
    setLoading(true)
    setSearched(true)
    setSelectedPatient(null)
    setPatientStops([])

    // Split search into words, search for each word in patient_name
    const words = search.trim().split(/[\s,]+/).filter(w => w.length > 0)

    let q = supabase
      .from('daily_stops')
      .select('patient_name, address, city, zip, pharmacy, delivery_date, status, cold_chain')
      .order('delivery_date', { ascending: false })
      .limit(5000)

    // Each word must appear somewhere in the name
    for (const word of words) {
      q = q.ilike('patient_name', `%${word}%`)
    }

    if (!isAdmin) q = q.eq('pharmacy', pharmacyName)

    const { data, error } = await q
    if (!error && data) setStops(data)
    else setStops([])
    setLoading(false)
  }, [search, pharmacyName, isAdmin])

  // Normalize patient name for grouping — sort words so "Joel E Huey" and "Huey, Joel E" match
  function normalizeKey(name) {
    return name.toLowerCase().replace(/[,.:]/g, '').split(/\s+/).filter(w => w).sort().join(' ')
  }

  // Group search results into unique patients
  const patients = useMemo(() => {
    const map = {}
    stops.forEach(s => {
      const name = (s.patient_name || '').trim()
      if (!name) return
      const key = normalizeKey(name)
      if (!map[key]) {
        map[key] = {
          name,
          names: new Set(),
          deliveries: 0,
          delivered: 0,
          failed: 0,
          addresses: new Set(),
          pharmacies: new Set(),
          dates: [],
          coldChain: 0,
        }
      }
      map[key].names.add(name)
      map[key].deliveries++
      if (s.status === 'delivered') map[key].delivered++
      if (s.status === 'failed' || s.status === 'attempted') map[key].failed++
      if (s.address) map[key].addresses.add(`${s.address}${s.city ? `, ${s.city}` : ''}${s.zip ? ` ${s.zip}` : ''}`)
      if (s.pharmacy) map[key].pharmacies.add(s.pharmacy)
      if (s.delivery_date) map[key].dates.push(s.delivery_date)
      if (s.cold_chain) map[key].coldChain++
    })

    return Object.values(map)
      .sort((a, b) => b.deliveries - a.deliveries)
  }, [stops])

  // Load full history for a specific patient — match all name words in any order
  const selectPatient = useCallback(async (patient) => {
    setSelectedPatient(patient)
    setPatientLoading(true)

    // Use all unique words across all name variants for this patient
    const allNames = patient.names ? [...patient.names] : [patient.name]
    const allWords = new Set()
    allNames.forEach(n => n.split(/[\s,]+/).filter(w => w.length > 0).forEach(w => allWords.add(w.toLowerCase())))

    // Use the shortest meaningful words to avoid over-filtering
    const words = [...allWords].filter(w => w.length > 1)

    let q = supabase
      .from('daily_stops')
      .select('*')
      .order('delivery_date', { ascending: false })
      .limit(1000)

    for (const word of words) {
      q = q.ilike('patient_name', `%${word}%`)
    }

    if (!isAdmin) q = q.eq('pharmacy', pharmacyName)

    const { data } = await q
    setPatientStops(data || [])
    setPatientLoading(false)
  }, [pharmacyName, isAdmin])

  // Patient summary stats
  const summary = useMemo(() => {
    if (!selectedPatient || patientStops.length === 0) return null
    const dates = patientStops.map(s => s.delivery_date).filter(Boolean).sort()
    const firstDate = dates[0]
    const lastDate = dates[dates.length - 1]
    const lastDelivered = patientStops.find(s => s.status === 'delivered')
    const today = getDeliveryDate()
    const nextPending = [...patientStops].reverse().find(s => s.status !== 'delivered' && s.status !== 'failed' && s.status !== 'attempted' && s.delivery_date >= today)
    const lastFailed = patientStops.find(s => s.status === 'failed' || s.status === 'attempted')

    // Frequency: average days between deliveries
    const deliveredDates = [...new Set(patientStops.filter(s => s.status === 'delivered').map(s => s.delivery_date))].sort()
    let avgDays = null
    if (deliveredDates.length >= 2) {
      const first = new Date(deliveredDates[0] + 'T12:00:00')
      const last = new Date(deliveredDates[deliveredDates.length - 1] + 'T12:00:00')
      avgDays = Math.round((last - first) / (1000 * 60 * 60 * 24) / (deliveredDates.length - 1))
    }

    return { firstDate, lastDate, lastDelivered, nextPending, lastFailed, avgDays, deliveredDates }
  }, [selectedPatient, patientStops])

  return (
    <PortalShell title="Patients">
      {/* Search bar */}
      <div className="portal-search-wrap" style={{ maxWidth: 600, marginBottom: 24 }}>
        <span className="portal-search-icon">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6.5" cy="6.5" r="5" /><path d="M10 10l4.5 4.5" /></svg>
        </span>
        <input
          className="portal-search-input"
          placeholder="Search by patient name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
        />
        {search && (
          <button className="portal-search-clear" onClick={() => { setSearch(''); setStops([]); setSearched(false); setSelectedPatient(null) }}>&times;</button>
        )}
      </div>

      {!searched && !selectedPatient && (
        <div className="portal-empty">
          <div className="portal-empty-icon">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="var(--p-text-faint)" strokeWidth="1.5">
              <circle cx="20" cy="16" r="8" />
              <path d="M6 42c0-8 6.3-14 14-14s14 6 14 14" />
              <circle cx="38" cy="16" r="5" />
              <path d="M34 42c0-5.5 2-9 4-9" />
            </svg>
          </div>
          <div className="portal-empty-title">Patient Lookup</div>
          <div className="portal-empty-sub">Search by patient name to see their full delivery history.</div>
        </div>
      )}

      {loading && <div className="portal-loading">Searching...</div>}

      {/* Patient selected — show detail view */}
      {selectedPatient && (
        <div>
          <button
            className="portal-btn secondary"
            style={{ marginBottom: 16, fontSize: '0.78rem' }}
            onClick={() => setSelectedPatient(null)}
          >
            &larr; Back to results
          </button>

          {/* Patient Card */}
          <div style={{ background: 'var(--p-card)', border: '1px solid var(--p-border)', borderRadius: 10, padding: '20px 24px', marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <h2 style={{ margin: '0 0 4px', fontSize: '1.2rem', fontWeight: 700, color: 'var(--p-text)' }}>{selectedPatient.name}</h2>
                <div style={{ fontSize: '0.8rem', color: 'var(--p-text-muted)' }}>
                  {selectedPatient.deliveries} deliveries &middot; {[...selectedPatient.pharmacies].join(', ')}
                  {summary?.firstDate && <> &middot; Since {formatDate(summary.firstDate)}</>}
                </div>
                {selectedPatient.addresses.size > 0 && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--p-text-faint)', marginTop: 6 }}>
                    {[...selectedPatient.addresses].slice(0, 3).map((a, i) => (
                      <div key={i}>{a}</div>
                    ))}
                    {selectedPatient.addresses.size > 3 && <div>+{selectedPatient.addresses.size - 3} more</div>}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ textAlign: 'center', minWidth: 70 }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#10B981' }}>{selectedPatient.delivered}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--p-text-faint)', textTransform: 'uppercase' }}>Delivered</div>
                </div>
                <div style={{ textAlign: 'center', minWidth: 70 }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, color: selectedPatient.failed > 0 ? '#EF4444' : 'var(--p-text-muted)' }}>{selectedPatient.failed}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--p-text-faint)', textTransform: 'uppercase' }}>Failed</div>
                </div>
                {selectedPatient.coldChain > 0 && (
                  <div style={{ textAlign: 'center', minWidth: 70 }}>
                    <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#60A5FA' }}>{selectedPatient.coldChain}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--p-text-faint)', textTransform: 'uppercase' }}>Cold Chain</div>
                  </div>
                )}
                {summary?.avgDays && (
                  <div style={{ textAlign: 'center', minWidth: 70 }}>
                    <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--p-text)' }}>{summary.avgDays}d</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--p-text-faint)', textTransform: 'uppercase' }}>Avg Freq</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Quick Answers */}
          {summary && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
              {summary.lastDelivered && (
                <div style={{ flex: 1, minWidth: 200, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8, padding: '12px 16px' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#10B981', textTransform: 'uppercase', marginBottom: 4 }}>Last Delivered</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--p-text)', fontWeight: 600 }}>{formatDate(summary.lastDelivered.delivery_date)}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--p-text-muted)' }}>
                    {formatTime(summary.lastDelivered.delivered_at)} by {summary.lastDelivered.driver_name || '-'}
                    {daysSince(summary.lastDelivered.delivery_date) !== null && <> &middot; {daysSince(summary.lastDelivered.delivery_date)} days ago</>}
                  </div>
                </div>
              )}
              {summary.nextPending && (
                <div style={{ flex: 1, minWidth: 200, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: '12px 16px' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#F59E0B', textTransform: 'uppercase', marginBottom: 4 }}>Next Scheduled</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--p-text)', fontWeight: 600 }}>{formatDate(summary.nextPending.delivery_date)}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--p-text-muted)' }}>
                    Assigned to {summary.nextPending.driver_name || 'unassigned'}
                  </div>
                </div>
              )}
              {summary.lastFailed && (
                <div style={{ flex: 1, minWidth: 200, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '12px 16px' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#EF4444', textTransform: 'uppercase', marginBottom: 4 }}>Last Failed</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--p-text)', fontWeight: 600 }}>{formatDate(summary.lastFailed.delivery_date)}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--p-text-muted)' }}>
                    {summary.lastFailed.failure_reason || 'No reason given'} &middot; {summary.lastFailed.driver_name || '-'}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Full History Table */}
          {patientLoading ? (
            <div className="portal-loading">Loading history...</div>
          ) : (
            <div className="portal-table-wrap">
              <table className="portal-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Address</th>
                    <th>Pharmacy</th>
                    <th>Driver</th>
                    <th>Status</th>
                    <th>Time</th>
                    <th>POD</th>
                  </tr>
                </thead>
                <tbody>
                  {patientStops.map(stop => (
                    <tr key={stop.id} style={{ cursor: 'pointer' }} onClick={() => setPodStop(stop)}>
                      <td>{formatDate(stop.delivery_date)}</td>
                      <td>{stop.address || '-'}{stop.city ? `, ${stop.city}` : ''}</td>
                      <td>{stop.pharmacy || '-'}</td>
                      <td>{stop.driver_name || '-'}</td>
                      <td>
                        <span className={`portal-badge ${getStatusClass(stop.status)}`}>
                          {getStatusLabel(stop.status)}
                        </span>
                      </td>
                      <td>{formatTime(stop.delivered_at)}</td>
                      <td>
                        {hasPodEvidence(stop) ? (
                          <button className="portal-pod-btn" onClick={e => { e.stopPropagation(); setPodStop(stop) }}>View</button>
                        ) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {patientStops.length === 0 && (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--p-text-faint)', fontSize: '0.82rem' }}>
                  No delivery records found.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Search results — patient list */}
      {searched && !loading && !selectedPatient && (
        <>
          <div style={{ fontSize: '0.75rem', color: 'var(--p-text-faint)', marginBottom: 12 }}>
            {patients.length} patient{patients.length !== 1 ? 's' : ''} found
          </div>
          {patients.length === 0 ? (
            <div className="portal-empty">
              <div className="portal-empty-title">No patients found</div>
              <div className="portal-empty-sub">Try a different name or check the spelling.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {patients.map((p, i) => {
                const lastDate = p.dates[0]
                const days = daysSince(lastDate)
                return (
                  <div
                    key={i}
                    onClick={() => selectPatient(p)}
                    style={{
                      background: 'var(--p-card)',
                      border: '1px solid var(--p-border)',
                      borderRadius: 10,
                      padding: '14px 20px',
                      cursor: 'pointer',
                      transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--p-text-ghost)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--p-border)'}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--p-text)', marginBottom: 3 }}>{p.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--p-text-faint)' }}>
                          {p.deliveries} deliveries &middot; {[...p.pharmacies].join(', ')}
                          {lastDate && <> &middot; Last: {formatDate(lastDate)}{days !== null && days <= 7 ? ' (recent)' : ''}</>}
                        </div>
                        {p.addresses.size > 0 && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--p-text-faint)', marginTop: 3 }}>
                            {[...p.addresses][0]}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', color: '#10B981', fontWeight: 600 }}>{p.delivered}</span>
                        {p.failed > 0 && <span style={{ fontSize: '0.75rem', color: '#EF4444', fontWeight: 600 }}>{p.failed} failed</span>}
                        {p.coldChain > 0 && <span className="portal-cold-chain">{p.coldChain} CC</span>}
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--p-text-faint)" strokeWidth="1.5"><polyline points="6 3 11 8 6 13" /></svg>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {podStop && <PODModal stop={podStop} onClose={() => setPodStop(null)} />}
    </PortalShell>
  )
}
