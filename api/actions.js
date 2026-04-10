import { writeFileSync } from 'fs'
import nodemailer from 'nodemailer'
import { parseBody } from './_lib/sheets.js'
import { supabase } from './_lib/supabase.js'

// Push notification helper — sends push + saves to DB
async function notifyDriver(driverName, title, body, type = 'general') {
  try {
    const { data: driver } = await supabase.from('drivers').select('push_token').eq('driver_name', driverName).single()
    if (driver?.push_token) {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: driver.push_token, sound: 'default', title, body, data: { type } }),
      })
    }
    await supabase.from('driver_notifications').insert({ driver_name: driverName, title, body, type })
  } catch (e) { console.warn('[notifyDriver]', e.message) }
}

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
      // Route generic outbound email through the Apps Script pipeline
      // that the dispatch portal's Send Routes / Send Corrections flow
      // already uses successfully. Removes the GMAIL_APP_PASSWORD env-
      // var single point of failure and gives a consistent email
      // delivery path across the entire app. Accepts either `html` or
      // `body` so callers written against the old nodemailer contract
      // don't need to change field names.
      const { to, subject } = data
      const html = data.html || data.body || ''
      if (!to || !subject) return res.status(400).json({ error: 'Missing to or subject' })

      try {
        const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxw2xx2atYfnEfGzCaTmkDShmt96D1JsLFSckScOndB94RV2IGev63fpS7Ndc0GqSHWWQ/exec'
        const r = await fetch(APPS_SCRIPT_URL, {
          method: 'POST',
          body: JSON.stringify({ action: 'email', to, subject, html }),
        })
        if (!r.ok) {
          return res.status(502).json({ error: `Apps Script HTTP ${r.status}` })
        }
        return res.status(200).json({ success: true, to, subject, via: 'apps_script' })
      } catch (e) {
        return res.status(500).json({ error: `Email send failed: ${e.message}` })
      }
    }

    if (data.action === 'transfer') {
      const { orderIds, toDriverName, toDriverNumber, fromDriverName, source, deliveryDate } = data
      if (!orderIds?.length || !toDriverName || !toDriverNumber) {
        return res.status(400).json({ error: 'Missing transfer data' })
      }

      // Scope all daily_stops operations to a specific delivery_date
      // so a stray order_id that happens to exist on a historic day
      // can never be silently reassigned along with today's stop.
      // Falls back to today (UTC) if the client doesn't pass it, but
      // the driver app's transferStops() now always sends dd.
      const dateStr = deliveryDate || new Date().toISOString().split('T')[0]

      // Fetch stop details BEFORE the update so the BioTouch email
      // can include patient + address (plaintext fields per the
      // current encryptForWrite passthrough in the driver app).
      let stopDetails = []
      try {
        const { data: fetched } = await supabase
          .from('daily_stops')
          .select('order_id,patient_name,address,city,zip')
          .in('order_id', orderIds)
          .eq('delivery_date', dateStr)
        stopDetails = fetched || []
      } catch (e) {
        console.error('[transfer fetch details]', e.message)
      }

      // Find the receiving driver's max sort_order so the transferred
      // stops land at the END of their route list instead of inheriting
      // a random position from the sender.
      let baseSort = 0
      try {
        const { data: recvStops } = await supabase
          .from('daily_stops')
          .select('sort_order')
          .eq('delivery_date', dateStr)
          .eq('driver_name', toDriverName)
          .order('sort_order', { ascending: false })
          .limit(1)
        baseSort = (recvStops?.[0]?.sort_order ?? -1) + 1
      } catch {}

      // Reassign the stops. Scoped by delivery_date. If any row fails,
      // bubble up as an error so the driver sees the failure instead
      // of an incorrect "Transferred" toast.
      let moveError = null
      for (let i = 0; i < orderIds.length; i++) {
        const { error } = await supabase.from('daily_stops').update({
          driver_name: toDriverName,
          driver_number: toDriverNumber,
          assigned_driver_number: toDriverNumber,
          sort_order: baseSort + i,
        }).eq('order_id', orderIds[i]).eq('delivery_date', dateStr)
        if (error) moveError = error.message
      }
      if (moveError) {
        return res.status(500).json({ error: `Transfer update failed: ${moveError}` })
      }

      // Keep driver_routes.stop_sequence in sync for both drivers so
      // the sender doesn't see a ghost stop and the receiver gets the
      // transferred stops appended to their saved ordering.
      try {
        if (fromDriverName) {
          const { data: fromRoute } = await supabase
            .from('driver_routes')
            .select('stop_sequence')
            .eq('driver_name', fromDriverName)
            .eq('date', dateStr)
            .single()
          if (fromRoute?.stop_sequence?.length) {
            const pruned = fromRoute.stop_sequence.filter(id => !orderIds.includes(String(id)))
            await supabase.from('driver_routes').update({
              stop_sequence: pruned,
              manually_adjusted: true,
              adjusted_at: new Date().toISOString(),
            }).eq('driver_name', fromDriverName).eq('date', dateStr)
          }
        }
        const { data: toRoute } = await supabase
          .from('driver_routes')
          .select('stop_sequence')
          .eq('driver_name', toDriverName)
          .eq('date', dateStr)
          .single()
        if (toRoute?.stop_sequence?.length) {
          const pruned = toRoute.stop_sequence.filter(id => !orderIds.includes(String(id)))
          const appended = [...pruned, ...orderIds.map(String)]
          await supabase.from('driver_routes').update({
            stop_sequence: appended,
            manually_adjusted: true,
            adjusted_at: new Date().toISOString(),
          }).eq('driver_name', toDriverName).eq('date', dateStr)
        }
      } catch (seqErr) {
        console.error('[transfer seq]', seqErr.message)
      }

      // Email BioTouch via the same Apps Script pipeline Send Corrections
      // uses — proven working, removes the GMAIL_APP_PASSWORD env-var
      // single point of failure that was silently swallowing transfer
      // emails. The body includes patient + address so BioTouch can
      // actually read what moved, not just the raw order_id.
      let emailStatus = 'skipped'
      let emailError = null
      if (source === 'driver') {
        try {
          const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxw2xx2atYfnEfGzCaTmkDShmt96D1JsLFSckScOndB94RV2IGev63fpS7Ndc0GqSHWWQ/exec'
          const rowsHtml = orderIds.map(oid => {
            const s = stopDetails.find(x => String(x.order_id) === String(oid)) || {}
            const esc = (v) => String(v || '').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))
            return `<tr><td>${esc(oid)}</td><td>${esc(s.patient_name)}</td><td>${esc(s.address)}</td><td>${esc(s.city)}</td><td>${esc(s.zip)}</td></tr>`
          }).join('')
          const html = `
            <p>The following order${orderIds.length > 1 ? 's have' : ' has'} been transferred from <b>${fromDriverName || 'another driver'}</b> to <b>${toDriverName}</b> (Driver #${toDriverNumber}).</p>
            <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
              <tr style="background:#0A2463;color:white"><th>Order #</th><th>Patient</th><th>Address</th><th>City</th><th>ZIP</th></tr>
              ${rowsHtml}
            </table>
            <p style="color:#64748b;font-size:12px;margin-top:12px">Sent by CNC Driver app · ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}</p>
          `
          const r = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
              action: 'email',
              to: 'wfldispatch@biotouchglobal.com',
              subject: `Assign ${orderIds.length} Order${orderIds.length > 1 ? 's' : ''} to Driver ${toDriverNumber}`,
              html,
            }),
          })
          if (!r.ok) {
            emailError = `Apps Script HTTP ${r.status}`
            emailStatus = 'failed'
          } else {
            emailStatus = 'sent'
          }
        } catch (e) {
          emailError = e.message
          emailStatus = 'failed'
        }
      }

      // Push notify both drivers ONLY between 6 AM and 6 PM ET.
      // Night-time transfers (Dom building routes) should NOT buzz
      // drivers' phones. The only notification they get overnight is
      // route_ready (with stop + cold chain counts) when Send Routes
      // fires. Transfer-in/out are daytime-only.
      const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
      const etHour = etNow.getHours()
      if (etHour >= 6 && etHour < 18) {
        try {
          await notifyDriver(
            toDriverName,
            'Stops Added',
            `${orderIds.length} stop${orderIds.length > 1 ? 's' : ''} transferred to you from ${fromDriverName || 'dispatch'}.`,
            'transfer_in'
          )
          if (fromDriverName && fromDriverName !== toDriverName) {
            await notifyDriver(
              fromDriverName,
              'Stops Transferred',
              `${orderIds.length} stop${orderIds.length > 1 ? 's' : ''} transferred to ${toDriverName}.`,
              'transfer_out'
            )
          }
        } catch (notifyErr) {
          console.error('[transfer notify]', notifyErr.message)
        }
      }

      return res.status(200).json({
        success: true,
        moved: orderIds.length,
        emailStatus,
        emailError,
      })
    }

    if (data.action === 'mark_correction_sent') {
      const { orderIds, driverNumber } = data
      if (!orderIds?.length || !driverNumber) {
        return res.status(400).json({ error: 'Missing orderIds or driverNumber' })
      }
      const { error } = await supabase
        .from('daily_stops')
        .update({ last_correction_driver: String(driverNumber) })
        .in('order_id', orderIds)
      if (error) throw error
      return res.status(200).json({ success: true, marked: orderIds.length })
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

      // Save to notification history
      const notifRows = driverNames.map(name => ({ driver_name: name, title, body: body || '', type: data.type || 'general' }))
      await supabase.from('driver_notifications').insert(notifRows).catch(() => {})

      return res.status(200).json({ success: true, sent: tokens.length, pushData })
    }

    if (data.action === 'push_routes') {
      // Send push to all active drivers with stops for a given date
      const dateStr = data.date
      if (!dateStr) return res.status(400).json({ error: 'Missing date' })

      const { data: stops } = await supabase.from('daily_stops').select('driver_name,cold_chain').eq('delivery_date', dateStr)
      const driverNames = [...new Set((stops || []).map(s => s.driver_name).filter(Boolean))]

      const { data: drivers } = await supabase.from('drivers').select('driver_name, push_token').in('driver_name', driverNames)
      const messages = (drivers || []).filter(d => d.push_token).map(d => {
        const driverStops = (stops || []).filter(s => s.driver_name === d.driver_name)
        const stopCount = driverStops.length
        const coldCount = driverStops.filter(s => s.cold_chain).length
        const coldStr = coldCount > 0 ? ` (${coldCount} cold chain)` : ''
        return {
          to: d.push_token,
          sound: 'default',
          title: 'Route Ready',
          body: `You have ${stopCount} stops${coldStr} assigned. Open the app to view your route.`,
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
        const driverStops = (stops || []).filter(s => s.driver_name === name)
        const stopCount = driverStops.length
        const coldCount = driverStops.filter(s => s.cold_chain).length
        const coldStr = coldCount > 0 ? ` (${coldCount} cold chain)` : ''
        return { driver_name: name, title: 'Route Ready', body: `You have ${stopCount} stops${coldStr} assigned.`, type: 'route_ready' }
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
