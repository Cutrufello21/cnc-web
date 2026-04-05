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

      // Only send BioTouch email from driver portal (dispatch uses Send Corrections)
      if (data.source === 'driver') {
        const gmailUser = process.env.GMAIL_USER || 'dom@cncdeliveryservice.com'
        const gmailPass = process.env.GMAIL_APP_PASSWORD
        if (gmailPass) {
          try {
            const transporter = nodemailer.createTransport({
              service: 'gmail',
              auth: { user: gmailUser, pass: gmailPass },
            })
            for (const orderId of orderIds) {
              await transporter.sendMail({
                from: `"CNC Delivery" <${gmailUser}>`,
                to: 'wfldispatch@biotouchglobal.com',
                subject: `Assign Order to driver ${toDriverNumber}`,
                text: orderId,
              })
            }
          } catch (emailErr) {
            console.error('[transfer email]', emailErr.message)
          }
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
                const results = []
                for (const s of (driver.stops || [])) {
                  const addr = `${s.address || ''}, ${s.city || ''}, OH ${s.zip || ''}`
                  let lat = 40.80, lng = -81.38
                  try {
                    const geoRes = await fetch(`https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(addr)}&benchmark=Public_AR_Current&format=json`)
                    const geoData = await geoRes.json()
                    const match = geoData.result?.addressMatches?.[0]
                    if (match) { lat = match.coordinates.y; lng = match.coordinates.x }
                  } catch {}
                  results.push({ Name: addr, Address: addr, Lat: lat, Lng: lng, ServiceTime: 2,
                    Note: s.cold_chain ? `Cold Chain | Order #${s.order_id}` : `Order #${s.order_id}` })
                }
                return results
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

    if (data.action === 'email_route' || data.action === 'email_all_routes') {
      const gmailUser = process.env.GMAIL_USER || 'dom@cncdeliveryservice.com'
      const gmailPass = process.env.GMAIL_APP_PASSWORD
      if (!gmailPass) return res.status(500).json({ error: 'GMAIL_APP_PASSWORD not configured' })

      const dateStr = data.date
      if (!dateStr) return res.status(400).json({ error: 'Missing date' })

      const { data: allStops } = await supabase.from('daily_stops').select('*').eq('delivery_date', dateStr)
      if (!allStops?.length) return res.status(400).json({ error: 'No stops found for this date' })

      // Get driver emails
      const { data: drivers } = await supabase.from('drivers').select('driver_name, email').eq('active', true)
      const emailMap = {}
      ;(drivers || []).forEach(d => { if (d.email) emailMap[d.driver_name] = d.email })

      // Group stops by driver
      const byDriver = {}
      allStops.forEach(s => {
        const n = s.driver_name || 'Unassigned'
        if (!byDriver[n]) byDriver[n] = []
        byDriver[n].push(s)
      })

      // Determine which drivers to email
      const targets = data.action === 'email_route'
        ? [data.driver_name]
        : Object.keys(byDriver).filter(n => n !== 'Unassigned')

      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: gmailUser, pass: gmailPass },
      })

      let sent = 0
      for (const driverName of targets) {
        const email = emailMap[driverName]
        if (!email) continue
        const dStops = (byDriver[driverName] || []).sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
        if (!dStops.length) continue

        const rows = dStops.map((s, i) => `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee">${s.sort_order ?? i + 1}</td><td style="padding:4px 8px;border-bottom:1px solid #eee">${s.patient_name || ''}</td><td style="padding:4px 8px;border-bottom:1px solid #eee">${s.address || ''}, ${s.city || ''}</td><td style="padding:4px 8px;border-bottom:1px solid #eee">${s.pharmacy || ''}</td></tr>`).join('')

        const html = `<h2>Your Route — ${dateStr}</h2><p>${dStops.length} stops</p><table style="border-collapse:collapse;width:100%;font-size:14px"><thead><tr style="background:#0A2463;color:#fff"><th style="padding:6px 8px;text-align:left">#</th><th style="padding:6px 8px;text-align:left">Patient</th><th style="padding:6px 8px;text-align:left">Address</th><th style="padding:6px 8px;text-align:left">Rx</th></tr></thead><tbody>${rows}</tbody></table><p style="margin-top:16px;color:#888;font-size:12px">Sent from CNC Dispatch</p>`

        await transporter.sendMail({
          from: `"CNC Delivery" <${gmailUser}>`,
          to: email,
          subject: `Your Route for ${dateStr} — ${dStops.length} stops`,
          html,
        })
        sent++
      }

      return res.status(200).json({ success: true, sent })
    }

    if (data.action === 'push_notify') {
      // Send push notification to specific drivers
      const { driverNames, title, body } = data
      if (!driverNames?.length || !title) return res.status(400).json({ error: 'Missing driverNames or title' })

      const { data: drivers } = await supabase.from('drivers').select('driver_name, push_token').in('driver_name', driverNames)
      const tokens = (drivers || []).filter(d => d.push_token).map(d => d.push_token)

      if (!tokens.length) return res.status(200).json({ success: true, sent: 0, reason: 'No push tokens found' })

      const messages = tokens.map(token => ({
        to: token,
        sound: 'default',
        title: title,
        body: body || '',
        data: { type: 'route_update' },
      }))

      // Expo Push API — batch send
      const pushRes = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(messages),
      })
      const pushData = await pushRes.json()

      return res.status(200).json({ success: true, sent: tokens.length, pushData })
    }

    if (data.action === 'push_routes') {
      // Send push to all active drivers with stops for a given date
      const dateStr = data.date
      if (!dateStr) return res.status(400).json({ error: 'Missing date' })

      const { data: stops } = await supabase.from('daily_stops').select('driver_name').eq('delivery_date', dateStr)
      const driverNames = [...new Set((stops || []).map(s => s.driver_name).filter(Boolean))]

      const { data: drivers } = await supabase.from('drivers').select('driver_name, push_token').in('driver_name', driverNames)
      const messages = (drivers || []).filter(d => d.push_token).map(d => {
        const stopCount = (stops || []).filter(s => s.driver_name === d.driver_name).length
        return {
          to: d.push_token,
          sound: 'default',
          title: 'Route Ready',
          body: `You have ${stopCount} stops assigned. Open the app to view your route.`,
          data: { type: 'route_ready', date: dateStr },
        }
      })

      if (!messages.length) return res.status(200).json({ success: true, sent: 0 })

      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(messages),
      })

      // Save notifications to DB so drivers can view history
      const notifRows = driverNames.map(name => {
        const stopCount = (stops || []).filter(s => s.driver_name === name).length
        return { driver_name: name, title: 'Route Ready', body: `You have ${stopCount} stops assigned.`, type: 'route_ready' }
      })
      await supabase.from('driver_notifications').insert(notifRows).then(() => {})

      return res.status(200).json({ success: true, sent: messages.length })
    }

    if (data.action === 'contact_form') {
      const { name, organization, email, phone, message } = data
      if (!name || !message || !email) return res.status(400).json({ error: 'Name, email, and message are required' })

      const gmailUser = process.env.GMAIL_USER || 'dom@cncdeliveryservice.com'
      const gmailPass = process.env.GMAIL_APP_PASSWORD
      if (!gmailPass) return res.status(500).json({ error: 'GMAIL_APP_PASSWORD not configured' })

      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: gmailUser, pass: gmailPass },
      })

      // Email to Dom
      await transporter.sendMail({
        from: `"CNC Delivery Website" <${gmailUser}>`,
        to: 'dom@cncdeliveryservice.com',
        replyTo: email,
        subject: `New Consultation Request from ${name}`,
        html: `
          <h2>New Consultation Request</h2>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Organization:</strong> ${organization || 'N/A'}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Phone:</strong> ${phone || 'N/A'}</p>
          <p><strong>Message:</strong></p>
          <p>${message}</p>
        `,
      })

      // Auto-reply to the person who submitted
      await transporter.sendMail({
        from: `"CNC Delivery" <${gmailUser}>`,
        to: email,
        subject: `We received your message — CNC Delivery`,
        html: `
          <p>Hi ${name},</p>
          <p>Thank you for reaching out to CNC Delivery. We received your consultation request and a member of our team will be in touch shortly — usually within the same business day.</p>
          <p>In the meantime, feel free to call us at <a href="tel:+13306346260">(330) 634-6260</a> if you need immediate assistance.</p>
          <br>
          <p>Best regards,</p>
          <p><strong>CNC Delivery</strong><br>The Last Mile in Patient Care<br>(330) 634-6260</p>
        `,
      })

      return res.status(200).json({ success: true })
    }

    return res.status(400).json({ error: 'Unknown action' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
