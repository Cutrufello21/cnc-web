import { useEffect, useRef, useState, useCallback } from 'react'
import './BarcodeScanner.css'

/**
 * Full-screen barcode scanner overlay.
 * Uses the BarcodeDetector API (Chrome/Edge) with a live camera stream.
 * Falls back to a "not supported" message on browsers without BarcodeDetector.
 *
 * Props:
 *   onScan(value: string)  — called with the decoded barcode string
 *   onClose()              — called when the user cancels
 */
export default function BarcodeScanner({ onScan, onClose }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const scanningRef = useRef(true)
  const [error, setError] = useState(null)
  const [supported, setSupported] = useState(true)

  const cleanup = useCallback(() => {
    scanningRef.current = false
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  useEffect(() => {
    // Check BarcodeDetector support
    if (!('BarcodeDetector' in window)) {
      setSupported(false)
      return
    }

    let detector
    let animFrame

    async function start() {
      try {
        detector = new window.BarcodeDetector({
          formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code', 'data_matrix'],
        })

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        streamRef.current = stream

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }

        // Scan loop
        async function scan() {
          if (!scanningRef.current || !videoRef.current) return
          try {
            const barcodes = await detector.detect(videoRef.current)
            if (barcodes.length > 0 && scanningRef.current) {
              scanningRef.current = false
              cleanup()
              onScan(barcodes[0].rawValue)
              return
            }
          } catch {
            // frame not ready yet, ignore
          }
          animFrame = requestAnimationFrame(scan)
        }

        scan()
      } catch (err) {
        setError(err.message || 'Could not access camera')
      }
    }

    start()

    return () => {
      scanningRef.current = false
      if (animFrame) cancelAnimationFrame(animFrame)
      cleanup()
    }
  }, [cleanup, onScan])

  function handleCancel() {
    cleanup()
    onClose()
  }

  if (!supported) {
    return (
      <div className="barcode-scanner">
        <div className="barcode-scanner__overlay">
          <p className="barcode-scanner__unsupported">
            Barcode scanning is not supported on this browser. Use Chrome or Edge on Android, or update to the latest browser version.
          </p>
          <button className="barcode-scanner__cancel" onClick={handleCancel}>
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="barcode-scanner">
      <video ref={videoRef} className="barcode-scanner__video" playsInline muted />
      <div className="barcode-scanner__overlay">
        {error ? (
          <p className="barcode-scanner__error">{error}</p>
        ) : (
          <>
            <div className="barcode-scanner__viewfinder" />
            <p className="barcode-scanner__hint">Point camera at a barcode</p>
          </>
        )}
        <button className="barcode-scanner__cancel" onClick={handleCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
