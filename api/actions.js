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
      }

      return res.status(200).json({ success: true, moved: orderIds.length })
    }

    return res.status(400).json({ error: 'Unknown action' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
