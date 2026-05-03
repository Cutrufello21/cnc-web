// GET /api/tesla/status?driver_name=Dom — check if Tesla is connected
import { supabase } from '../_lib/supabase.js'

export default async function handler(req, res) {
  const { driver_name } = req.query
  if (!driver_name) return res.status(400).json({ error: 'Missing driver_name' })

  const { data } = await supabase.from('tesla_tokens')
    .select('driver_name, vehicle_name, vin, expires_at')
    .eq('driver_name', driver_name).single()

  if (!data) return res.status(200).json({ connected: false })

  return res.status(200).json({
    connected: true,
    vehicle: data.vehicle_name || 'Tesla',
    vin: data.vin,
    tokenExpires: data.expires_at,
  })
}
