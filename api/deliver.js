import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  try {
    const { orderId, deliveryDate, driverName, photoUrl } = req.body || JSON.parse(req.body || '{}')

    if (!orderId || !deliveryDate || !driverName) {
      return res.status(400).json({ error: 'orderId, deliveryDate, and driverName are required' })
    }

    const now = new Date().toISOString()

    const { data, error } = await supabase
      .from('daily_stops')
      .update({
        status: 'delivered',
        photo_url: photoUrl || null,
        delivered_at: now,
      })
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
