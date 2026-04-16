import { createClient } from '@supabase/supabase-js'
import { requireAuth } from './_lib/auth.js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

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
          if (!error) results.push({ ids, status: 'failed', count: data?.length || 0 })
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
      return res.status(200).json({ success: true, failed: failData?.length || 0, delivered_at: now })
    }

    const urls = photoUrls || (photoUrl ? [photoUrl] : [])

    const updatePayload = {
      status: 'delivered',
      photo_url: urls[0] || null,
      photo_urls: urls.length > 0 ? urls : null,
      delivered_at: now,
    }
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
