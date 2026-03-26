import { writeFileSync } from 'fs'
import nodemailer from 'nodemailer'
import { parseBody } from './_lib/sheets.js'
import { supabase } from './_lib/supabase.js'

// POST /api/actions
// Body: { action: 'approve' } — approve routes
// Body: { action: 'email', to, subject, html } — send email

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const data = await parseBody(req)

  try {
    if (data.action === 'approve') {
      const timestamp = new Date().toISOString()
      const content = `approved_at=${timestamp}\nsource=cnc-web\n`
      try { writeFileSync('/tmp/cnc_approval.txt', content) } catch {}
      return res.status(200).json({ success: true, approved_at: timestamp })
    }

    if (data.action === 'email') {
      const { to, subject, html } = data
      if (!to || !subject) return res.status(400).json({ error: 'Missing to or subject' })

      const gmailUser = process.env.GMAIL_USER || 'dom@cncdeliveryservice.com'
      const gmailPass = process.env.GMAIL_APP_PASSWORD
      if (!gmailPass) return res.status(500).json({ error: 'GMAIL_APP_PASSWORD not configured' })

      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: gmailUser, pass: gmailPass },
      })

      const info = await transporter.sendMail({
        from: `"CNC Delivery" <${gmailUser}>`,
        to, subject, html,
      })

      return res.status(200).json({ success: true, messageId: info.messageId, to, subject })
    }

    if (data.action === 'transfer') {
      const { orderIds, toDriverName, toDriverNumber, fromDriverName } = data
      if (!orderIds?.length || !toDriverName || !toDriverNumber) {
        return res.status(400).json({ error: 'Missing transfer data' })
      }

      // Move stops in Supabase using service role key
      for (const orderId of orderIds) {
        await supabase.from('daily_stops').update({
          driver_name: toDriverName,
          driver_number: toDriverNumber,
          assigned_driver_number: toDriverNumber,
        }).eq('order_id', orderId)
      }

      // Send email to BioTouch
      const gmailUser = process.env.GMAIL_USER || 'dom@cncdeliveryservice.com'
      const gmailPass = process.env.GMAIL_APP_PASSWORD
      if (gmailPass) {
        try {
          const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: gmailUser, pass: gmailPass },
          })
          await transporter.sendMail({
            from: `"CNC Delivery" <${gmailUser}>`,
            to: 'wfldispatch@biotouchglobal.com',
            subject: `Assign to driver ${toDriverNumber}`,
            html: `<p>Order #: ${orderIds.join(', ')}</p>`,
          })
        } catch (emailErr) {
          console.error('[transfer email]', emailErr.message)
        }
      }

      return res.status(200).json({ success: true, moved: orderIds.length })
    }

    if (data.action === 'roadwarrior') {
      const rwKey = process.env.RW_API_KEY
      const rwAccount = process.env.RW_ACCOUNT_ID
      if (!rwKey || !rwAccount) return res.status(500).json({ error: 'RW credentials not configured' })

      // Map driver names to their Road Warrior email/username
      const RW_EMAILS = {
        'Dom': 'ccdelivery.dominic',
        'Alex': 'ccdelivery.Alex',
        'Josh': 'ccdelivery.josh',
        'Laura': 'ccdelivery.laura',
        'Mark': 'ccdelivery.mark',
        'Mike': 'ccdelivery.mike',
        'Nick': 'ccdelivery.nick',
      }

      const results = []
      for (const driver of (data.drivers || [])) {
        try {
          const rwEmail = RW_EMAILS[driver.name] || ''
          const rwRes = await fetch(`https://teamapi.roadwarrior.app/api/Route/Add?token=${rwKey}&accountid=${rwAccount}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              Name: driver.routeName || `${driver.name} Route`,
              Driver: rwEmail,
              HardStart: false,
              HardStop: false,
              TravelMode: 0,
              Stops: await (async () => {
                // Geocode unique ZIPs first (fast, 1 lookup per ZIP not per stop)
                const zipCoords = {}
                const uniqueZips = [...new Set((driver.stops || []).map(s => s.zip).filter(Boolean))]
                for (const zip of uniqueZips) {
                  try {
                    const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&postalcode=${zip}&country=US`, {
                      headers: { 'User-Agent': 'CNCDelivery/1.0' },
                    })
                    const geoData = await geoRes.json()
                    if (geoData?.[0]) zipCoords[zip] = { lat: parseFloat(geoData[0].lat), lng: parseFloat(geoData[0].lon) }
                    await new Promise(r => setTimeout(r, 1100))
                  } catch {}
                }
                // Each stop gets its ZIP centroid + small random offset so pins spread out
                return (driver.stops || []).map((s, i) => {
                  const addr = `${s.address || ''}, ${s.city || ''}, OH ${s.zip || ''}`
                  const base = zipCoords[s.zip] || { lat: 40.80, lng: -81.38 }
                  const lat = base.lat + ((i % 10) * 0.002 - 0.01) + (Math.random() * 0.004 - 0.002)
                  const lng = base.lng + ((i % 10) * 0.002 - 0.01) + (Math.random() * 0.004 - 0.002)
                  return { Name: addr, Address: addr, Lat: lat, Lng: lng, ServiceTime: 2,
                    Note: s.cold_chain ? `Cold Chain | Order #${s.order_id}` : `Order #${s.order_id}` }
                })
              })(),
            }),
          })
          const rwData = await rwRes.json()
          results.push({ driver: driver.name, success: rwData.IsSuccess, stopsAdded: rwData.StopsAdded, error: rwData.ErrorMessage })
        } catch (err) {
          results.push({ driver: driver.name, success: false, error: err.message })
        }
      }
      return res.status(200).json({ success: true, results })
    }

    return res.status(400).json({ error: 'Unknown action' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
