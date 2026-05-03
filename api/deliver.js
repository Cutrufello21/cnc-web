import { createClient } from '@supabase/supabase-js'
import { requireAuth } from './_lib/auth.js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxw2xx2atYfnEfGzCaTmkDShmt96D1JsLFSckScOndB94RV2IGev63fpS7Ndc0GqSHWWQ/exec'
const ADMIN_EMAIL = 'dominiccutrufello@gmail.com'

// Send failed delivery alert email (non-blocking)
async function sendFailedAlert(failedStops) {
  if (!failedStops || failedStops.length === 0) return

  // Group by pharmacy
  const byPharmacy = {}
  failedStops.forEach(s => {
    const p = s.pharmacy || 'Unknown'
    if (!byPharmacy[p]) byPharmacy[p] = []
    byPharmacy[p].push(s)
  })

  // Fetch pharmacy portal users
  const { data: pharmacyUsers } = await supabase
    .from('profiles')
    .select('email, pharmacy_name, role')
    .eq('role', 'pharmacy')

  const pharmacyEmails = {}
  if (pharmacyUsers) {
    pharmacyUsers.forEach(u => {
      if (u.email && u.pharmacy_name) {
        if (!pharmacyEmails[u.pharmacy_name]) pharmacyEmails[u.pharmacy_name] = []
        pharmacyEmails[u.pharmacy_name].push(u.email)
      }
    })
  }

  for (const [pharmacy, stops] of Object.entries(byPharmacy)) {
    const stopRows = stops.map(s =>
      `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #fde8e8;">${s.patient_name || '-'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #fde8e8;">${s.address || '-'}${s.city ? `, ${s.city}` : ''}${s.zip ? ` ${s.zip}` : ''}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #fde8e8;">${s.driver_name || '-'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #fde8e8;">${s.failure_reason || 'Unknown'}</td>
      </tr>`
    ).join('')

    const count = stops.length
    const subject = `⚠ Failed Delivery${count > 1 ? ` (${count})` : ''} — ${pharmacy} — ${stops[0]?.patient_name || 'Unknown'}`

    const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px;">
    <div style="background:#dc2626;border-radius:10px 10px 0 0;padding:20px 24px;">
      <h1 style="margin:0;color:#fff;font-size:18px;font-weight:700;">Failed Delivery Alert</h1>
      <p style="margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:12px;">CNC Delivery — ${pharmacy}</p>
    </div>
    <div style="background:#fff;border-radius:0 0 10px 10px;padding:24px;">
      <p style="margin:0 0 16px;font-size:14px;color:#1a1a1a;">
        ${count} delivery${count > 1 ? 's have' : ' has'} been marked as <strong style="color:#dc2626;">failed</strong>.
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#fef2f2;">
            <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:600;color:#6B7280;text-transform:uppercase;">Patient</th>
            <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:600;color:#6B7280;text-transform:uppercase;">Address</th>
            <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:600;color:#6B7280;text-transform:uppercase;">Driver</th>
            <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:600;color:#6B7280;text-transform:uppercase;">Reason</th>
          </tr>
        </thead>
        <tbody>${stopRows}</tbody>
      </table>
      <div style="text-align:center;margin-top:20px;">
        <a href="https://cncdelivery.com/portal/dashboard" style="display:inline-block;background:#0A2463;color:#fff;padding:10px 24px;border-radius:6px;font-size:13px;font-weight:600;text-decoration:none;">View Portal</a>
      </div>
    </div>
    <p style="text-align:center;font-size:11px;color:#9CA3AF;margin-top:16px;">
      CNC Delivery Service — The last mile in patient care
    </p>
  </div>
</body></html>`

    const recipients = [...new Set([...(pharmacyEmails[pharmacy] || []), ADMIN_EMAIL])]
    for (const email of recipients) {
      try {
        await fetch(APPS_SCRIPT_URL, {
          method: 'POST',
          body: JSON.stringify({ action: 'email', to: email, subject, html }),
        })
      } catch {}
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  // Auth check
  const user = await requireAuth(req, res, { allowApiSecret: true })
  if (!user) return

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})

    // Batch mode — process multiple deliveries in one request (offline queue flush)
    if (body.batch && Array.isArray(body.batch)) {
      const results = []
      for (const item of body.batch) {
        const ids = item.orderIds || (item.orderId ? [item.orderId] : [])
        if (!ids.length || !item.deliveryDate || !item.driverName) continue
        const now = item.deliveredAt || new Date().toISOString()
        if (item.failed) {
          const { data, error } = await supabase.from('daily_stops').update({ status: 'failed', failure_reason: item.failureReason || 'Unknown', delivered_at: now }).in('order_id', ids).eq('delivery_date', item.deliveryDate).select()
          if (!error) {
            results.push({ ids, status: 'failed', count: data?.length || 0 })
            if (data?.length > 0) sendFailedAlert(data).catch(() => {})
          }
        } else {
          const updatePayload = { status: 'delivered', delivered_at: now }
          if (item.gpsLat != null) updatePayload.gps_lat = item.gpsLat
          if (item.gpsLng != null) updatePayload.gps_lng = item.gpsLng
          const { data, error } = await supabase.from('daily_stops').update(updatePayload).in('order_id', ids).eq('delivery_date', item.deliveryDate).select()
          if (!error) results.push({ ids, status: 'delivered', count: data?.length || 0 })
        }
      }
      return res.status(200).json({ success: true, batch: true, results })
    }

    const { orderId, orderIds: rawOrderIds, deliveryDate, driverName, photoUrls, photoUrl, barcode, undo, signatureUrl, failed, failureReason, deliveryNote } = body

    // Support both single orderId and orderIds array
    const orderIds = rawOrderIds || (orderId ? [orderId] : [])

    if (orderIds.length === 0 || !deliveryDate || !driverName) {
      return res.status(400).json({ error: 'orderId/orderIds, deliveryDate, and driverName are required' })
    }

    // Undo delivery
    if (undo) {
      const { data, error } = await supabase
        .from('daily_stops')
        .update({
          status: 'dispatched',
          delivered_at: null,
          failure_reason: null,
        })
        .in('order_id', orderIds)
        .eq('delivery_date', deliveryDate)
        .select()

      if (error) throw new Error(error.message)
      return res.status(200).json({ success: true, undone: data?.length || 0 })
    }

    // Save delivery note (can be standalone update after delivery)
    if (deliveryNote !== undefined && !failed && !undo) {
      const { data: noteData, error: noteErr } = await supabase
        .from('daily_stops')
        .update({ delivery_note: deliveryNote })
        .in('order_id', orderIds)
        .eq('delivery_date', deliveryDate)
        .select()
      if (noteErr) throw new Error(noteErr.message)
      // If this is just a note update (no status change), return early
      if (!photoUrls && !photoUrl && !barcode && !signatureUrl) {
        return res.status(200).json({ success: true, noted: noteData?.length || 0 })
      }
    }

    const now = new Date().toISOString()

    // Failed delivery
    if (failed) {
      const failPayload = {
        status: 'failed',
        failure_reason: failureReason || 'Unknown',
        delivered_at: now,
      }
      const { data: failData, error: failError } = await supabase
        .from('daily_stops')
        .update(failPayload)
        .in('order_id', orderIds)
        .eq('delivery_date', deliveryDate)
        .select()
      if (failError) throw new Error(failError.message)
      // Fire failed delivery alert (non-blocking)
      if (failData?.length > 0) sendFailedAlert(failData).catch(() => {})
      return res.status(200).json({ success: true, failed: failData?.length || 0, delivered_at: now })
    }

    const urls = photoUrls || (photoUrl ? [photoUrl] : [])

    const updatePayload = {
      status: 'delivered',
      delivered_at: now,
    }
    // Only set photo/signature fields if provided — never overwrite existing POD data
    if (urls.length > 0) { updatePayload.photo_url = urls[0]; updatePayload.photo_urls = urls }
    if (barcode) updatePayload.barcode = barcode
    if (signatureUrl) updatePayload.signature_url = signatureUrl

    const { data, error } = await supabase
      .from('daily_stops')
      .update(updatePayload)
      .in('order_id', orderIds)
      .eq('delivery_date', deliveryDate)
      .select()

    if (error) throw new Error(error.message)

    return res.status(200).json({
      success: true,
      delivered: data?.length || 0,
      delivered_at: now,
    })
  } catch (err) {
    console.error('Deliver error:', err)
    return res.status(500).json({ error: err.message })
  }
}
