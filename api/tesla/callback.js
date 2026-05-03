// Tesla OAuth callback — exchanges auth code for tokens, stores in Supabase
import { supabase } from '../_lib/supabase.js'

export default async function handler(req, res) {
  const { code, state } = req.query // state = driver_name

  if (!code) {
    return res.status(400).send('Missing authorization code')
  }

  try {
    const tokenRes = await fetch('https://auth.tesla.com/oauth2/v3/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: process.env.TESLA_CLIENT_ID,
        client_secret: process.env.TESLA_CLIENT_SECRET,
        code,
        audience: 'https://fleet-api.prd.na.vn.cloud.tesla.com',
        redirect_uri: 'https://cncdelivery.com/api/tesla/callback',
      }),
    })

    const data = await tokenRes.json()

    if (data.access_token) {
      const driverName = state || 'Dom'
      const expiresAt = new Date(Date.now() + (data.expires_in || 28800) * 1000).toISOString()

      // Store tokens in Supabase
      await supabase.from('tesla_tokens').upsert({
        driver_name: driverName,
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: expiresAt,
      }, { onConflict: 'driver_name' })

      // Get vehicle list to store VIN
      try {
        const vRes = await fetch('https://fleet-api.prd.na.vn.cloud.tesla.com/api/1/vehicles', {
          headers: { 'Authorization': `Bearer ${data.access_token}` },
        })
        const vData = await vRes.json()
        const vehicle = vData.response?.[0]
        if (vehicle) {
          await supabase.from('tesla_tokens').update({
            vehicle_id: String(vehicle.id),
            vin: vehicle.vin,
            vehicle_name: vehicle.display_name,
          }).eq('driver_name', driverName)
        }
      } catch {}

      return res.status(200).send(`
        <html>
        <head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tesla Connected</title></head>
        <body style="font-family:-apple-system,sans-serif;max-width:500px;margin:40px auto;padding:20px;text-align:center">
          <h1 style="color:#16a34a">Tesla Connected</h1>
          <p>Your Tesla is linked to CNC Driver. You can close this page and return to the app.</p>
          <p style="color:#6b7280;font-size:13px">Addresses will be sent directly to your car's navigation.</p>
        </body>
        </html>
      `)
    } else {
      return res.status(400).send(`
        <html><body style="font-family:sans-serif;padding:40px;text-align:center">
          <h1 style="color:#dc2626">Connection Failed</h1>
          <pre style="text-align:left;background:#f5f5f5;padding:16px;border-radius:8px;overflow:auto">${JSON.stringify(data, null, 2)}</pre>
        </body></html>
      `)
    }
  } catch (err) {
    return res.status(500).send(`Error: ${err.message}`)
  }
}
