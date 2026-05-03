import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import PortalShell from '../../components/portal/PortalShell'
import { getDeliveryDate } from '../../lib/getDeliveryDate'
import { PODModal, getPhotoUrls, hasPodEvidence, formatTime } from './PortalDashboard'
import { downloadBulkPodPdf } from '../../lib/podPdf'

export default function PortalPODRecords() {
  const { profile } = useAuth()
  const [stops, setStops] = useState([])
  const [confirmations, setConfirmations] = useState({})
  const [loading, setLoading] = useState(true)
  const [podStop, setPodStop] = useState(null)
  const [date, setDate] = useState(getDeliveryDate())
  const [bulkExporting, setBulkExporting] = useState(false)

  const pharmacyName = profile?.pharmacy_name || profile?.pharmacy || 'SHSP'
  const isAdmin = pharmacyName === 'all' || profile?.role === 'dispatcher'

  useEffect(() => {
    async function load() {
      setLoading(true)
      let q = supabase
        .from('daily_stops')
        .select('*')
      if (!isAdmin) q = q.eq('pharmacy', pharmacyName)
      const { data, error } = await q
        .eq('delivery_date', date)
        .eq('status', 'delivered')

      if (!error && data) {
        const withPod = data.filter(s => hasPodEvidence(s))
        setStops(withPod)
        const ids = withPod.map(s => String(s.id || s.order_id)).filter(Boolean)
        if (ids.length > 0) {
          const { data: confs } = await supabase
            .from('delivery_confirmations')
            .select('stop_id, gps_distance_feet, geofence_overridden, barcode_scanned, barcode_matched, handed_directly')
            .in('stop_id', ids)
          const map = {}
          ;(confs || []).forEach(c => { if (!map[c.stop_id]) map[c.stop_id] = c })
          setConfirmations(map)
        } else {
          setConfirmations({})
        }
      }
      setLoading(false)
    }
    load()
  }, [pharmacyName, date])

  return (
    <PortalShell title="POD Records">
      <div className="portal-filters" style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
        <div className="portal-filter-group">
          <span className="portal-filter-label">Date</span>
          <input
            type="date"
            className="portal-input"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </div>
        <button
          className="portal-btn"
          disabled={stops.length === 0 || bulkExporting}
          onClick={async () => {
            setBulkExporting(true)
            try { await downloadBulkPodPdf(stops, date) } catch {}
            setBulkExporting(false)
          }}
        >
          {bulkExporting ? 'Generating...' : `Export All (${stops.length}) as PDF`}
        </button>
      </div>

      <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', marginBottom: 16 }}>
        {stops.length} POD record{stops.length !== 1 ? 's' : ''} found
      </div>

      {loading ? (
        <div className="portal-loading">Loading...</div>
      ) : stops.length === 0 ? (
        <div className="portal-empty">
          <div className="portal-empty-icon">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5">
              <rect x="6" y="10" width="36" height="28" rx="3" />
              <circle cx="18" cy="22" r="4" />
              <path d="M6 34l10-8 6 4 10-10 10 8" />
            </svg>
          </div>
          <div className="portal-empty-title">No POD Records</div>
          <div className="portal-empty-sub">No proof of delivery photos or signatures found for this date.</div>
        </div>
      ) : (
        <div className="portal-pod-grid">
          {stops.map(stop => {
            const photos = getPhotoUrls(stop)
            const thumb = photos[0] || stop.signature_url || null
            const photoCount = photos.length
            const conf = confirmations[String(stop.id || stop.order_id)]
            const handedDirectly = !!conf?.handed_directly
            const photosOk = photoCount >= 2 || (handedDirectly && photoCount >= 1)
            const geoOk = conf && !conf.geofence_overridden && conf.gps_distance_feet != null
            const geoFail = conf && conf.geofence_overridden
            const barcodeOk = conf && conf.barcode_scanned && conf.barcode_matched

            return (
              <div key={stop.id} className="portal-pod-card" onClick={() => setPodStop(stop)}>
                {thumb ? (
                  <img className="portal-pod-card-thumb" src={thumb} alt="POD" />
                ) : (
                  <div className="portal-pod-card-thumb" style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'rgba(255,255,255,0.15)', fontSize: '0.8rem',
                  }}>
                    No Image
                  </div>
                )}
                <div className="portal-pod-card-body">
                  <div className="portal-pod-card-name">
                    {stop.patient_name || '-'}
                    {photoCount > 0 && <span style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 400, marginLeft: 6 }}>({photoCount})</span>}
                  </div>
                  <div className="portal-pod-card-address">{stop.address || '-'}{stop.city ? `, ${stop.city}` : ''}</div>
                  <div className="portal-pod-card-driver">
                    <span>{stop.driver_name || '-'}</span>
                    <span style={{ opacity: 0.4 }}>·</span>
                    <span>{formatTime(stop.delivered_at)}</span>
                  </div>
                  <div className="portal-pod-card-badges">
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
                    {stop.signature_url && <span className="portal-pod-pill portal-pod-pill--info">Signed</span>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {podStop && <PODModal stop={podStop} onClose={() => setPodStop(null)} />}
    </PortalShell>
  )
}
