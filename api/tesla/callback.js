// Tesla OAuth callback — exchanges auth code for access token
export default async function handler(req, res) {
  const { code } = req.query

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
      // Show token to user — they'll paste it into the app
      return res.status(200).send(`
        <html>
        <head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tesla Connected</title></head>
        <body style="font-family:-apple-system,sans-serif;max-width:500px;margin:40px auto;padding:20px;text-align:center">
          <h1 style="color:#16a34a">✓ Tesla Connected</h1>
          <p>Copy this token and paste it into the CNC Driver app under More → Tesla Integration → API Token</p>
          <textarea readonly style="width:100%;height:120px;font-size:12px;padding:10px;border:2px solid #e5e7eb;border-radius:8px;margin:16px 0" onclick="this.select()">${data.access_token}</textarea>
          <p style="color:#6b7280;font-size:13px">Token expires in ${Math.round((data.expires_in || 28800) / 3600)} hours. You'll need to re-authorize after that.</p>
          <p style="color:#6b7280;font-size:12px;margin-top:24px">Refresh token (save this — lets you get a new access token without re-logging in):</p>
          <textarea readonly style="width:100%;height:60px;font-size:11px;padding:8px;border:1px solid #e5e7eb;border-radius:6px" onclick="this.select()">${data.refresh_token || 'none'}</textarea>
        </body>
        </html>
      `)
    } else {
      return res.status(400).send(`
        <html><body style="font-family:sans-serif;padding:40px;text-align:center">
          <h1 style="color:#dc2626">Token Exchange Failed</h1>
          <pre style="text-align:left;background:#f5f5f5;padding:16px;border-radius:8px;overflow:auto">${JSON.stringify(data, null, 2)}</pre>
        </body></html>
      `)
    }
  } catch (err) {
    return res.status(500).send(`Error: ${err.message}`)
  }
}
