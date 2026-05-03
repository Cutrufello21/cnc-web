import jsPDF from 'jspdf'
import { supabase } from './supabase'

// Re-fetch confirmation row directly so the PDF is correct even if caller didn't pass one
async function fetchConfirmation(stop) {
  if (!stop) return null
  try {
    const stopId = String(stop.id || stop.order_id)
    const { data } = await supabase
      .from('delivery_confirmations')
      .select('gps_distance_feet, geofence_overridden, barcode_scanned, barcode_value, barcode_matched, barcode_overridden, photo_package_url, photo_house_url, signature_url, recipient_name, delivery_note, handed_directly')
      .eq('stop_id', stopId)
      .order('delivered_at', { ascending: false })
      .limit(1)
    return data?.[0] || null
  } catch { return null }
}

// Convert image URL to base64 data URL.
// SVG sources are rasterized to PNG via canvas so jsPDF can embed them.
async function loadImage(url) {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
    if (!dataUrl) return null
    const isSvg = dataUrl.startsWith('data:image/svg+xml') || /\.svg(\?|$)/i.test(url)
    if (!isSvg) return dataUrl
    // Rasterize SVG → PNG via canvas (jsPDF can't embed SVG directly)
    return await new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const w = img.naturalWidth || 600
        const h = img.naturalHeight || 200
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
        try { resolve(canvas.toDataURL('image/png')) } catch { resolve(null) }
      }
      img.onerror = () => resolve(null)
      img.src = dataUrl
    })
  } catch {
    return null
  }
}

// Get image dimensions that fit within maxW x maxH while preserving aspect ratio
function fitImage(imgData, maxW, maxH) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      let w = img.width
      let h = img.height
      if (w > maxW) { h = h * (maxW / w); w = maxW }
      if (h > maxH) { w = w * (maxH / h); h = maxH }
      resolve({ w, h })
    }
    img.onerror = () => resolve({ w: maxW, h: maxH * 0.5 })
    img.src = imgData
  })
}

function formatTime(dt) {
  if (!dt) return '-'
  try {
    return new Date(dt).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    })
  } catch { return '-' }
}

