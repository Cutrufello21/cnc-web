import { useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import './StopCard.css'

export default function StopCard({ stop, index, total, isSelected, onToggleSelect, onExportDrag, deliveryDate, driverName }) {
  const [expanded, setExpanded] = useState(false)
  const [delivering, setDelivering] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [delivered, setDelivered] = useState(stop.status === 'delivered')
  const [deliveredAt, setDeliveredAt] = useState(stop.delivered_at || null)
  const [photos, setPhotos] = useState(() => {
    // Parse existing photos from DB — supports both single url and JSON array
    if (stop.photo_urls && Array.isArray(stop.photo_urls)) return stop.photo_urls
    if (stop.photo_url) return [stop.photo_url]
    return []
  })
  const fileRef = useRef(null)

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

  async function handleAddPhoto(e) {
    const file = e.target.files?.[0]
    if (!file || uploading) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${deliveryDate}/${orderId}_${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('delivery-photos')
        .upload(path, file, { contentType: file.type })
      if (uploadErr) throw new Error(uploadErr.message)

      const { data: urlData } = supabase.storage
        .from('delivery-photos')
        .getPublicUrl(path)
      const photoUrl = urlData?.publicUrl || null
      if (photoUrl) setPhotos(prev => [...prev, photoUrl])
    } catch (err) {
      console.error('Photo upload error:', err)
      alert('Failed to upload photo: ' + err.message)
    } finally {
      setUploading(false)
      // Reset file input so same file can be re-selected
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
        body: JSON.stringify({
          orderId,
          deliveryDate,
          driverName,
          photoUrls: photos,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error)

      setDelivered(true)
      setDeliveredAt(new Date().toISOString())
    } catch (err) {
      console.error('Delivery error:', err)
      alert('Failed to mark as delivered: ' + err.message)
    } finally {
      setDelivering(false)
    }
  }

  function handleRemovePhoto(idx) {
    setPhotos(prev => prev.filter((_, i) => i !== idx))
  }

  // Map link — works on both iOS and Android
  const mapQuery = encodeURIComponent(fullAddress)
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`

  return (
    <div
      className={`stop ${isColdChain ? 'stop--cold' : ''} ${isSigRequired ? 'stop--sig' : ''} ${isSelected ? 'stop--selected' : ''} ${delivered ? 'stop--delivered' : ''}`}
      draggable={isSelected}
      onDragStart={onExportDrag}
    >
      <div className="stop__main" onClick={() => setExpanded(!expanded)}>
        <input
          type="checkbox"
          className="stop__checkbox"
          checked={isSelected || false}
          onChange={(e) => { e.stopPropagation(); onToggleSelect?.() }}
          onClick={(e) => e.stopPropagation()}
        />
        <div className="stop__number">
          <span>{index}</span>
          <span className="stop__of">/{total}</span>
        </div>

        <div className="stop__info">
          <div className="stop__top-row">
            <h4 className="stop__name">{name}</h4>
            {isColdChain && <span className="stop__badge stop__badge--cold">Cold Chain</span>}
            {isSigRequired && <span className="stop__badge stop__badge--sig">Sig Required</span>}
            {pharmacy && <span className="stop__badge stop__badge--pharma">{pharmacy}</span>}
            {delivered && <span className="stop__badge stop__badge--delivered">Delivered</span>}
          </div>
          <p className="stop__address">{fullAddress || 'No address'}</p>
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
                <div key={i} className="stop__photo-thumb">
                  <img src={url} alt={`Delivery photo ${i + 1}`} className="stop__photo-img" />
                  {!delivered && (
                    <button className="stop__photo-remove" onClick={() => handleRemovePhoto(i)} title="Remove photo">&times;</button>
                  )}
                </div>
              ))}
              {deliveredAt && (
                <span className="stop__photo-time">
                  Delivered {new Date(deliveredAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </span>
              )}
            </div>
          )}
          <div className="stop__actions">
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="stop__btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              Open in Maps
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
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                  {uploading ? 'Uploading...' : photos.length > 0 ? `Add Photo (${photos.length})` : 'Add Photo'}
                </button>
                <button
                  className="stop__btn stop__btn--deliver"
                  onClick={handleConfirmDelivery}
                  disabled={delivering}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  {delivering ? 'Confirming...' : 'Confirm Delivery'}
                </button>
              </>
            ) : (
              <span className="stop__delivered-label">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Delivered{photos.length > 0 ? ` (${photos.length} photo${photos.length > 1 ? 's' : ''})` : ''}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
