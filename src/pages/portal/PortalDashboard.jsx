import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { dbInsert, dbUpdate, dbDelete } from '../../lib/db'
import PortalShell from '../../components/portal/PortalShell'
import { downloadPodPdf } from '../../lib/podPdf'
import { getDeliveryDate } from '../../lib/getDeliveryDate'

/* ── ETA helpers ─────────────────────────────────── */

// Calculate average minutes between deliveries for a driver
function calcDriverPace(driverAllStops) {
  const delivered = driverAllStops
    .filter(s => s.status === 'delivered' && s.delivered_at)
    .sort((a, b) => new Date(a.delivered_at) - new Date(b.delivered_at))
  if (delivered.length < 2) return null
  const first = new Date(delivered[0].delivered_at).getTime()
  const last = new Date(delivered[delivered.length - 1].delivered_at).getTime()
  return Math.round((last - first) / (delivered.length - 1) / 60000)
}

// Build a map: stopId → { stopsAway, etaMinutes, driverProgress, liveETA }
function buildETAMap(pharmacyStops, allDriverStops) {
  const etaMap = {}

  // Group all driver stops by driver
  const byDriver = {}
  allDriverStops.forEach(s => {
    const d = s.driver_name || ''
    if (!byDriver[d]) byDriver[d] = []
    byDriver[d].push(s)
  })

  // For each driver, figure out where they are in their route
  for (const [driver, dStops] of Object.entries(byDriver)) {
    const sorted = [...dStops].sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
    const pace = calcDriverPace(sorted)
    const doneCount = sorted.filter(s => s.status === 'delivered').length
    const totalCount = sorted.length

    // Find current position: first non-delivered/non-failed stop
    const currentIdx = sorted.findIndex(s => s.status !== 'delivered' && s.status !== 'failed' && s.status !== 'attempted')

    // For each pharmacy stop on this driver's route
    pharmacyStops
      .filter(ps => ps.driver_name === driver && getStatusClass(ps.status) === 'pending')
      .forEach(ps => {
        const stopIdx = sorted.findIndex(s => s.id === ps.id)
        if (stopIdx < 0 || currentIdx < 0) return

        const stopsAway = stopIdx - currentIdx
        if (stopsAway < 0) return // already passed

        const etaMinutes = pace ? pace * (stopsAway + 1) : null
        // Use live ETA from driver app if available
        const liveETA = ps.eta || null

        etaMap[ps.id] = { stopsAway, etaMinutes, pace, doneCount, totalCount, driver, liveETA }
      })
  }

  return etaMap
}