// Generate a single POD PDF for one delivery stop
export async function generatePodPdf(stop, confirmation) {
  // Self-fetch if caller didn't pass one (or it hadn't loaded yet) — keeps PDF accurate
  if (!confirmation) confirmation = await fetchConfirmation(stop)
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 40
  const contentW = pageW - margin * 2
  let y = margin

  // --- Header ---
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(10, 36, 99) // navy
  doc.text('CNC Delivery', margin, y)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(120, 120, 120)
  doc.text('Proof of Delivery', pageW - margin, y, { align: 'right' })

  y += 8
  doc.setDrawColor(10, 36, 99)
  doc.setLineWidth(1.5)
  doc.line(margin, y, pageW - margin, y)
  y += 24

  // --- Delivery Info ---
  const addRow = (label, value) => {
    if (!value || value === '-') return
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(100, 100, 100)
    doc.text(label, margin, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(30, 30, 30)
    doc.text(String(value), margin + 100, y)
    y += 16
  }

  addRow('Patient', stop.patient_name)
  addRow('Address', `${stop.address || ''}${stop.city ? `, ${stop.city}` : ''}${stop.zip ? ` ${stop.zip}` : ''}`)
  addRow('Order ID', stop.order_id)
  addRow('Driver', stop.driver_name)
  addRow('Delivered', formatTime(stop.delivered_at))
  addRow('Status', stop.status === 'delivered' ? 'Delivered' : stop.status === 'failed' ? 'Failed' : 'Pending')

  if (stop.delivery_lat && stop.delivery_lng) {
    addRow('GPS', `${stop.delivery_lat}, ${stop.delivery_lng}`)
  }

  if (stop.cold_chain) {
    addRow('Cold Chain', 'Yes')
  }

  if (stop.delivery_note) {
    addRow('Note', stop.delivery_note)
  }

  y += 12

  // --- Photos (deduped, laid out in a 2-column grid) ---
  const seen = new Set()
  const photoUrls = []
  const pushUnique = (u) => { if (u && !seen.has(u)) { seen.add(u); photoUrls.push(u) } }
  pushUnique(stop.photo_url)
  if (stop.photo_urls) {
    try {
      const parsed = typeof stop.photo_urls === 'string' ? JSON.parse(stop.photo_urls) : stop.photo_urls
      if (Array.isArray(parsed)) parsed.forEach(pushUnique)
    } catch {}
  }

  // --- POD Verification (compliance row) ---
  const handedDirectly = !!confirmation?.handed_directly
  const geoVerified = !!confirmation && !confirmation.geofence_overridden && confirmation.gps_distance_feet != null
  const barcodeOk = !!(confirmation?.barcode_scanned && confirmation?.barcode_matched)
  const photosOk = photoUrls.length >= 2 || (handedDirectly && photoUrls.length >= 1)
  const sigOk = !!stop.signature_url
  const sigRequired = !!stop.sig_required || (stop.notes || '').toLowerCase().includes('signature')

  const checks = [
    {
      label: 'Geofence',
      pass: geoVerified,
      value: geoVerified
        ? `In Range${confirmation.gps_distance_feet != null ? ` (${Math.round(confirmation.gps_distance_feet)} ft)` : ''}`
        : confirmation?.geofence_overridden ? 'Overridden' : 'Not Verified',
    },
    {
      label: 'Barcode',
      pass: barcodeOk,
      value: barcodeOk ? 'Matched' : confirmation?.barcode_scanned ? 'Mismatch' : 'Not Scanned',
    },
    {
      label: 'Photos',
      pass: photosOk,
      value: handedDirectly ? `${photoUrls.length} (Handed Directly)` : `${photoUrls.length} of 2 min`,
    },
    // Only include signature pill if it was required, OR was captured anyway
    ...(sigRequired || sigOk ? [{
      label: 'Signature',
      pass: sigOk,
      value: sigOk ? 'Captured' : 'Not Captured',
    }] : []),
  ]

  const pillH = 32
  const pillGap = 8
  const pillW = (contentW - pillGap * (checks.length - 1)) / checks.length
  checks.forEach((c, i) => {
    const px = margin + i * (pillW + pillGap)
    if (c.pass) {
      doc.setFillColor(220, 252, 231)
      doc.setDrawColor(22, 163, 74)
    } else {
      doc.setFillColor(254, 226, 226)
      doc.setDrawColor(220, 38, 38)
    }
    doc.setLineWidth(0.6)
    doc.roundedRect(px, y, pillW, pillH, 4, 4, 'FD')
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(c.pass ? 22 : 153, c.pass ? 101 : 27, c.pass ? 52 : 27)
    doc.text(c.label.toUpperCase(), px + pillW / 2, y + 12, { align: 'center' })
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(String(c.value), px + pillW / 2, y + 24, { align: 'center' })
  })
  y += pillH + 14

  if (photoUrls.length > 0) {
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(10, 36, 99)
    doc.text('Delivery Photos', margin, y)
    y += 14

    // Reserve room below for signature (~140pt) so we don't overflow the page
    const pageH = doc.internal.pageSize.getHeight()
    const reservedBottom = stop.signature_url ? 160 : 60
    const available = pageH - margin - y - reservedBottom

    // Layout: 1 photo full-width; 2+ photos side-by-side, two rows max
    const cols = photoUrls.length === 1 ? 1 : 2
    const gap = 10
    const cellW = (contentW - gap * (cols - 1)) / cols
    const rows = Math.ceil(photoUrls.length / cols)
    const maxCellH = Math.max(120, Math.floor((available - gap * (rows - 1)) / rows))

    for (let i = 0; i < photoUrls.length; i++) {
      const imgData = await loadImage(photoUrls[i])
      if (!imgData) continue
      const { w, h } = await fitImage(imgData, cellW, maxCellH)
      const col = i % cols
      const row = Math.floor(i / cols)
      const x = margin + col * (cellW + gap) + (cellW - w) / 2
      const py = y + row * (maxCellH + gap)
      try { doc.addImage(imgData, 'JPEG', x, py, w, h) } catch {}
    }
    y += rows * maxCellH + (rows - 1) * gap + 12
  }

  // --- Signature ---
  if (stop.signature_url) {
    if (y + 140 > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage()
      y = margin
    }

    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(10, 36, 99)
    doc.text('Signature', margin, y)
    y += 16

    const sigData = await loadImage(stop.signature_url)
    if (sigData) {
      const { w, h } = await fitImage(sigData, 200, 80)
      // White background box for signature
      doc.setFillColor(255, 255, 255)
      doc.setDrawColor(200, 200, 200)
      doc.roundedRect(margin, y, w + 16, h + 16, 4, 4, 'FD')
      try {
        doc.addImage(sigData, 'PNG', margin + 8, y + 8, w, h)
      } catch {}
      y += h + 28
    }
  }

  // --- Footer ---
  const pageCount = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(160, 160, 160)
    doc.text(
      `CNC Delivery Service — Proof of Delivery — Generated ${new Date().toLocaleDateString('en-US')}`,
      pageW / 2,
      doc.internal.pageSize.getHeight() - 20,
      { align: 'center' }
    )
  }

  return doc
}

