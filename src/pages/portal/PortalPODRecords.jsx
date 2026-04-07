import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import PortalShell from '../../components/portal/PortalShell'
import { PODModal, getPhotoUrls, hasPodEvidence, formatTime } from './PortalDashboard'

export default function PortalPODRecords() {
  const { profile } = useAuth()
  const [stops, setStops] = useState([])
  const [loading, setLoading] = useState(true)
  const [podStop, setPodStop] = useState(null)
  const [date, setDate] = useState(new Date().toLocaleDateString('en-CA'))

  const pharmacyName = profile?.pharmacy_name || profile?.pharmacy || 'SHSP'

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('daily_stops')
        .select('*')
        .eq('pharmacy', pharmacyName)
        .eq('delivery_date', date)
        .eq('status', 'delivered')

      if (!error && data) {
        const withPod = data.filter(s => hasPodEvidence(s))
        setStops(withPod)
      }
      setLoading(false)
    }
    load()
  }, [pharmacyName, date])

  return (
    <PortalShell title="POD Records">
      <div className="portal-filters">
        <div className="portal-filter-group">
          <span className="portal-filter-label">Date</span>
          <input
            type="date"
            className="portal-input"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </div>
      </div>

      <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', marginBottom: 16 }}>
        {stops.length} POD record{stops.length !== 1 ? 's' : ''} found
      </div>

      {loading ? (
        <div className="portal-loading">Loading...</div>
      ) : stops.length === 0 ? (
        <div className="portal-empty">No POD records found for this date.</div>
      ) : (
        <div className="portal-pod-grid">
          {stops.map(stop => {
            const photos = getPhotoUrls(stop)
            const thumb = photos[0] || stop.signature_url || null

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
                  <div className="portal-pod-card-name">{stop.patient_name || '-'}</div>
                  <div className="portal-pod-card-address">{stop.address || '-'}{stop.city ? `, ${stop.city}` : ''}</div>
                  <div className="portal-pod-card-meta">
                    <span>{stop.driver_name || '-'}</span>
                    <span>{formatTime(stop.delivered_at)}</span>
                    <span className="portal-badge delivered" style={{ padding: '2px 8px' }}>Delivered</span>
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
