import nodemailer from 'nodemailer'

// POST /api/send-email
// Body: { to, subject, html, type }
// type: 'payroll' | 'notification'
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  let body = ''
  await new Promise((resolve) => {
    req.on('data', (chunk) => { body += chunk })
    req.on('end', resolve)
  })

  const { to, subject, html, type } = JSON.parse(body)

  if (!to || !subject) {
    return res.status(400).json({ error: 'Missing to or subject' })
  }

  const gmailUser = process.env.GMAIL_USER || 'dom@cncdeliveryservice.com'
  const gmailPass = process.env.GMAIL_APP_PASSWORD

  if (!gmailPass) {
    return res.status(500).json({ error: 'GMAIL_APP_PASSWORD not configured' })
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailPass,
      },
    })

    const info = await transporter.sendMail({
      from: `"CNC Delivery" <${gmailUser}>`,
      to,
      subject,
      html,
    })

    return res.status(200).json({
      success: true,
      messageId: info.messageId,
      to,
      subject,
    })
  } catch (err) {
    console.error('[send-email]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
