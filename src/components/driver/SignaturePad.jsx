import { useRef, useEffect, useCallback } from 'react'
import './SignaturePad.css'

export default function SignaturePad({ onSave, onCancel }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const lastPoint = useRef(null)

  const getPoint = useCallback((e) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if (e.touches && e.touches.length > 0) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      }
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }, [])

  const startDraw = useCallback((e) => {
    e.preventDefault()
    drawing.current = true
    lastPoint.current = getPoint(e)
  }, [getPoint])

  const moveDraw = useCallback((e) => {
    e.preventDefault()
    if (!drawing.current) return
    const ctx = canvasRef.current.getContext('2d')
    const point = getPoint(e)
    ctx.beginPath()
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y)
    ctx.lineTo(point.x, point.y)
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
    lastPoint.current = point
  }, [getPoint])

  const endDraw = useCallback((e) => {
    e.preventDefault()
    drawing.current = false
    lastPoint.current = null
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Set canvas resolution
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * 2
    canvas.height = rect.height * 2

    // Fill white background
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Touch events
    canvas.addEventListener('touchstart', startDraw, { passive: false })
    canvas.addEventListener('touchmove', moveDraw, { passive: false })
    canvas.addEventListener('touchend', endDraw, { passive: false })

    // Mouse events
    canvas.addEventListener('mousedown', startDraw)
    canvas.addEventListener('mousemove', moveDraw)
    canvas.addEventListener('mouseup', endDraw)
    canvas.addEventListener('mouseleave', endDraw)

    return () => {
      canvas.removeEventListener('touchstart', startDraw)
      canvas.removeEventListener('touchmove', moveDraw)
      canvas.removeEventListener('touchend', endDraw)
      canvas.removeEventListener('mousedown', startDraw)
      canvas.removeEventListener('mousemove', moveDraw)
      canvas.removeEventListener('mouseup', endDraw)
      canvas.removeEventListener('mouseleave', endDraw)
    }
  }, [startDraw, moveDraw, endDraw])

  function handleClear() {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  function handleDone() {
    const canvas = canvasRef.current
    canvas.toBlob((blob) => {
      if (blob) onSave(blob)
    }, 'image/png')
  }

  return (
    <div className="sigpad__overlay">
      <div className="sigpad__container">
        <h3 className="sigpad__title">Signature</h3>
        <canvas ref={canvasRef} className="sigpad__canvas" />
        <div className="sigpad__actions">
          <button className="sigpad__btn sigpad__btn--cancel" onClick={onCancel}>Cancel</button>
          <button className="sigpad__btn sigpad__btn--clear" onClick={handleClear}>Clear</button>
          <button className="sigpad__btn sigpad__btn--done" onClick={handleDone}>Done</button>
        </div>
      </div>
    </div>
  )
}