function formatETA(min) {
  if (!min || min <= 0) return null
  if (min < 60) return `~${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `~${h}h ${m}m` : `~${h}h`
}

/* ── Pending badge with hover tooltip ─────────── */

function PendingBadge({ stop, etaInfo }) {
  const [hover, setHover] = useState(false)

  if (!etaInfo) {
    return (
      <span className="portal-badge pending">Pending</span>
    )
  }

  return (
    <span
      className="portal-badge pending portal-badge--hoverable"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      Pending
      {hover && (
        <div className="portal-eta-tooltip">
          <div className="portal-eta-tooltip-title">{etaInfo.driver}</div>
          <div className="portal-eta-tooltip-row">
            <span>Driver progress</span>
            <span>{etaInfo.doneCount}/{etaInfo.totalCount} stops</span>
          </div>
          <div className="portal-eta-tooltip-row">
            <span>Stops away</span>
            <span>{etaInfo.stopsAway === 0 ? 'Next up' : etaInfo.stopsAway}</span>
          </div>
          {etaInfo.pace && (
            <div className="portal-eta-tooltip-row">
              <span>Avg pace</span>
              <span>{etaInfo.pace} min/stop</span>
            </div>
          )}
          {etaInfo.liveETA ? (
            <div className="portal-eta-tooltip-row portal-eta-tooltip-highlight">
              <span>Est. delivery</span>
              <span>{etaInfo.liveETA}</span>
            </div>
          ) : etaInfo.etaMinutes ? (
            <div className="portal-eta-tooltip-row portal-eta-tooltip-highlight">
              <span>Est. delivery</span>
              <span>{formatETA(etaInfo.etaMinutes)}</span>
            </div>
          ) : null}
          {!etaInfo.pace && !etaInfo.liveETA && (
            <div className="portal-eta-tooltip-note">Driver hasn't started — no ETA yet</div>
          )}
        </div>
      )}
    </span>
  )
}

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
  const seen = new Set()
  const urls = []
  function add(u) { if (u && !seen.has(u)) { seen.add(u); urls.push(u) } }
  if (stop.photo_url) add(stop.photo_url)
  if (stop.photo_urls) {
    try {
      const parsed = typeof stop.photo_urls === 'string' ? JSON.parse(stop.photo_urls) : stop.photo_urls
      if (Array.isArray(parsed)) parsed.forEach(add)
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

function formatDateTime(dt) {
  if (!dt) return null
  try {
    return new Date(dt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
  } catch { return null }
}

function TimelineStep({ done, active, label, time, last }) {
  return (
    <div style={{ display: 'flex', gap: 12, minHeight: last ? 0 : 40 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20 }}>
        <div style={{
          width: 16, height: 16, borderRadius: 8, flexShrink: 0,
          background: done ? '#10B981' : active ? '#F59E0B' : 'var(--p-border)',
          border: active ? '2px solid #F59E0B' : done ? 'none' : '2px solid var(--p-text-ghost)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {done && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><polyline points="2 5 4 7 8 3" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          {active && <div style={{ width: 6, height: 6, borderRadius: 3, background: '#F59E0B' }} />}
        </div>
        {!last && <div style={{ width: 2, flex: 1, background: done ? '#10B981' : 'var(--p-border)', marginTop: 2 }} />}
      </div>
      <div style={{ paddingBottom: last ? 0 : 12 }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: done ? 'var(--p-text)' : active ? '#F59E0B' : 'var(--p-text-faint)' }}>{label}</div>
        {time && <div style={{ fontSize: '0.72rem', color: 'var(--p-text-faint)', marginTop: 1 }}>{time}</div>}
      </div>
    </div>
  )
}

function PODModal({ stop, onClose, onDelete }) {
  const [confirmation, setConfirmation] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [dispatchTime, setDispatchTime] = useState(null)
  const [lightboxPhoto, setLightboxPhoto] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [geocodedHouse, setGeocodedHouse] = useState(null)

  useEffect(() => {
    if (!stop) return
    const stopId = String(stop.id || stop.order_id)
    supabase
      .from('delivery_confirmations')
      .select('gps_distance_feet, geofence_overridden, barcode_scanned, barcode_value, barcode_matched, barcode_overridden, photo_package_url, photo_house_url, signature_url, recipient_name, delivery_note, handed_directly')
      .eq('stop_id', stopId)
      .order('delivered_at', { ascending: false })
      .limit(1)
      .then(({ data, error }) => { console.log('POD confirmation query:', { stopId, data, error }); if (data?.[0]) setConfirmation(data[0]) })
    // Get dispatch time from dispatch_logs
    if (stop.delivery_date) {
      supabase.from('dispatch_logs').select('created_at').eq('date', stop.delivery_date).limit(1)
        .then(({ data }) => { if (data?.[0]) setDispatchTime(data[0].created_at) })
    }
    // Self-geocode address if daily_stops never got lat/lng (so the map can render)
    if ((!stop.lat || !stop.lng) && stop.address) {
      const token = localStorage.getItem('cnc-token')
      fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ addresses: [{ address: stop.address, city: stop.city || '', zip: stop.zip || '' }] }),
      })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          const hit = data?.results?.[0]
          if (hit?.lat && hit?.lng) setGeocodedHouse({ lat: hit.lat, lng: hit.lng })
        })
        .catch(() => {})
    }
    return () => { setConfirmation(null); setDispatchTime(null); setGeocodedHouse(null) }
  }, [stop])

  if (!stop) return null
  const photos = getPhotoUrls(stop)

  const geofencePassed = confirmation && !confirmation.geofence_overridden
  const geofenceOverridden = confirmation?.geofence_overridden
  const distanceFeet = confirmation?.gps_distance_feet

  // Timeline steps
  const isDelivered = stop.status === 'delivered'
  const isFailed = stop.status === 'failed' || stop.status === 'attempted'
  const isPending = !isDelivered && !isFailed
  const hasDriver = !!stop.driver_name
  const isDispatched = stop.status === 'dispatched' || isDelivered || isFailed

  return (
    <div className="portal-modal-overlay" onClick={onClose}>
      <div className="portal-modal" onClick={e => e.stopPropagation()}>
        {/* Header with patient info */}
        <div className="portal-modal-header">
          <div>
            <span className="portal-modal-title">{stop.patient_name || 'Unknown'}</span>
            <div style={{ fontSize: '0.78rem', color: 'var(--p-text-faint)', marginTop: 2 }}>
              {stop.address}{stop.city ? `, ${stop.city}` : ''}{stop.zip ? ` ${stop.zip}` : ''}
            </div>
          </div>
          <button className="portal-modal-close" onClick={onClose}>&times;</button>
        </div>

        {/* Compliance pills — mirror PDF GEOFENCE / BARCODE / PHOTOS boxes */}
        {stop.status === 'delivered' && (() => {
          const photoCount = photos.length
          const handedDirectly = !!confirmation?.handed_directly
          const photosOk = photoCount >= 2 || (handedDirectly && photoCount >= 1)
          const geoVerified = confirmation && !confirmation.geofence_overridden && confirmation.gps_distance_feet != null
          const geoOverridden = confirmation && confirmation.geofence_overridden
          const geoLabel = geoVerified
            ? `Verified${confirmation.gps_distance_feet != null ? ` (${Math.round(confirmation.gps_distance_feet)} ft)` : ''}`
            : geoOverridden ? 'Overridden' : 'Not Verified'
          const barcodeScanned = !!confirmation?.barcode_scanned
          const barcodeMatched = barcodeScanned && confirmation.barcode_matched
          const barcodeLabel = !barcodeScanned ? 'Not Scanned' : barcodeMatched ? 'Scanned' : 'Mismatch'
          const photosLabel = handedDirectly && photoCount < 2
            ? `${photoCount} Photo${photoCount !== 1 ? 's' : ''} (Handed)`
            : `${photoCount} of 2 min`
          const sigRequired = !!stop.sig_required || (stop.notes || '').toLowerCase().includes('signature')
          const sigOk = !!(stop.signature_url || confirmation?.signature_url)
          const pillBase = { padding: '4px 10px', borderRadius: 6, fontWeight: 600, fontSize: 11, letterSpacing: 0.1 }
          const ok = { ...pillBase, background: 'rgba(22,163,74,0.15)', color: '#16a34a' }
          const fail = { ...pillBase, background: 'rgba(220,38,38,0.15)', color: '#dc2626' }
          const info = { ...pillBase, background: 'rgba(96,165,250,0.18)', color: '#2563eb' }
          return (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              <span style={geoVerified ? ok : fail}>Geofence: {geoLabel}</span>
              <span style={barcodeMatched ? ok : fail}>Barcode: {barcodeLabel}</span>
              <span style={photosOk ? ok : fail}>Photos: {photosLabel}</span>
              {handedDirectly && <span style={info}>Handed ✓</span>}
              {(sigRequired || sigOk) && <span style={sigOk ? ok : fail}>Signed {sigOk ? '✓' : '✗'}</span>}
            </div>
          )
        })()}

        {/* Geofence map — house pin vs driver GPS ping */}
        {(() => {
          const houseLat = stop.lat || geocodedHouse?.lat
          const houseLng = stop.lng || geocodedHouse?.lng
          const driverLat = stop.delivery_lat
          const driverLng = stop.delivery_lng
          const token = import.meta.env.VITE_MAPBOX_TOKEN
          if (!token) return null
          const hasHouse = !!(houseLat && houseLng)
          const hasDriver = !!(driverLat && driverLng)
          if (!hasHouse && !hasDriver) return null
          const overlays = []
          if (hasHouse) overlays.push(`pin-l-h+0A2463(${houseLng},${houseLat})`)
          if (hasDriver) overlays.push(`pin-l-d+EF4444(${driverLng},${driverLat})`)
          const center = (hasHouse && hasDriver) ? 'auto' : `${hasHouse ? houseLng : driverLng},${hasHouse ? houseLat : driverLat},15`
          const mapUrl = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${overlays.join(',')}/${center}/520x200@2x?padding=50&access_token=${token}`
          const directionsUrl = (hasHouse && hasDriver)
            ? `https://www.google.com/maps/dir/${driverLat},${driverLng}/${houseLat},${houseLng}`
            : `https://www.google.com/maps/?q=${hasHouse ? `${houseLat},${houseLng}` : `${driverLat},${driverLng}`}`
          const distFt = confirmation?.gps_distance_feet
          return (
            <div style={{ marginBottom: 14 }}>
              <a
                href={directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'block', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--p-border)', position: 'relative' }}
                title={hasHouse && hasDriver ? 'Open directions in Google Maps' : 'Open in Google Maps'}
              >
                <img src={mapUrl} alt="Geofence map" style={{ width: '100%', height: 'auto', display: 'block' }} />
              </a>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, fontSize: '0.7rem', color: 'var(--p-text-faint)' }}>
                <span>
                  {hasHouse && <><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#0A2463', marginRight: 4 }} />House</>}
                  {hasDriver && <><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#EF4444', margin: hasHouse ? '0 4px 0 10px' : '0 4px 0 0' }} />Driver GPS</>}
                </span>
                {hasHouse && hasDriver && distFt != null && <span style={{ fontWeight: 600, color: distFt > 200 ? '#dc2626' : '#16a34a' }}>{Math.round(distFt)} ft apart</span>}
              </div>
            </div>
          )
        })()}

        {/* Order Status Timeline */}
        <div style={{ background: 'var(--p-hover)', borderRadius: 10, padding: '16px 18px', marginBottom: 16 }}>
          <TimelineStep done={true} label="Order Received" time={formatDateTime(stop.created_at)} />
          <TimelineStep done={hasDriver} active={!hasDriver && !isDispatched} label={hasDriver ? `Assigned to ${stop.driver_name}` : 'Awaiting Assignment'} time={hasDriver ? (stop.pharmacy || '') : null} />
          <TimelineStep done={isDispatched} active={hasDriver && !isDispatched} label="Route Dispatched" time={formatDateTime(dispatchTime)} />
          <TimelineStep done={isDelivered || isFailed} active={isDispatched && isPending} label={isDelivered ? 'Delivered' : isFailed ? 'Failed' : 'In Transit'} time={isDelivered ? formatDateTime(stop.delivered_at) : isFailed ? (stop.failure_reason || 'Failed') : isPending && stop.eta ? `ETA: ${stop.eta}` : null} last />
        </div>

        {/* Details grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', marginBottom: 16 }}>
          {stop.order_id && (
            <div><div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--p-text-faint)', textTransform: 'uppercase', marginBottom: 2 }}>Order ID</div><div style={{ fontSize: '0.82rem', color: 'var(--p-text)' }}>#{stop.order_id}</div></div>
          )}
          <div><div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--p-text-faint)', textTransform: 'uppercase', marginBottom: 2 }}>Driver</div><div style={{ fontSize: '0.82rem', color: 'var(--p-text)' }}>{stop.driver_name || '-'}</div></div>
          {stop.delivered_at && (
            <div><div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--p-text-faint)', textTransform: 'uppercase', marginBottom: 2 }}>Delivered At</div><div style={{ fontSize: '0.82rem', color: 'var(--p-text)' }}>{formatTime(stop.delivered_at)}</div></div>
          )}
          <div><div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--p-text-faint)', textTransform: 'uppercase', marginBottom: 2 }}>Cold Chain</div><div style={{ fontSize: '0.82rem', color: 'var(--p-text)' }}>{stop.cold_chain ? <span className="portal-cold-chain">Yes</span> : 'No'}</div></div>
          {(stop.delivery_lat || stop.delivery_lng) && (
            <div><div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--p-text-faint)', textTransform: 'uppercase', marginBottom: 2 }}>GPS Location</div><div style={{ fontSize: '0.82rem', color: '#60A5FA' }}>{stop.delivery_lat}, {stop.delivery_lng}</div></div>
          )}
          {confirmation && (
            <div><div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--p-text-faint)', textTransform: 'uppercase', marginBottom: 2 }}>Geofence</div><div style={{ fontSize: '0.82rem' }}>
              {geofencePassed ? <span className="portal-geofence-verified">Verified{distanceFeet != null ? ` (${Math.round(distanceFeet)} ft)` : ''}</span>
              : geofenceOverridden ? <span className="portal-geofence-overridden">Overridden{distanceFeet != null ? ` (${Math.round(distanceFeet)} ft)` : ''}</span>
              : null}
            </div></div>
          )}
          {confirmation?.barcode_scanned && (
            <div><div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--p-text-faint)', textTransform: 'uppercase', marginBottom: 2 }}>Barcode</div><div style={{ fontSize: '0.82rem' }}>
              {confirmation.barcode_matched ? <span style={{ color: '#16a34a', fontWeight: 600 }}>Matched</span>
              : confirmation.barcode_overridden ? <span style={{ color: '#d97706', fontWeight: 600 }}>Overridden</span>
              : <span>{confirmation.barcode_value || 'Scanned'}</span>}
            </div></div>
          )}
          {confirmation?.recipient_name && (
            <div><div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--p-text-faint)', textTransform: 'uppercase', marginBottom: 2 }}>Received By</div><div style={{ fontSize: '0.82rem', color: 'var(--p-text)' }}>{confirmation.recipient_name}</div></div>
          )}
        </div>


        {(() => {
          const allPhotos = [...photos]
          if (confirmation?.photo_package_url && !allPhotos.includes(confirmation.photo_package_url)) allPhotos.push(confirmation.photo_package_url)
          if (confirmation?.photo_house_url && !allPhotos.includes(confirmation.photo_house_url)) allPhotos.push(confirmation.photo_house_url)
          const sigUrl = stop.signature_url || confirmation?.signature_url
          const tiles = [
            ...allPhotos.map((url, i) => ({ url, label: `Photo ${i + 1}`, isSig: false })),
            ...(sigUrl ? [{ url: sigUrl, label: 'Signature', isSig: true }] : []),
          ]
          if (tiles.length === 0) return null
          return (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(tiles.length, 4)}, 1fr)`, gap: 6, marginTop: 8 }}>
              {tiles.map((t, i) => (
                <button
                  key={i}
                  onClick={() => setLightboxPhoto(t.url)}
                  style={{
                    position: 'relative', padding: 0, border: '1px solid var(--p-border)', borderRadius: 8,
                    overflow: 'hidden', cursor: 'zoom-in', background: t.isSig ? '#fff' : 'transparent', aspectRatio: '1',
                  }}
                  title={`Click to enlarge — ${t.label}`}
                >
                  <img src={t.url} alt={t.label} style={{ width: '100%', height: '100%', objectFit: t.isSig ? 'contain' : 'cover', display: 'block' }} />
                  <span style={{ position: 'absolute', top: 4, left: 4, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 3, letterSpacing: 0.3 }}>{t.label.toUpperCase()}</span>
                </button>
              ))}
            </div>
          )
        })()}

        {(confirmation?.delivery_note || stop.delivery_note) && (
          <div style={{ background: 'var(--p-hover)', borderRadius: 8, padding: '10px 14px', marginTop: 12, fontSize: '0.8rem', color: 'var(--p-text-secondary)' }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--p-text-faint)', textTransform: 'uppercase' }}>Delivery Note: </span>{confirmation?.delivery_note || stop.delivery_note}
          </div>
        )}

        {stop.status === 'delivered' && (
          <button
            className="portal-btn"
            style={{ marginTop: 20, width: '100%' }}
            disabled={exporting}
            onClick={async (e) => {
              e.stopPropagation()
              setExporting(true)
              try { await downloadPodPdf(stop, confirmation) } catch {}
              setExporting(false)
            }}
          >
            {exporting ? 'Generating PDF...' : 'Download POD as PDF'}
          </button>
        )}

        {stop.status !== 'delivered' && onDelete && (
          <button
            style={{
              marginTop: 16, width: '100%', padding: '10px 0',
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 8, color: '#EF4444', fontSize: '0.82rem', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
            disabled={deleting}
            onClick={async (e) => {
              e.stopPropagation()
              if (!confirm(`Delete this stop?\n\n${stop.patient_name || 'Unknown'}\n${stop.address || ''}`)) return
              setDeleting(true)
              try {
                await dbUpdate('daily_stops',
                  { status: 'DELETED', deleted_at: new Date().toISOString() },
                  { id: stop.id },
                )
                if (!String(stop.order_id).startsWith('M')) {
                  await dbInsert('order_deletions', {
                    stop_id: String(stop.id),
                    order_number: stop.order_id,
                    patient_name: stop.patient_name || '',
                    driver_name: stop.driver_name || '',
                    authorized_by: 'Portal',
                    deleted_at: new Date().toISOString(),
                    date: stop.delivery_date,
                  })
                }
                onDelete(stop.id)
                onClose()
              } catch {}
              setDeleting(false)
            }}
          >
            {deleting ? 'Deleting...' : 'Delete Stop'}
          </button>
        )}
      </div>

      {lightboxPhoto && (
        <div
          onClick={(e) => { e.stopPropagation(); setLightboxPhoto(null) }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 10000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out', padding: 24,
          }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setLightboxPhoto(null) }}
            style={{
              position: 'absolute', top: 18, right: 22, background: 'rgba(255,255,255,0.12)', border: 'none',
              color: '#fff', width: 40, height: 40, borderRadius: 20, fontSize: 22, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >×</button>
          <img src={lightboxPhoto} alt="POD enlarged" style={{ maxWidth: '95%', maxHeight: '95%', objectFit: 'contain', borderRadius: 6 }} />
        </div>
      )}
    </div>
  )
}

export { PODModal, getPhotoUrls, hasPodEvidence, getStatusClass, getStatusLabel, formatTime }

function hasPodEvidence(stop) {
  if (stop.photo_url) return true
  if (stop.signature_url) return true
  if (stop.delivery_note) return true
  if (stop.delivery_lat) return true
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
  const [allDriverStops, setAllDriverStops] = useState([])
  const [lastWeekStops, setLastWeekStops] = useState(null)
  const [loading, setLoading] = useState(true)
  const [podStop, setPodStop] = useState(null)
  const [detailStop, setDetailStop] = useState(null)
  const [deletedStops, setDeletedStops] = useState([])
  const [showDeleted, setShowDeleted] = useState(false)

  const [summaryStatus, setSummaryStatus] = useState(null) // null | 'sending' | 'sent' | 'error'

  // Search & filters
  const [search, setSearch] = useState('')
  const [filterDriver, setFilterDriver] = useState('')
  const [filterCity, setFilterCity] = useState('')
  const [filterZip, setFilterZip] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [sortCol, setSortCol] = useState(null)
  const [sortAsc, setSortAsc] = useState(true)

  const pharmacyName = profile?.pharmacy_name || profile?.pharmacy || 'SHSP'
  const isAdmin = pharmacyName === 'all' || profile?.role === 'dispatcher'
  const actualToday = getDeliveryDate()
  const [selectedDate, setSelectedDate] = useState(actualToday)
  const today = selectedDate
  const lastWeekDate = (() => { const d = new Date(selectedDate + 'T12:00:00'); d.setDate(d.getDate() - 7); return d.toLocaleDateString('en-CA') })()
  const isToday = selectedDate === actualToday

  function shiftDay(dir) {
    const d = new Date(selectedDate + 'T12:00:00')
    d.setDate(d.getDate() + dir)
    setSelectedDate(d.toLocaleDateString('en-CA'))
  }

  const displayDate = new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  const loadData = useCallback(async () => {
    let todayQ = supabase.from('daily_stops').select('*').eq('delivery_date', today)
    let lastWeekQ = supabase.from('daily_stops').select('*').eq('delivery_date', lastWeekDate).neq('status', 'DELETED')
    if (!isAdmin) { todayQ = todayQ.eq('pharmacy', pharmacyName); lastWeekQ = lastWeekQ.eq('pharmacy', pharmacyName) }
    const [todayRes, lastWeekRes] = await Promise.all([todayQ, lastWeekQ])

    const allStopsToday = todayRes.data || []
    const pharmacyStops = allStopsToday.filter(s => s.status !== 'DELETED')
    const deleted = allStopsToday.filter(s => s.status === 'DELETED')
    if (!todayRes.error) { setStops(pharmacyStops); setDeletedStops(deleted) }
    if (!lastWeekRes.error && lastWeekRes.data) setLastWeekStops(lastWeekRes.data)

    // Fetch full routes for each driver assigned to this pharmacy today
    const driverNames = [...new Set(pharmacyStops.map(s => s.driver_name).filter(Boolean))]
    if (driverNames.length > 0) {
      const [allStopsRes, routesRes] = await Promise.all([
        supabase
          .from('daily_stops')
          .select('id, order_id, driver_name, sort_order, status, delivered_at')
          .eq('delivery_date', today)
          .in('driver_name', driverNames)
          .order('sort_order', { ascending: true, nullsFirst: false }),
        supabase
          .from('driver_routes')
          .select('driver_name, stop_etas, eta_updated_at')
          .eq('date', today)
          .in('driver_name', driverNames),
      ])
      setAllDriverStops(allStopsRes.data || [])

      // Merge live ETAs from driver_routes into pharmacy stops
      const etasByDriver = {}
      ;(routesRes.data || []).forEach(r => {
        if (r.stop_etas) etasByDriver[r.driver_name] = r.stop_etas
      })
      // Write live ETAs onto stops for the ETA map
      pharmacyStops.forEach(s => {
        const driverEtas = etasByDriver[s.driver_name]
        if (driverEtas) {
          const eta = driverEtas[String(s.order_id)] || driverEtas[String(s.id)]
          if (eta) s.eta = eta
        }
      })
      if (!todayRes.error) setStops([...pharmacyStops])
    }

    setLoading(false)
  }, [pharmacyName, today, lastWeekDate])

  useEffect(() => { loadData(); const i = setInterval(loadData, 30000); return () => clearInterval(i) }, [loadData])

  // Auto-refresh every 30s for live ETA updates
  useEffect(() => {
    const interval = setInterval(loadData, 30000)
    return () => clearInterval(interval)
  }, [loadData])

  // Build ETA map for pending stops
  const etaMap = useMemo(
    () => buildETAMap(stops, allDriverStops),
    [stops, allDriverStops]
  )

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
      {/* Date navigator */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 20 }}>
        <button onClick={() => shiftDay(-1)} style={{ background: 'var(--p-hover)', border: 'none', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--p-text)', fontSize: 16 }}>‹</button>
        <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--p-text)' }}>{displayDate}</span>
        <button onClick={() => shiftDay(1)} style={{ background: 'var(--p-hover)', border: 'none', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--p-text)', fontSize: 16 }}>›</button>
        {!isToday && <button onClick={() => setSelectedDate(actualToday)} style={{ background: 'rgba(96,165,250,0.15)', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', color: '#60A5FA', fontSize: '0.8rem', fontWeight: 700 }}>Today</button>}
        {isAdmin && (
          <button
            className="portal-btn"
            style={{ marginLeft: 8, fontSize: '0.75rem', padding: '5px 14px' }}
            disabled={summaryStatus === 'sending' || total === 0}
            onClick={async () => {
              setSummaryStatus('sending')
              try {
                const r = await fetch(`/api/eod-summary?date=${selectedDate}`)
                if (r.ok) { setSummaryStatus('sent'); setTimeout(() => setSummaryStatus(null), 4000) }
                else setSummaryStatus('error')
              } catch { setSummaryStatus('error') }
            }}
          >
            {summaryStatus === 'sending' ? 'Sending...' : summaryStatus === 'sent' ? 'Sent!' : 'Email Summary'}
          </button>
        )}
      </div>

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

      <div style={{ fontSize: '0.75rem', color: 'var(--p-text-faint)', marginBottom: 16 }}>
        {pct}% Complete &middot; {delivered} of {total} delivered today
      </div>

      {/* Search & Filters */}
      {!loading && stops.length > 0 && (() => {
        const drivers = [...new Set(stops.map(s => s.driver_name).filter(Boolean))].sort()
        const cities = [...new Set(stops.map(s => s.city).filter(Boolean))].sort()
        const zips = [...new Set(stops.map(s => s.zip).filter(Boolean))].sort()
        const hasFilters = search || filterDriver || filterCity || filterZip || filterStatus

        const filtered = stops.filter(s => {
          if (search) {
            const q = search.toLowerCase()
            if (!`${s.patient_name || ''} ${s.address || ''} ${s.order_id || ''} ${s.city || ''} ${s.zip || ''}`.toLowerCase().includes(q)) return false
          }
          if (filterDriver && (s.driver_name || '') !== filterDriver) return false
          if (filterCity && (s.city || '') !== filterCity) return false
          if (filterZip && (s.zip || '') !== filterZip) return false
          if (filterStatus) {
            const sc = getStatusClass(s.status)
            if (sc !== filterStatus) return false
          }
          return true
        }).sort((a, b) => {
          if (!sortCol) return (a.sort_order ?? 999) - (b.sort_order ?? 999)
          const dir = sortAsc ? 1 : -1
          let va, vb
          if (sortCol === 'time') {
            va = a.delivered_at || ''; vb = b.delivered_at || ''
          } else if (sortCol === 'status') {
            va = getStatusLabel(a.status); vb = getStatusLabel(b.status)
          } else {
            va = (a[sortCol] || '').toString().toLowerCase()
            vb = (b[sortCol] || '').toString().toLowerCase()
          }
          return va < vb ? -dir : va > vb ? dir : 0
        })

        function toggleSort(col) {
          if (sortCol === col) setSortAsc(!sortAsc)
          else { setSortCol(col); setSortAsc(true) }
        }

        function SortIcon({ col }) {
          if (sortCol !== col) return <span style={{ opacity: 0.3, marginLeft: 4, fontSize: '0.65rem' }}>⇅</span>
          return <span style={{ color: '#10B981', marginLeft: 4, fontSize: '0.65rem' }}>{sortAsc ? '▲' : '▼'}</span>
        }

        return (
          <>
            {/* Big search bar */}
            <div style={{ marginBottom: 16 }}>
              <input
                type="text"
                className="portal-input"
                placeholder="Search by patient name, address, ZIP, or order ID..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: '100%', padding: '14px 18px', fontSize: '1rem', borderRadius: 10 }}
              />
            </div>

            <div className="portal-filters">
              <div className="portal-filter-row">
                <select className="portal-filter-select" value={filterDriver} onChange={e => setFilterDriver(e.target.value)}>
                  <option value="">All Drivers</option>
                  {drivers.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <select className="portal-filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                  <option value="">All Statuses</option>
                  <option value="delivered">Delivered</option>
                  <option value="pending">Pending</option>
                  <option value="failed">Failed</option>
                </select>
                <select className="portal-filter-select" value={filterCity} onChange={e => setFilterCity(e.target.value)}>
                  <option value="">All Cities</option>
                  {cities.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select className="portal-filter-select" value={filterZip} onChange={e => setFilterZip(e.target.value)}>
                  <option value="">All ZIPs</option>
                  {zips.map(z => <option key={z} value={z}>{z}</option>)}
                </select>
                {hasFilters && (
                  <button className="portal-clear-btn" onClick={() => { setSearch(''); setFilterDriver(''); setFilterCity(''); setFilterZip(''); setFilterStatus(''); setSortCol(null); setSortAsc(true) }}>
                    Clear All
                  </button>
                )}
              </div>
              {hasFilters && (
                <div style={{ fontSize: '0.75rem', color: 'var(--p-text-faint)', marginTop: 8 }}>
                  Showing {filtered.length} of {stops.length} orders
                </div>
              )}
            </div>

            <div className="portal-table-wrap">
              <table className="portal-table">
                <thead>
                  <tr>
                    <th className="portal-th-sort" onClick={() => toggleSort('patient_name')}>Patient<SortIcon col="patient_name" /></th>
                    <th className="portal-th-sort" onClick={() => toggleSort('address')}>Address<SortIcon col="address" /></th>
                    <th className="portal-th-sort" onClick={() => toggleSort('city')}>City<SortIcon col="city" /></th>
                    <th className="portal-th-sort" onClick={() => toggleSort('zip')}>Zip<SortIcon col="zip" /></th>
                    <th className="portal-th-sort" onClick={() => toggleSort('driver_name')}>Driver<SortIcon col="driver_name" /></th>
                    <th className="portal-th-sort" onClick={() => toggleSort('status')}>Status<SortIcon col="status" /></th>
                    <th className="portal-th-sort" onClick={() => toggleSort('time')}>Time<SortIcon col="time" /></th>
                    <th>POD</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(stop => (
                    <tr key={stop.id} style={{ cursor: 'pointer' }} onClick={() => setDetailStop(stop)}>
                      <td>{stop.patient_name || '-'}</td>
                      <td>{stop.address || '-'}</td>
                      <td>{stop.city || '-'}</td>
                      <td>{stop.zip || '-'}</td>
                      <td>{stop.driver_name || '-'}</td>
                      <td>
                        {getStatusClass(stop.status) === 'pending' ? (
                          <PendingBadge stop={stop} etaInfo={etaMap[stop.id]} />
                        ) : (
                          <span className={`portal-badge ${getStatusClass(stop.status)}`}>
                            {getStatusLabel(stop.status)}
                          </span>
                        )}
                      </td>
                      <td>{stop.delivered_at ? formatTime(stop.delivered_at) : (stop.eta ? <span style={{ color: '#60A5FA', fontSize: '0.8rem' }}>{stop.eta}</span> : '-')}</td>
                      <td>
                        {hasPodEvidence(stop) ? (
                          <button className="portal-pod-btn" onClick={() => setPodStop(stop)}>
                            POD
                          </button>
                        ) : <span style={{ color: 'var(--p-text-ghost)' }}>-</span>}
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', color: 'var(--p-text-faint)', padding: '40px 0' }}>
                        No orders match your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )
      })()}

      {loading && <div className="portal-loading">Loading deliveries...</div>}
      {!loading && stops.length === 0 && <div className="portal-empty">No deliveries found for today.</div>}

      {podStop && <PODModal stop={podStop} onClose={() => setPodStop(null)} />}

      {/* Deleted Orders Section */}
      {isAdmin && deletedStops.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <button
            onClick={() => setShowDeleted(!showDeleted)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}
          >
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#EF4444' }}>
              {showDeleted ? '▾' : '▸'} Deleted Orders ({deletedStops.length})
            </span>
          </button>
          {showDeleted && (
            <div className="portal-table-wrap" style={{ marginTop: 8 }}>
              <table className="portal-table">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Address</th>
                    <th>Driver</th>
                    <th>Type</th>
                    <th>Deleted</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {deletedStops.map(stop => {
                    const isManual = String(stop.order_id).startsWith('M')
                    return (
                      <tr key={stop.id}>
                        <td style={{ opacity: 0.6 }}>{stop.patient_name || '-'}</td>
                        <td style={{ opacity: 0.6 }}>{stop.address || '-'}{stop.city ? `, ${stop.city}` : ''}</td>
                        <td style={{ opacity: 0.6 }}>{stop.driver_name || '-'}</td>
                        <td><span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 10, background: isManual ? 'rgba(96,165,250,0.12)' : 'rgba(239,68,68,0.12)', color: isManual ? '#60A5FA' : '#EF4444' }}>{isManual ? 'Manual' : 'Order'}</span></td>
                        <td style={{ fontSize: '0.75rem', color: 'var(--p-text-faint)' }}>{stop.deleted_at ? new Date(stop.deleted_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '-'}</td>
                        <td>
                          <button
                            className="portal-pod-btn"
                            onClick={async () => {
                              if (isManual) {
                                await dbDelete('daily_stops', { id: stop.id })
                                setDeletedStops(prev => prev.filter(s => s.id !== stop.id))
                              } else {
                                await dbUpdate('daily_stops', { status: 'dispatched', deleted_at: null }, { id: stop.id })
                                setDeletedStops(prev => prev.filter(s => s.id !== stop.id))
                                setStops(prev => [...prev, { ...stop, status: 'dispatched', deleted_at: null }])
                              }
                            }}
                          >
                            {isManual ? 'Remove' : 'Restore'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Delivery Detail Modal */}
      {detailStop && <PODModal stop={detailStop} onClose={() => setDetailStop(null)} onDelete={(id) => {
        setStops(prev => prev.filter(s => s.id !== id))
        // Move to deleted list
        const deleted = stops.find(s => s.id === id)
        if (deleted) setDeletedStops(prev => [...prev, { ...deleted, status: 'DELETED', deleted_at: new Date().toISOString() }])
      }} />}
    </PortalShell>
  )
}
