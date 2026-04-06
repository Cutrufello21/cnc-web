import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { usePharmacyAuth } from '../../context/PharmacyAuthContext'
import { supabase } from '../../lib/supabase'
import './portal.css'

function formatTimestamp(ts) {
  if (!ts) return '--'
  const d = new Date(ts)
  return d.toLocaleString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

export default function PharmacyPOD() {
  const { orderId } = useParams()
  const { tenant, signOut } = usePharmacyAuth()
  const navigate = useNavigate()
  const [stop, setStop] = useState(null)
  const [confirmation, setConfirmation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function fetchPOD() {
      setLoading(true)
      setError('')

      // Fetch the stop
      const { data: stopData, error: stopErr } = await supabase
        .from('daily_stops')
        .select('*')
        .eq('pharmacy', tenant.name)
        .or(`order_id.eq.${orderId},id.eq.${orderId}`)
        .limit(1)
        .single()

      if (stopErr || !stopData) {
        setError('Delivery not found.')
        setLoading(false)
        return
      }

      setStop(stopData)

      // Fetch delivery confirmation
      const { data: confData } = await supabase
        .from('delivery_confirmations')
        .select('*')
        .eq('order_id', stopData.order_id || orderId)
        .limit(1)
        .single()

      if (confData) {
        setConfirmation(confData)
      }

      setLoading(false)
    }

    fetchPOD()
  }, [orderId, tenant.name])

  return (
    <div className="portal__layout">
      <header className="portal__header">
        <div className="portal__header-left">
          <h1 className="portal__header-title">{tenant.display_name}</h1>
        </div>
        <div className="portal__header-right">
          <nav className="portal__nav">
            <button
              className="portal__nav-link"
              onClick={() => navigate('/portal/dashboard')}
            >
              Dashboard
            </button>
            <button
              className="portal__nav-link"
              onClick={() => navigate('/portal/deliveries')}
            >
              Deliveries
            </button>
          </nav>
          <button className="portal__btn portal__btn--outline" onClick={signOut}>
            Sign Out
          </button>
        </div>
      </header>

      <main className="portal__main">
        <button
          className="portal__back-btn"
          onClick={() => navigate('/portal/deliveries')}
        >
          &larr; Back to Deliveries
        </button>

        {loading ? (
          <div className="portal__loading-inline">
            <div className="portal__spinner" />
          </div>
        ) : error ? (
          <div className="portal__error-card">
            <p>{error}</p>
          </div>
        ) : (
          <div className="portal__pod">
            <div className="portal__pod-header">
              <h2>Proof of Delivery</h2>
              <button className="portal__btn portal__btn--outline" onClick={() => window.print()}>
                Print
              </button>
            </div>

            <div className="portal__pod-grid">
              <div className="portal__pod-card">
                <h3>Delivery Details</h3>
                <div className="portal__pod-detail">
                  <span className="portal__pod-label">Patient</span>
                  <span className="portal__pod-value">{stop.patient_name || '--'}</span>
                </div>
                <div className="portal__pod-detail">
                  <span className="portal__pod-label">Address</span>
                  <span className="portal__pod-value">
                    {stop.address || '--'}
                    {stop.city && `, ${stop.city}`}
                    {stop.state && ` ${stop.state}`}
                    {stop.zip && ` ${stop.zip}`}
                  </span>
                </div>
                <div className="portal__pod-detail">
                  <span className="portal__pod-label">Driver</span>
                  <span className="portal__pod-value">{stop.driver_name || '--'}</span>
                </div>
                <div className="portal__pod-detail">
                  <span className="portal__pod-label">Delivery Date</span>
                  <span className="portal__pod-value">{stop.delivery_date || '--'}</span>
                </div>
                <div className="portal__pod-detail">
                  <span className="portal__pod-label">Status</span>
                  <span className={`portal__badge ${stop.status === 'delivered' ? 'portal__badge--green' : stop.status === 'failed' ? 'portal__badge--red' : 'portal__badge--blue'}`}>
                    {stop.status || 'unknown'}
                  </span>
                </div>
                {stop.delivered_at && (
                  <div className="portal__pod-detail">
                    <span className="portal__pod-label">Delivered At</span>
                    <span className="portal__pod-value">{formatTimestamp(stop.delivered_at)}</span>
                  </div>
                )}
              </div>

              {confirmation && (
                <div className="portal__pod-card">
                  <h3>Confirmation Details</h3>
                  {confirmation.delivery_note && (
                    <div className="portal__pod-detail">
                      <span className="portal__pod-label">Delivery Note</span>
                      <span className="portal__pod-value">{confirmation.delivery_note}</span>
                    </div>
                  )}
                  {confirmation.latitude && confirmation.longitude && (
                    <div className="portal__pod-detail">
                      <span className="portal__pod-label">GPS Coordinates</span>
                      <span className="portal__pod-value">
                        {confirmation.latitude.toFixed(6)}, {confirmation.longitude.toFixed(6)}
                      </span>
                    </div>
                  )}
                  {confirmation.geofence_distance != null && (
                    <div className="portal__pod-detail">
                      <span className="portal__pod-label">Geofence Distance</span>
                      <span className="portal__pod-value">
                        {Math.round(confirmation.geofence_distance)} ft
                        {confirmation.geofence_overridden && (
                          <span className="portal__badge portal__badge--orange" style={{ marginLeft: 8 }}>
                            Override
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                  {confirmation.confirmed_at && (
                    <div className="portal__pod-detail">
                      <span className="portal__pod-label">Confirmed At</span>
                      <span className="portal__pod-value">{formatTimestamp(confirmation.confirmed_at)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {confirmation && (
              <div className="portal__pod-media">
                {confirmation.photo_package_url && (
                  <div className="portal__pod-photo">
                    <h3>Package Photo</h3>
                    <img src={confirmation.photo_package_url} alt="Package" />
                  </div>
                )}
                {confirmation.photo_house_url && (
                  <div className="portal__pod-photo">
                    <h3>House Photo</h3>
                    <img src={confirmation.photo_house_url} alt="House" />
                  </div>
                )}
                {confirmation.signature_url && (
                  <div className="portal__pod-signature">
                    <h3>Signature</h3>
                    <div className="portal__pod-sig-wrap">
                      <img src={confirmation.signature_url} alt="Signature" />
                    </div>
                  </div>
                )}
              </div>
            )}

            {!confirmation && stop.status === 'delivered' && (
              <div className="portal__pod-no-conf">
                <p>Delivery confirmed but no proof of delivery details available yet.</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
