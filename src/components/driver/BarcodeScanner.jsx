import { useEffect, useRef, useState, useCallback } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import './BarcodeScanner.css'

export default function BarcodeScanner({ onScan, onClose }) {
  const scannerRef = useRef(null)
  const containerRef = useRef(null)
  const [error, setError] = useState(null)

  const cleanup = useCallback(() => {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => {})
      scannerRef.current.clear().catch(() => {})
      scannerRef.current = null
    }
  }, [])

  useEffect(() => {
    const containerId = 'barcode-reader'

    async function start() {
      try {
        const scanner = new Html5Qrcode(containerId)
        scannerRef.current = scanner

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 280, height: 150 },
            aspectRatio: 1.777,
          },
          (decodedText) => {
            // Success
            cleanup()
            onScan(decodedText)
          },
          () => {
            // Scan failure — ignore, keep scanning
          }
        )
      } catch (err) {
        setError(err?.message || err || 'Could not access camera')
      }
    }

    start()

    return () => { cleanup() }
  }, [cleanup, onScan])

  function handleCancel() {
    cleanup()
    onClose()
  }

  return (
    <div className="barcode-scanner">
      <div className="barcode-scanner__overlay">
        {error ? (
          <p className="barcode-scanner__error">{error}</p>
        ) : (
          <p className="barcode-scanner__hint">Point camera at a barcode</p>
        )}
        <div id="barcode-reader" ref={containerRef} className="barcode-scanner__reader" />
        <button className="barcode-scanner__cancel" onClick={handleCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
