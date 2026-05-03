// POST /api/tesla/navigate — sends address to driver's Tesla
// Body: { driver_name, address }
// Handles token refresh automatically
import { supabase } from '../_lib/supabase.js'

async function getValidToken(driverName) {
  const { data: row } = await supabase.from('tesla_tokens')
    .select('*').eq('driver_name', driverName).single()

  if (!row) return null

  // Check if token is still valid (with 5 min buffer)
  const expiresAt = new Date(row.expires_at).getTime()
  if (Date.now() < expiresAt - 300000) {
    return row
  }

  // Token expired — refresh it
  if (!row.refresh_token) return null

  const refreshRes = await fetch('https://auth.tesla.com/oauth2/v3/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: process.env.TESLA_CLIENT_ID,
      client_secret: process.env.TESLA_CLIENT_SECRET,
      refresh_token: row.refresh_token,
    }),
  })

  const data = await refreshRes.json()
  if (!data.access_token) return null

  const newExpiry = new Date(Date.now() + (data.expires_in || 28800) * 1000).toISOString()

  await supabase.from('tesla_tokens').update({
    access_token: data.access_token,
    refresh_token: data.refresh_token || row.refresh_token,
    expires_at: newExpiry,
  }).eq('driver_name', driverName)

  return { ...row, access_token: data.access_token }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const { driver_name, address } = req.body || {}
  if (!driver_name || !address) return res.status(400).json({ error: 'Missing driver_name or address' })

  try {
    const token = await getValidToken(driver_name)
    if (!token) return res.status(401).json({ error: 'Tesla not connected. Go to More → Tesla to set up.' })

    const vid = token.vehicle_id || token.vin
    if (!vid) return res.status(400).json({ error: 'No vehicle found. Re-connect your Tesla.' })

    // Wake the car first
    await fetch(`https://fleet-api.prd.na.vn.cloud.tesla.com/api/1/vehicles/${vid}/wake_up`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token.access_token}` },
    })

    // Brief pause for wake
    await new Promise(r => setTimeout(r, 2000))

    // Send navigation
    const navRes = await fetch(`https://fleet-api.prd.na.vn.cloud.tesla.com/api/1/vehicles/${vid}/command/navigation_request`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'share_ext_content_raw',
        locale: 'en-US',
        value: { 'android.intent.extra.TEXT': address },
      }),
    })

    const navData = await navRes.json()

    if (navData.response?.result) {
      return res.status(200).json({ success: true })
    } else {
      return res.status(400).json({ error: navData.error || 'Failed to send to Tesla' })
    }
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
