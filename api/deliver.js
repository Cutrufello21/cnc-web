import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const { orderId, deliveryDate, driverName, photoUrls, photoUrl, barcode, undo } = body

    if (!orderId || !deliveryDate || !driverName) {
      return res.status(400).json({ error: 'orderId, deliveryDate, and driverName are required' })
    }

    // Undo delivery
    if (undo) {
      const { data, error } = await supabase
        .from('daily_stops')
        .update({
          status: 'dispatched',
          delivered_at: null,
        })
        .eq('order_id', orderId)
        .eq('delivery_date', deliveryDate)
        .select()

      if (error) throw new Error(error.message)
      return res.status(200).json({ success: true, undone: data?.length || 0 })
    }

    const now = new Date().toISOString()
    const urls = photoUrls || (photoUrl ? [photoUrl] : [])

    const updatePayload = {
      status: 'delivered',
      photo_url: urls[0] || null,
      photo_urls: urls.length > 0 ? urls : null,
      delivered_at: now,
    }
    if (barcode) updatePayload.barcode = barcode

    const { data, error } = await supabase
      .from('daily_stops')
      .update(updatePayload)
      .eq('order_id', orderId)
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
