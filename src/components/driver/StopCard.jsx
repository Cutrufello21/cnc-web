import { useState, useRef, useEffect, useCallback } from 'react'
import { isOnline, queueDelivery, queuePhoto, processQueue } from '../../lib/offlineQueue'
import BarcodeScanner from './BarcodeScanner'
import SignaturePad from './SignaturePad'
import './StopCard.css'

const UNDO_WINDOW_MS = 120_000 // 2 minutes

const FAILURE_REASONS = ['Not home', 'Refused', 'Wrong address', 'Business closed', 'Access issue', 'Other']

export default function StopCard({ stop, index, total, isSelected, onToggleSelect, onExportDrag, deliveryDate, driverName, onDeliveryChange }) {
  const [expanded, setExpanded] = useState(false)
  const [delivering, setDelivering] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [delivered, setDelivered] = useState(stop.status === 'delivered')
  const [failed, setFailed] = useState(stop.status === 'failed')
  const [deliveredAt, setDeliveredAt] = useState(stop.delivered_at || null)
  const [canUndo, setCanUndo] = useState(false)
  const [queued, setQueued] = useState(false)
  const [deliveryNote, setDeliveryNote] = useState(stop.delivery_note || '')
  const [noteSaved, setNoteSaved] = useState(!!stop.delivery_note)
  const [savingNote, setSavingNote] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scannedBarcode, setScannedBarcode] = useState(stop.barcode || null)
  const [photos, setPhotos] = useState(() => {
    if (stop.photo_urls && Array.isArray(stop.photo_urls)) return stop.photo_urls
    if (stop.photo_url) return [stop.photo_url]
    return []
  })
  const [lightboxUrl, setLightboxUrl] = useState(null)
  const [signaturePadOpen, setSignaturePadOpen] = useState(false)
  const [signatureUrl, setSignatureUrl] = useState(stop.signature_url || null)
  const [failMenuOpen, setFailMenuOpen] = useState(false)
  const [customReason, setCustomReason] = useState('')
  const [failureReason, setFailureReason] = useState(stop.failure_reason || null)
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
  const packageCount = stop._packageCount || 1
  const consolidatedOrders = stop._consolidatedOrders || []
  const isConsolidated = packageCount > 1
  const allOrderIds = isConsolidated ? consolidatedOrders.map(o => o.orderId) : [orderId]

  const fullAddress = [address, city, zip ? `OH ${zip}` : ''].filter(Boolean).join(', ')
  const mapQuery = encodeURIComponent(fullAddress)
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`

  const isDone = delivered || failed
  const canConfirm = !!scannedBarcode && !!deliveryNote.trim()

  // Cleanup undo timer
  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current) }, [])

  // Process offline queue when coming back online
  useEffect(() => {
    function handleOnline() {
      processQueue().then((stats) => {
        if (stats.delivered > 0) {
          setQueued(false)
          onDeliveryChange?.()
        }
      }).catch(() => {})
    }
    window.addEventListener('online', handleOnline)
    // Also listen for service worker messages
    function handleSWMessage(e) {
      if (e.data?.type === 'PROCESS_OFFLINE_QUEUE') {
        handleOnline()
      }
    }
    navigator.serviceWorker?.addEventListener('message', handleSWMessage)
    return () => {
      window.removeEventListener('online', handleOnline)
      navigator.serviceWorker?.removeEventListener('message', handleSWMessage)
    }
  }, [onDeliveryChange])

  async function handleAddPhoto(e) {
    const file = e.target.files?.[0]
    if (!file || uploading) return
    setUploading(true)
    try {
      if (!isOnline()) {
        // Offline: queue photo in IndexedDB and show local preview
        await queuePhoto(file, deliveryDate, orderId)
        const localUrl = URL.createObjectURL(file)
        setPhotos(prev => [...prev, localUrl])
        setQueued(true)
      } else {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('deliveryDate', deliveryDate)
        formData.append('orderId', orderId)
        const res = await fetch('/api/upload-photo', { method: 'POST', body: formData })
        const result = await res.json()
        if (!res.ok) throw new Error(result.error)
        if (result.url) setPhotos(prev => [...prev, result.url])
      }
    } catch (err) {
      console.error('Photo upload error:', err)
      alert('Failed to upload photo: ' + err.message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleSignatureSave(blob) {
    setSignaturePadOpen(false)
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', blob, `signature_${orderId}_${Date.now()}.png`)
      formData.append('deliveryDate', deliveryDate)
      formData.append('orderId', orderId)
      const res = await fetch('/api/upload-photo', { method: 'POST', body: formData })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error)
      if (result.url) setSignatureUrl(result.url)
    } catch (err) {
      console.error('Signature upload error:', err)
      alert('Failed to upload signature: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleConfirmDelivery() {
    if (delivering || isDone) return
    setDelivering(true)
    try {
      if (!isOnline()) {
        // Offline: queue delivery for all order IDs in this stop
        for (const oid of allOrderIds) {
          await queueDelivery({ orderId: oid, deliveryDate, driverName, photoUrls: photos, barcode: scannedBarcode || undefined, signatureUrl: signatureUrl || undefined, deliveryNote: deliveryNote.trim() || undefined })
        }
        setDelivered(true)
        setDeliveredAt(new Date().toISOString())
        setQueued(true)
        onDeliveryChange?.()
      } else {
        const res = await fetch('/api/deliver', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderIds: allOrderIds, deliveryDate, driverName, photoUrls: photos, barcode: scannedBarcode || undefined, signatureUrl: signatureUrl || undefined, deliveryNote: deliveryNote.trim() || undefined }),
        })
        const result = await res.json()
        if (!res.ok) throw new Error(result.error)
        setDelivered(true)
        setDeliveredAt(new Date().toISOString())
        setCanUndo(true)
        onDeliveryChange?.()
        // Start undo window
        undoTimer.current = setTimeout(() => setCanUndo(false), UNDO_WINDOW_MS)
      }
    } catch (err) {
      console.error('Delivery error:', err)
      alert('Failed to mark as delivered: ' + err.message)
    } finally {
      setDelivering(false)
    }
  }

  async function handleFailDelivery(reason) {
    if (delivering || isDone) return
    setDelivering(true)
    setFailMenuOpen(false)
    try {
      const res = await fetch('/api/deliver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: allOrderIds, deliveryDate, driverName, failed: true, failureReason: reason }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error)
      setFailed(true)
      setFailureReason(reason)
      setDeliveredAt(new Date().toISOString())
      setCanUndo(true)
      onDeliveryChange?.()
      undoTimer.current = setTimeout(() => setCanUndo(false), UNDO_WINDOW_MS)
    } catch (err) {
      console.error('Fail delivery error:', err)
      alert('Failed to mark as failed: ' + err.message)
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
        body: JSON.stringify({ orderIds: allOrderIds, deliveryDate, driverName, undo: true }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error)
      setDelivered(false)
      setFailed(false)
      setDeliveredAt(null)
      setFailureReason(null)
      setCanUndo(false)
      if (undoTimer.current) clearTimeout(undoTimer.current)
      onDeliveryChange?.()
    } catch (err) {
      alert('Undo failed: ' + err.message)
    }
  }

  async function handleSaveNote() {
    if (!deliveryNote.trim() || savingNote) return
    setSavingNote(true)
    try {
      const res = await fetch('/api/deliver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: allOrderIds, deliveryDate, driverName, deliveryNote: deliveryNote.trim() }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error)
      setNoteSaved(true)
    } catch (err) {
      alert('Failed to save note: ' + err.message)
    } finally {
      setSavingNote(false)
    }
  }

  function handleRemovePhoto(idx) {
    setPhotos(prev => prev.filter((_, i) => i !== idx))
  }

  function handleBarcodeScan(value) {
    setScannedBarcode(value)
    setScannerOpen(false)
  }

  // Swipe-to-deliver handlers
  const onTouchStart = useCallback((e) => {
    if (isDone || expanded) return
    touchStart.current = e.touches[0].clientX
    touchDelta.current = 0
  }, [isDone, expanded])

  const onTouchMove = useCallback((e) => {
    if (!touchStart.current || isDone || expanded) return
    const delta = e.touches[0].clientX - touchStart.current
    if (delta < 0) { touchDelta.current = 0; return } // Only swipe right
    touchDelta.current = delta
    if (delta > 20) setSwiping(true)
    if (cardRef.current && delta > 20) {
      const clamped = Math.min(delta, 150)
      cardRef.current.style.transform = `translateX(${clamped}px)`
      cardRef.current.style.opacity = `${1 - (clamped / 300)}`
    }
  }, [isDone, expanded])

  const onTouchEnd = useCallback(() => {
    if (!touchStart.current) return
    const delta = touchDelta.current
    touchStart.current = null
    setSwiping(false)
    if (cardRef.current) {
      cardRef.current.style.transform = ''
      cardRef.current.style.opacity = ''
    }
    if (delta > 120 && !isDone) {
      handleConfirmDelivery()
    }
  }, [isDone])

  return (
    <>
      <div
        ref={cardRef}
        className={`stop ${isColdChain ? 'stop--cold' : ''} ${isSigRequired ? 'stop--sig' : ''} ${isSelected ? 'stop--selected' : ''} ${delivered ? (queued ? 'stop--queued' : 'stop--delivered') : ''} ${failed ? 'stop--failed' : ''} ${swiping ? 'stop--swiping' : ''}`}
        draggable={isSelected}
        onDragStart={onExportDrag}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Swipe hint background */}
        {!isDone && !expanded && (
          <div className="stop__swipe-hint">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Deliver
          </div>
        )}

        <div className="stop__main" onClick={() => setExpanded(!expanded)}>
          {!isDone ? (
            <input
              type="checkbox"
              className="stop__checkbox"
              checked={isSelected || false}
              onChange={(e) => { e.stopPropagation(); onToggleSelect?.() }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : null}
          <div className={`stop__number ${delivered ? (queued ? 'stop__number--queued' : 'stop__number--done') : ''} ${failed ? 'stop__number--failed' : ''}`}>
            {isDone ? (
              failed ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              ) : queued ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
              ) : (
                <svg className="stop__check-anim" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )
            ) : (
              <>
                <span>{index}</span>
                <span className="stop__of">/{total}</span>
              </>
            )}
          </div>

          <div className="stop__info">
            <div className="stop__top-row">
              <h4 className={`stop__name ${isDone ? 'stop__name--done' : ''}`}>{name}</h4>
              {isConsolidated && <span className="stop__package-count">{packageCount} packages</span>}
              {isColdChain && <span className="stop__badge stop__badge--cold">Cold Chain</span>}
              {isSigRequired && <span className="stop__badge stop__badge--sig">Sig Required</span>}
              {pharmacy && !isDone && <span className="stop__badge stop__badge--pharma">{pharmacy}</span>}
              {delivered && !queued && <span className="stop__badge stop__badge--delivered">Delivered</span>}
              {delivered && queued && <span className="stop__badge stop__badge--queued">Queued</span>}
              {failed && <span className="stop__badge stop__badge--failed">Failed</span>}
              {signatureUrl && <span className="stop__badge stop__badge--signed">Signed</span>}
              {scannedBarcode && <span className="stop__badge stop__badge--barcode" title={scannedBarcode}>{scannedBarcode.length > 12 ? scannedBarcode.slice(0, 12) + '...' : scannedBarcode}</span>}
            </div>
            <p className={`stop__address ${isDone ? 'stop__address--done' : ''}`}>{fullAddress || 'No address'}</p>
            {!isConsolidated && orderId && <p className="stop__order">Order #{orderId}</p>}
            {isConsolidated && <p className="stop__order">{allOrderIds.map(id => `#${id}`).join(', ')}</p>}
            {failed && failureReason && <p className="stop__failure-reason">{failureReason}</p>}
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
            {isConsolidated && (
              <div className="stop__sub-orders">
                <div className="stop__sub-orders-title">{packageCount} orders at this address</div>
                {consolidatedOrders.map((o, i) => (
                  <div key={o.orderId || i} className="stop__sub-order">
                    <span className="stop__sub-order-id">#{o.orderId}</span>
                    <span className="stop__sub-order-name">{o.name}</span>
                    {o.coldChain && <span className="stop__badge stop__badge--cold">CC</span>}
                    {o.sigRequired && <span className="stop__badge stop__badge--sig">Sig</span>}
                  </div>
                ))}
              </div>
            )}
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
                    {!isDone && (
                      <button className="stop__photo-remove" onClick={(e) => { e.stopPropagation(); handleRemovePhoto(i) }} title="Remove photo">&times;</button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {/* Signature thumbnail */}
            {signatureUrl && (
              <div className="stop__signature-preview">
                <img src={signatureUrl} alt="Signature" className="stop__signature-img" onClick={() => setLightboxUrl(signatureUrl)} />
                <span className="stop__signature-label">Signature captured</span>
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
              {!isDone ? (
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
                  {isSigRequired && (
                    <button
                      className={`stop__btn stop__btn--sign ${signatureUrl ? 'stop__btn--sign-done' : ''}`}
                      onClick={() => setSignaturePadOpen(true)}
                      disabled={uploading}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                      </svg>
                      {signatureUrl ? 'Re-sign' : 'Sign'}
                    </button>
                  )}
                  <button
                    className="stop__btn stop__btn--scan"
                    onClick={() => setScannerOpen(true)}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 7V5a2 2 0 0 1 2-2h2"/>
                      <path d="M17 3h2a2 2 0 0 1 2 2v2"/>
                      <path d="M21 17v2a2 2 0 0 1-2 2h-2"/>
                      <path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
                      <line x1="7" y1="12" x2="17" y2="12"/>
                    </svg>
                    {scannedBarcode ? 'Rescan' : 'Scan'}
                  </button>
                  <div className="stop__note-form stop__note-form--inline">
                    <input
                      type="text"
                      className="stop__note-field"
                      placeholder="Where was it left? (required)"
                      value={deliveryNote}
                      onChange={(e) => setDeliveryNote(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && canConfirm) handleConfirmDelivery() }}
                    />
                  </div>
                  {!scannedBarcode && (
                    <p className="stop__require-hint">Scan barcode to enable delivery</p>
                  )}
                  {scannedBarcode && !deliveryNote.trim() && (
                    <p className="stop__require-hint">Add a delivery note to confirm</p>
                  )}
                  <button
                    className="stop__btn stop__btn--deliver"
                    onClick={handleConfirmDelivery}
                    disabled={delivering || !canConfirm}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    {delivering ? 'Confirming...' : 'Confirm Delivery'}
                  </button>
                  <button
                    className="stop__btn stop__btn--cant-deliver"
                    onClick={() => setFailMenuOpen(!failMenuOpen)}
                    disabled={delivering}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                    Can't Deliver
                  </button>
                  {failMenuOpen && (
                    <div className="stop__fail-menu">
                      {FAILURE_REASONS.map(reason => (
                        <button
                          key={reason}
                          className="stop__fail-option"
                          onClick={() => {
                            if (reason === 'Other') {
                              const custom = prompt('Enter reason:')
                              if (custom && custom.trim()) handleFailDelivery(custom.trim())
                            } else {
                              handleFailDelivery(reason)
                            }
                          }}
                        >
                          {reason}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="stop__delivered-row">
                    <span className={`stop__delivered-label ${queued ? 'stop__delivered-label--queued' : ''} ${failed ? 'stop__delivered-label--failed' : ''}`}>
                      {failed ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                        </svg>
                      ) : queued ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/>
                          <polyline points="12 6 12 12 16 14"/>
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      )}
                      {failed ? `Failed: ${failureReason || 'Unknown'}` : queued ? 'Queued' : 'Delivered'}{photos.length > 0 ? ` (${photos.length})` : ''}
                    </span>
                    {canUndo && (
                      <button className="stop__btn stop__btn--undo" onClick={handleUndo}>Undo</button>
                    )}
                  </div>
                  {delivered && !failed && deliveryNote && (
                    <p className="stop__note-saved">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      {deliveryNote}
                    </p>
                  )}
                </>
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

      {/* Barcode Scanner */}
      {scannerOpen && (
        <BarcodeScanner
          onScan={handleBarcodeScan}
          onClose={() => setScannerOpen(false)}
        />
      )}

      {/* Signature Pad */}
      {signaturePadOpen && (
        <SignaturePad
          onSave={handleSignatureSave}
          onCancel={() => setSignaturePadOpen(false)}
        />
      )}
    </>
  )
}
