import { useState, useRef, useEffect, useCallback } from 'react'
import './StopCard.css'

const UNDO_WINDOW_MS = 120_000 // 2 minutes

export default function StopCard({ stop, index, total, isSelected, onToggleSelect, onExportDrag, deliveryDate, driverName, onDeliveryChange }) {
  const [expanded, setExpanded] = useState(false)
  const [delivering, setDelivering] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [delivered, setDelivered] = useState(stop.status === 'delivered')
  const [deliveredAt, setDeliveredAt] = useState(stop.delivered_at || null)
  const [canUndo, setCanUndo] = useState(false)
  const [photos, setPhotos] = useState(() => {
    if (stop.photo_urls && Array.isArray(stop.photo_urls)) return stop.photo_urls
    if (stop.photo_url) return [stop.photo_url]
    return []
  })
  const [lightboxUrl, setLightboxUrl] = useState(null)
  const fileRef = useRef(null)
  const undoTimer = useRef(null)

  // Swipe state
  const touchStart = useRef(null)
  const touchDelta = useRef(0)
  const cardRef = useRef(null)
  const [swiping, setSwiping] = useState(false)

  const name = stop['Name'] || stop['Patient'] || stop['Customer'] || '—'
  const address = stop['Address'] || ''
  const city = stop['City'] || ''
  const zip = stop['ZIP'] || ''
  const orderId = stop['Order ID'] || stop['Order_ID'] || ''
  const isColdChain = stop._coldChain
  const isSigRequired = stop._sigRequired
  const pharmacy = stop['Pharmacy'] || ''
  const notes = stop['Notes'] || stop['Special Instructions'] || ''

  const fullAddress = [address, city, zip ? `OH ${zip}` : ''].filter(Boolean).join(', ')
  const mapQuery = encodeURIComponent(fullAddress)
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`

  // Cleanup undo timer
  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current) }, [])

  async function handleAddPhoto(e) {
    const file = e.target.files?.[0]
    if (!file || uploading) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('deliveryDate', deliveryDate)
      formData.append('orderId', orderId)
      const res = await fetch('/api/upload-photo', { method: 'POST', body: formData })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error)
      if (result.url) setPhotos(prev => [...prev, result.url])
    } catch (err) {
      console.error('Photo upload error:', err)
      alert('Failed to upload photo: ' + err.message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleConfirmDelivery() {
    if (delivering || delivered) return
    setDelivering(true)
    try {
      const res = await fetch('/api/deliver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, deliveryDate, driverName, photoUrls: photos }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error)
      setDelivered(true)
      setDeliveredAt(new Date().toISOString())
      setCanUndo(true)
      onDeliveryChange?.()
      // Start undo window
      undoTimer.current = setTimeout(() => setCanUndo(false), UNDO_WINDOW_MS)
    } catch (err) {
      console.error('Delivery error:', err)
      alert('Failed to mark as delivered: ' + err.message)
    } finally {
      setDelivering(false)
    }
  }

  async function handleUndo() {
    if (!canUndo) return
    try {
      const res = await fetch('/api/deliver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, deliveryDate, driverName, undo: true }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error)
      setDelivered(false)
      setDeliveredAt(null)
      setCanUndo(false)
      if (undoTimer.current) clearTimeout(undoTimer.current)
      onDeliveryChange?.()
    } catch (err) {
      alert('Undo failed: ' + err.message)
    }
  }

  function handleRemovePhoto(idx) {
    setPhotos(prev => prev.filter((_, i) => i !== idx))
  }

  // Swipe-to-deliver handlers
  const onTouchStart = useCallback((e) => {
    if (delivered || expanded) return
    touchStart.current = e.touches[0].clientX
    touchDelta.current = 0
  }, [delivered, expanded])

  const onTouchMove = useCallback((e) => {
    if (!touchStart.current || delivered || expanded) return
    const delta = e.touches[0].clientX - touchStart.current
    if (delta < 0) { touchDelta.current = 0; return } // Only swipe right
    touchDelta.current = delta
    if (delta > 20) setSwiping(true)
    if (cardRef.current && delta > 20) {
      const clamped = Math.min(delta, 150)
      cardRef.current.style.transform = `translateX(${clamped}px)`
      cardRef.current.style.opacity = `${1 - (clamped / 300)}`
    }
  }, [delivered, expanded])

  const onTouchEnd = useCallback(() => {
    if (!touchStart.current) return
    const delta = touchDelta.current
    touchStart.current = null
    setSwiping(false)
    if (cardRef.current) {
      cardRef.current.style.transform = ''
      cardRef.current.style.opacity = ''
    }
    if (delta > 120 && !delivered) {
      handleConfirmDelivery()
    }
  }, [delivered])

  return (
    <>
      <div
        ref={cardRef}
        className={`stop ${isColdChain ? 'stop--cold' : ''} ${isSigRequired ? 'stop--sig' : ''} ${isSelected ? 'stop--selected' : ''} ${delivered ? 'stop--delivered' : ''} ${swiping ? 'stop--swiping' : ''}`}
        draggable={isSelected}
        onDragStart={onExportDrag}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Swipe hint background */}
        {!delivered && !expanded && (
          <div className="stop__swipe-hint">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Deliver
          </div>
        )}

        <div className="stop__main" onClick={() => setExpanded(!expanded)}>
          {!delivered ? (
            <input
              type="checkbox"
              className="stop__checkbox"
              checked={isSelected || false}
              onChange={(e) => { e.stopPropagation(); onToggleSelect?.() }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : null}
          <div className={`stop__number ${delivered ? 'stop__number--done' : ''}`}>
            {delivered ? (
              <svg className="stop__check-anim" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            ) : (
              <>
                <span>{index}</span>
                <span className="stop__of">/{total}</span>
              </>
            )}
          </div>

          <div className="stop__info">
            <div className="stop__top-row">
              <h4 className={`stop__name ${delivered ? 'stop__name--done' : ''}`}>{name}</h4>
              {isColdChain && <span className="stop__badge stop__badge--cold">Cold Chain</span>}
              {isSigRequired && <span className="stop__badge stop__badge--sig">Sig Required</span>}
              {pharmacy && !delivered && <span className="stop__badge stop__badge--pharma">{pharmacy}</span>}
              {delivered && <span className="stop__badge stop__badge--delivered">Delivered</span>}
            </div>
            <p className={`stop__address ${delivered ? 'stop__address--done' : ''}`}>{fullAddress || 'No address'}</p>
            {orderId && <p className="stop__order">Order #{orderId}</p>}
          </div>

          <svg
            className={`stop__chevron ${expanded ? 'stop__chevron--open' : ''}`}
            width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>

        {expanded && (
          <div className="stop__details">
            {notes && (
              <div className="stop__notes">
                <span className="stop__notes-label">Notes:</span> {notes}
              </div>
            )}
            {/* Photo gallery */}
            {photos.length > 0 && (
              <div className="stop__photos">
                {photos.map((url, i) => (
                  <div key={i} className="stop__photo-thumb" onClick={() => setLightboxUrl(url)}>
                    <img src={url} alt={`Delivery photo ${i + 1}`} className="stop__photo-img" />
                    <span className="stop__photo-stamp">
                      {deliveredAt ? new Date(deliveredAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''}
                    </span>
                    {!delivered && (
                      <button className="stop__photo-remove" onClick={(e) => { e.stopPropagation(); handleRemovePhoto(i) }} title="Remove photo">&times;</button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="stop__actions">
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="stop__btn stop__btn--maps">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                Maps
              </a>
              {!delivered ? (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="stop__file-input"
                    onChange={handleAddPhoto}
                  />
                  <button
                    className="stop__btn stop__btn--add-photo"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                      <circle cx="12" cy="13" r="4"/>
                    </svg>
                    {uploading ? 'Uploading...' : photos.length > 0 ? `Photo (${photos.length})` : 'Add Photo'}
                  </button>
                  <button
                    className="stop__btn stop__btn--deliver"
                    onClick={handleConfirmDelivery}
                    disabled={delivering}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    {delivering ? 'Confirming...' : 'Confirm Delivery'}
                  </button>
                </>
              ) : (
                <div className="stop__delivered-row">
                  <span className="stop__delivered-label">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    Delivered{photos.length > 0 ? ` (${photos.length})` : ''}
                  </span>
                  {canUndo && (
                    <button className="stop__btn stop__btn--undo" onClick={handleUndo}>Undo</button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div className="stop__lightbox" onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="Delivery photo" className="stop__lightbox-img" />
          <button className="stop__lightbox-close">&times;</button>
        </div>
      )}
    </>
  )
}