// Download single POD PDF
export async function downloadPodPdf(stop, confirmation) {
  const doc = await generatePodPdf(stop, confirmation)
  const name = (stop.patient_name || 'delivery').replace(/[^a-zA-Z0-9]/g, '_')
  doc.save(`POD_${name}_${stop.delivery_date || 'unknown'}.pdf`)
}

// Download bulk POD PDF (multiple stops on one document)
export async function downloadBulkPodPdf(stops, date) {
  if (stops.length === 0) return

  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 40

  // Batch-fetch confirmations once so each page can show accurate compliance pills
  const confirmationByStopId = {}
  try {
    const ids = stops.map(s => String(s.id || s.order_id)).filter(Boolean)
    if (ids.length > 0) {
      const { data } = await supabase
        .from('delivery_confirmations')
        .select('stop_id, gps_distance_feet, geofence_overridden, barcode_scanned, barcode_matched, handed_directly')
        .in('stop_id', ids)
      ;(data || []).forEach(c => { if (!confirmationByStopId[c.stop_id]) confirmationByStopId[c.stop_id] = c })
    }
  } catch {}

  for (let idx = 0; idx < stops.length; idx++) {
    if (idx > 0) doc.addPage()
    const stop = stops[idx]
    const confirmation = confirmationByStopId[String(stop.id || stop.order_id)] || null

    // Reuse single-stop generation by creating a temp doc and copying
    // Actually, simpler to just build each page inline
    let y = margin

    // Header
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(10, 36, 99)
    doc.text('CNC Delivery — Proof of Delivery', margin, y)

    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(120, 120, 120)
    doc.text(`${idx + 1} of ${stops.length}`, pageW - margin, y, { align: 'right' })

    y += 8
    doc.setDrawColor(10, 36, 99)
    doc.setLineWidth(1)
    doc.line(margin, y, pageW - margin, y)
    y += 20

    // Info rows
    const addRow = (label, value) => {
      if (!value || value === '-') return
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(100, 100, 100)
      doc.text(label, margin, y)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(30, 30, 30)
      doc.text(String(value), margin + 90, y)
      y += 15
    }

    addRow('Patient', stop.patient_name)
    addRow('Address', `${stop.address || ''}${stop.city ? `, ${stop.city}` : ''}${stop.zip ? ` ${stop.zip}` : ''}`)
    addRow('Driver', stop.driver_name)
    addRow('Time', formatTime(stop.delivered_at))
    if (stop.cold_chain) addRow('Cold Chain', 'Yes')
    if (stop.delivery_note) addRow('Note', stop.delivery_note)
    if (stop.delivery_lat) addRow('GPS', `${stop.delivery_lat}, ${stop.delivery_lng}`)

    y += 8

    // Photos (deduped, side-by-side in bulk mode)
    const seen = new Set()
    const photoUrls = []
    const pushUnique = (u) => { if (u && !seen.has(u)) { seen.add(u); photoUrls.push(u) } }
    pushUnique(stop.photo_url)
    if (stop.photo_urls) {
      try {
        const parsed = typeof stop.photo_urls === 'string' ? JSON.parse(stop.photo_urls) : stop.photo_urls
        if (Array.isArray(parsed)) parsed.forEach(pushUnique)
      } catch {}
    }

    // POD compliance row — full 4-pill layout
    {
      const handedDirectly = !!confirmation?.handed_directly
      const geoVerified = !!confirmation && !confirmation.geofence_overridden && confirmation.gps_distance_feet != null
      const barcodeOk = !!(confirmation?.barcode_scanned && confirmation?.barcode_matched)
      const photosOk = photoUrls.length >= 2 || (handedDirectly && photoUrls.length >= 1)
      const sigOk = !!stop.signature_url
      const sigRequired = !!stop.sig_required || (stop.notes || '').toLowerCase().includes('signature')
      const checks = [
        {
          label: 'Geofence',
          pass: geoVerified,
          value: geoVerified ? 'In Range' : confirmation?.geofence_overridden ? 'Overridden' : 'Not Verified',
        },
        {
          label: 'Barcode',
          pass: barcodeOk,
          value: barcodeOk ? 'Matched' : confirmation?.barcode_scanned ? 'Mismatch' : 'Not Scanned',
        },
        {
          label: 'Photos',
          pass: photosOk,
          value: handedDirectly ? `${photoUrls.length} (Handed)` : `${photoUrls.length} of 2 min`,
        },
        ...(sigRequired || sigOk ? [{
          label: 'Signature',
          pass: sigOk,
          value: sigOk ? 'Captured' : 'Not Captured',
        }] : []),
      ]
      const contentW = pageW - margin * 2
      const pillH = 26
      const pillGap = 6
      const pillW = (contentW - pillGap * (checks.length - 1)) / checks.length
      checks.forEach((c, i) => {
        const px = margin + i * (pillW + pillGap)
        if (c.pass) { doc.setFillColor(220, 252, 231); doc.setDrawColor(22, 163, 74) }
        else { doc.setFillColor(254, 226, 226); doc.setDrawColor(220, 38, 38) }
        doc.setLineWidth(0.5)
        doc.roundedRect(px, y, pillW, pillH, 3, 3, 'FD')
        doc.setFontSize(7)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(c.pass ? 22 : 153, c.pass ? 101 : 27, c.pass ? 52 : 27)
        doc.text(c.label.toUpperCase(), px + pillW / 2, y + 10, { align: 'center' })
        doc.setFontSize(8)
        doc.setFont('helvetica', 'normal')
        doc.text(String(c.value), px + pillW / 2, y + 20, { align: 'center' })
      })
      y += pillH + 10
    }

    if (photoUrls.length > 0) {
      const contentW = pageW - margin * 2
      const reservedBottom = stop.signature_url ? 100 : 40
      const available = doc.internal.pageSize.getHeight() - 40 - y - reservedBottom

      const visible = photoUrls.slice(0, 4)
      const cols = visible.length === 1 ? 1 : 2
      const gap = 8
      const cellW = (contentW - gap * (cols - 1)) / cols
      const rows = Math.ceil(visible.length / cols)
      const maxCellH = Math.max(100, Math.floor((available - gap * (rows - 1)) / rows))

      for (let i = 0; i < visible.length; i++) {
        const imgData = await loadImage(visible[i])
        if (!imgData) continue
        const { w, h } = await fitImage(imgData, cellW, maxCellH)
        const col = i % cols
        const row = Math.floor(i / cols)
        const x = margin + col * (cellW + gap) + (cellW - w) / 2
        const py = y + row * (maxCellH + gap)
        try { doc.addImage(imgData, 'JPEG', x, py, w, h) } catch {}
      }
      y += rows * maxCellH + (rows - 1) * gap + 8
    }

    // Signature
    if (stop.signature_url) {
      const sigData = await loadImage(stop.signature_url)
      if (sigData && y + 60 < doc.internal.pageSize.getHeight() - 40) {
        doc.setFontSize(8)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(100, 100, 100)
        doc.text('Signature:', margin, y)
        y += 10
        const { w, h } = await fitImage(sigData, 160, 50)
        try {
          doc.addImage(sigData, 'PNG', margin, y, w, h)
        } catch {}
      }
    }
  }

  // Footer on all pages
  const pageCount = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(160, 160, 160)
    doc.text(
      `CNC Delivery Service — POD Report for ${date} — Generated ${new Date().toLocaleDateString('en-US')}`,
      pageW / 2,
      doc.internal.pageSize.getHeight() - 20,
      { align: 'center' }
    )
  }

  doc.save(`POD_Report_${date}.pdf`)
}
