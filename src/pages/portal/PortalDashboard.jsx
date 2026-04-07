import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import PortalShell from '../../components/portal/PortalShell'

function getStatusClass(status) {
  if (status === 'delivered') return 'delivered'
  if (status === 'failed' || status === 'attempted') return 'failed'
  return 'pending'
}

function getStatusLabel(status) {
  if (status === 'delivered') return 'Delivered'
  if (status === 'failed' || status === 'attempted') return 'Failed'
  return 'Pending'
}

function getPhotoUrls(stop) {
  const urls = []
  if (stop.photo_url) urls.push(stop.photo_url)
  if (stop.photo_urls) {
    try {
      const parsed = typeof stop.photo_urls === 'string' ? JSON.parse(stop.photo_urls) : stop.photo_urls
      if (Array.isArray(parsed)) urls.push(...parsed)
    } catch {}
  }
  return urls
}

function formatTime(dt) {
  if (!dt) return '-'
  try {
    return new Date(dt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  } catch { return '-' }
}

function PODModal({ stop, onClose }) {
  if (!stop) return null
  const photos = getPhotoUrls(stop)

  return (
    <div className="portal-modal-overlay" onClick={onClose}>
      <div className="portal-modal" onClick={e => e.stopPropagation()}>
        <div className="portal-modal-header">
          <span className="portal-modal-title">Proof of Delivery</span>
          <button className="portal-modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="portal-modal-row">
          <span className="portal-modal-label">Patient</span>
          <span className="portal-modal-value">{stop.patient_name || '-'}</span>
        </div>
        <div className="portal-modal-row">
          <span className="portal-modal-label">Address</span>
          <span className="portal-modal-value">{stop.address}{stop.city ? `, ${stop.city}` : ''}{stop.zip ? ` ${stop.zip}` : ''}</span>
        </div>
        <div className="portal-modal-row">
          <span className="portal-modal-label">Driver</span>
          <span className="portal-modal-value">{stop.driver_name || '-'}</span>
        </div>
        <div className="portal-modal-row">
          <span className="portal-modal-label">Time</span>
          <span className="portal-modal-value">{formatTime(stop.delivered_at)}</span>
        </div>
        {(stop.delivery_lat || stop.delivery_lng) && (
          <div className="portal-modal-row">
            <span className="portal-modal-label">GPS</span>
            <span className="portal-modal-value">{stop.delivery_lat}, {stop.delivery_lng}</span>
          </div>
        )}
        {stop.delivery_note && (
          <div className="portal-modal-row">
            <span className="portal-modal-label">Note</span>
            <span className="portal-modal-value">{stop.delivery_note}</span>
          </div>
        )}
        {stop.cold_chain && (
          <div className="portal-modal-row">
            <span className="portal-modal-label">Cold Chain</span>
            <span className="portal-modal-value"><span className="portal-cold-chain">Cold Chain Verified</span></span>
          </div>
        )}

        {photos.length > 0 && (
          <div className="portal-modal-images">
            {photos.map((url, i) => (
              <img key={i} src={url} alt={`POD photo ${i + 1}`} />
            ))}
          </div>
        )}

        {stop.signature_url && (
          <div className="portal-modal-signature" style={{ marginTop: 16 }}>
            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', marginBottom: 6, fontWeight: 500 }}>Signature</div>
            <img src={stop.signature_url} alt="Signature" />
          </div>
        )}
      </div>
    </div>
  )
}

export { PODModal, getPhotoUrls, hasPodEvidence, getStatusClass, getStatusLabel, formatTime }

function hasPodEvidence(stop) {
  if (stop.photo_url) return true
  if (stop.signature_url) return true
  if (stop.photo_urls) {
    try {
      const parsed = typeof stop.photo_urls === 'string' ? JSON.parse(stop.photo_urls) : stop.photo_urls
      if (Array.isArray(parsed) && parsed.length > 0) return true
    } catch {}
  }
  return false
}

function TrendIndicator({ current, previous }) {
  if (previous === null || previous === undefined) return null
  if (previous === 0 && current === 0) return <span style={{ color: '#6B7280', fontSize: '0.7rem', marginTop: 2 }}>— same</span>
  if (previous === 0) return <span style={{ color: '#10B981', fontSize: '0.7rem', marginTop: 2 }}>▲ new</span>
  const change = Math.round(((current - previous) / previous) * 100)
  if (change === 0) return <span style={{ color: '#6B7280', fontSize: '0.7rem', marginTop: 2 }}>— 0%</span>
  if (change > 0) return <span style={{ color: '#10B981', fontSize: '0.7rem', marginTop: 2 }}>▲ {change}%</span>
  return <span style={{ color: '#EF4444', fontSize: '0.7rem', marginTop: 2 }}>▼ {Math.abs(change)}%</span>
}

export default function PortalDashboard() {
  const { profile } = useAuth()
  const [stops, setStops] = useState([])
  const [lastWeekStops, setLastWeekStops] = useState(null)
  const [loading, setLoading] = useState(true)
  const [podStop, setPodStop] = useState(null)

  const pharmacyName = profile?.pharmacy_name || profile?.pharmacy || 'SHSP'
  const today = new Date().toLocaleDateString('en-CA')
  const lastWeekDate = new Date(Date.now() - 7 * 86400000).toLocaleDateString('en-CA')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [todayRes, lastWeekRes] = await Promise.all([
        supabase
          .from('daily_stops')
          .select('*')
          .eq('pharmacy', pharmacyName)
          .eq('delivery_date', today),
        supabase
          .from('daily_stops')
          .select('*')
          .eq('pharmacy', pharmacyName)
          .eq('delivery_date', lastWeekDate),
      ])

      if (!todayRes.error && todayRes.data) setStops(todayRes.data)
      if (!lastWeekRes.error && lastWeekRes.data) setLastWeekStops(lastWeekRes.data)
      setLoading(false)
    }
    load()
  }, [pharmacyName, today, lastWeekDate])

  const total = stops.length
  const delivered = stops.filter(s => s.status === 'delivered').length
  const failed = stops.filter(s => s.status === 'failed' || s.status === 'attempted').length
  const pending = total - delivered - failed
  const pct = total > 0 ? Math.round((delivered / total) * 100) : 0

  const lwTotal = lastWeekStops ? lastWeekStops.length : null
  const lwDelivered = lastWeekStops ? lastWeekStops.filter(s => s.status === 'delivered').length : null
  const lwFailed = lastWeekStops ? lastWeekStops.filter(s => s.status === 'failed' || s.status === 'attempted').length : null
  const lwPending = lastWeekStops !== null ? lwTotal - lwDelivered - lwFailed : null

  return (
    <PortalShell title="Dashboard">
      <div className="portal-stats">
        <div className="portal-stat-card">
          <div className="portal-stat-label">Total</div>
          <div className="portal-stat-value">{total}</div>
          <TrendIndicator current={total} previous={lwTotal} />
        </div>
        <div className="portal-stat-card">
          <div className="portal-stat-label">Delivered</div>
          <div className="portal-stat-value" style={{ color: '#10B981' }}>{delivered}</div>
          <TrendIndicator current={delivered} previous={lwDelivered} />
        </div>
        <div className="portal-stat-card">
          <div className="portal-stat-label">Pending</div>
          <div className="portal-stat-value" style={{ color: '#F59E0B' }}>{pending}</div>
          <TrendIndicator current={pending} previous={lwPending} />
        </div>
        <div className="portal-stat-card">
          <div className="portal-stat-label">Failed</div>
          <div className="portal-stat-value" style={{ color: '#EF4444' }}>{failed}</div>
          <TrendIndicator current={failed} previous={lwFailed} />
        </div>
      </div>

      <div className="portal-progress-bar">
        <div className="portal-progress-fill" style={{ width: `${pct}%` }} />
      </div>

      <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', marginBottom: 16 }}>
        {pct}% Complete &middot; {delivered} of {total} delivered today
      </div>

      {loading ? (
        <div className="portal-loading">Loading deliveries...</div>
      ) : stops.length === 0 ? (
        <div className="portal-empty">No deliveries found for today.</div>
      ) : (
        <div className="portal-table-wrap">
          <table className="portal-table">
            <thead>
              <tr>
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
              {stops.map(stop => (
                <tr key={stop.id}>
                  <td>{stop.patient_name || '-'}</td>
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
                      <button className="portal-pod-btn" onClick={() => setPodStop(stop)}>
                        POD
                      </button>
                    ) : <span style={{ color: 'rgba(255,255,255,0.25)' }}>-</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {podStop && <PODModal stop={podStop} onClose={() => setPodStop(null)} />}
    </PortalShell>
  )
}
