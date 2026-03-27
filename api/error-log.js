import { supabase } from './_lib/supabase.js'

// POST /api/error-log — log client-side errors to Supabase
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { type, message, stack, metadata } = req.body || {}

    if (!message) {
      return res.status(400).json({ error: 'Missing error message' })
    }

    const { error: insertError } = await supabase.from('error_logs').insert({
      type: type || 'client_error',
      message: message.slice(0, 2000),
      stack: stack ? stack.slice(0, 5000) : null,
      metadata: metadata || {},
      created_at: new Date().toISOString(),
    })

    if (insertError) throw insertError

    // Send email notification for critical errors via Apps Script webhook
    const webhookUrl = process.env.APPS_SCRIPT_WEBHOOK
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: 'dom@cncdeliveryservice.com',
            subject: `CNC Error: ${type || 'client_error'}`,
            body: `Error: ${message}\n\nPage: ${metadata?.url || 'unknown'}\nUser: ${metadata?.user || 'unknown'}\nTime: ${new Date().toISOString()}\n\n${stack || ''}`,
          }),
        })
      } catch (_) { /* best-effort email */ }
    }

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('Error log API error:', err)
    return res.status(500).json({ error: err.message })
  }
}
