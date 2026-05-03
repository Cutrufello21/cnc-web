import { supabase } from './_lib/supabase.js'

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxw2xx2atYfnEfGzCaTmkDShmt96D1JsLFSckScOndB94RV2IGev63fpS7Ndc0GqSHWWQ/exec'

// Dom always gets the summary
const ADMIN_EMAIL = 'dominiccutrufello@gmail.com'

function formatTime(dt) {
  if (!dt) return '-'
  try {
    return new Date(dt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
  } catch { return '-' }
}

function buildEmailHtml(pharmacy, date, stops) {
  const delivered = stops.filter(s => s.status === 'delivered')
  const failed = stops.filter(s => s.status === 'failed' || s.status === 'attempted')
  const pending = stops.filter(s => s.status !== 'delivered' && s.status !== 'failed' && s.status !== 'attempted')
  const coldChain = stops.filter(s => s.cold_chain)
  const coldDelivered = coldChain.filter(s => s.status === 'delivered')

  const total = stops.length
  const deliveredPct = total > 0 ? Math.round((delivered.length / total) * 100) : 0

  // Group by driver
  const byDriver = {}
  delivered.forEach(s => {
    const d = s.driver_name || 'Unassigned'
    byDriver[d] = (byDriver[d] || 0) + 1
  })

  const driverRows = Object.entries(byDriver)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;">${name}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right;">${count}</td></tr>`)
    .join('')

  const failedRows = failed.length > 0 ? failed.map(s =>
    `<tr>
      <td style="padding:6px 12px;border-bottom:1px solid #eee;">${s.patient_name || '-'}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #eee;">${s.address || '-'}${s.city ? `, ${s.city}` : ''}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #eee;">${s.driver_name || '-'}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #eee;">${s.delivery_note || s.failure_reason || '-'}</td>
    </tr>`
  ).join('') : ''

  const pendingRows = pending.length > 0 ? pending.map(s =>
    `<tr>
      <td style="padding:6px 12px;border-bottom:1px solid #eee;">${s.patient_name || '-'}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #eee;">${s.address || '-'}${s.city ? `, ${s.city}` : ''}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #eee;">${s.driver_name || '-'}</td>
    </tr>`
  ).join('') : ''

  const displayDate = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  })

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">

    <!-- Header -->
    <div style="background:#0A2463;border-radius:10px 10px 0 0;padding:24px 28px;">
      <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">CNC Delivery</h1>
      <p style="margin:4px 0 0;color:rgba(255,255,255,0.6);font-size:12px;">End-of-Day Summary</p>
    </div>

    <!-- Body -->
    <div style="background:#fff;border-radius:0 0 10px 10px;padding:28px;">

      <p style="margin:0 0 4px;font-size:13px;color:#6B7280;">${pharmacy}</p>
      <h2 style="margin:0 0 20px;font-size:16px;color:#1a1a1a;">${displayDate}</h2>

      <!-- Stats -->
      <div style="display:flex;gap:12px;margin-bottom:24px;">
        <div style="flex:1;background:#f0fdf4;border-radius:8px;padding:14px 16px;text-align:center;">
          <div style="font-size:28px;font-weight:700;color:#16a34a;">${delivered.length}</div>
          <div style="font-size:11px;color:#6B7280;margin-top:2px;">Delivered</div>
        </div>
        <div style="flex:1;background:${failed.length > 0 ? '#fef2f2' : '#f9fafb'};border-radius:8px;padding:14px 16px;text-align:center;">
          <div style="font-size:28px;font-weight:700;color:${failed.length > 0 ? '#dc2626' : '#6B7280'};">${failed.length}</div>
          <div style="font-size:11px;color:#6B7280;margin-top:2px;">Failed</div>
        </div>
        <div style="flex:1;background:${pending.length > 0 ? '#fffbeb' : '#f9fafb'};border-radius:8px;padding:14px 16px;text-align:center;">
          <div style="font-size:28px;font-weight:700;color:${pending.length > 0 ? '#d97706' : '#6B7280'};">${pending.length}</div>
          <div style="font-size:11px;color:#6B7280;margin-top:2px;">Pending</div>
        </div>
        <div style="flex:1;background:#f9fafb;border-radius:8px;padding:14px 16px;text-align:center;">
          <div style="font-size:28px;font-weight:700;color:#0A2463;">${deliveredPct}%</div>
          <div style="font-size:11px;color:#6B7280;margin-top:2px;">Success Rate</div>
        </div>
      </div>

      <!-- Cold Chain -->
      ${coldChain.length > 0 ? `
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
        <div style="font-size:12px;font-weight:600;color:#1e40af;">Cold Chain: ${coldDelivered.length}/${coldChain.length} delivered</div>
      </div>
      ` : ''}

      <!-- Driver Breakdown -->
      ${driverRows ? `
      <h3 style="font-size:13px;font-weight:600;color:#1a1a1a;margin:0 0 8px;">Driver Breakdown</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:6px 12px;text-align:left;font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;">Driver</th>
            <th style="padding:6px 12px;text-align:right;font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;">Delivered</th>
          </tr>
        </thead>
        <tbody>${driverRows}</tbody>
      </table>
      ` : ''}

      <!-- Failed Deliveries -->
      ${failed.length > 0 ? `
      <h3 style="font-size:13px;font-weight:600;color:#dc2626;margin:0 0 8px;">Failed Deliveries</h3>
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px;">
        <thead>
          <tr style="background:#fef2f2;">
            <th style="padding:6px 12px;text-align:left;font-size:10px;font-weight:600;color:#6B7280;text-transform:uppercase;">Patient</th>
            <th style="padding:6px 12px;text-align:left;font-size:10px;font-weight:600;color:#6B7280;text-transform:uppercase;">Address</th>
            <th style="padding:6px 12px;text-align:left;font-size:10px;font-weight:600;color:#6B7280;text-transform:uppercase;">Driver</th>
            <th style="padding:6px 12px;text-align:left;font-size:10px;font-weight:600;color:#6B7280;text-transform:uppercase;">Reason</th>
          </tr>
        </thead>
        <tbody>${failedRows}</tbody>
      </table>
      ` : ''}

      <!-- Pending Deliveries -->
      ${pending.length > 0 ? `
      <h3 style="font-size:13px;font-weight:600;color:#d97706;margin:0 0 8px;">Still Pending</h3>
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px;">
        <thead>
          <tr style="background:#fffbeb;">
            <th style="padding:6px 12px;text-align:left;font-size:10px;font-weight:600;color:#6B7280;text-transform:uppercase;">Patient</th>
            <th style="padding:6px 12px;text-align:left;font-size:10px;font-weight:600;color:#6B7280;text-transform:uppercase;">Address</th>
            <th style="padding:6px 12px;text-align:left;font-size:10px;font-weight:600;color:#6B7280;text-transform:uppercase;">Driver</th>
          </tr>
        </thead>
        <tbody>${pendingRows}</tbody>
      </table>
      ` : ''}

      <!-- Footer link -->
      <div style="text-align:center;margin-top:24px;padding-top:16px;border-top:1px solid #eee;">
        <a href="https://cncdelivery.com/portal/dashboard" style="display:inline-block;background:#0A2463;color:#fff;padding:10px 24px;border-radius:6px;font-size:13px;font-weight:600;text-decoration:none;">View Portal</a>
      </div>
    </div>

    <!-- Email footer -->
    <p style="text-align:center;font-size:11px;color:#9CA3AF;margin-top:16px;">
      CNC Delivery Service — The last mile in patient care<br>
      <a href="https://cncdelivery.com" style="color:#9CA3AF;">cncdelivery.com</a>
    </p>
  </div>
</body>
</html>`
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Allow manual trigger with ?date=YYYY-MM-DD, otherwise use today (ET)
  const now = new Date()
  const etDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const todayStr = req.query?.date || etDate.toLocaleDateString('en-CA')

  // Fetch all stops for today
  const { data: allStops, error: stopsErr } = await supabase
    .from('daily_stops')
    .select('*')
    .eq('delivery_date', todayStr)

  if (stopsErr) {
    return res.status(500).json({ error: `DB error: ${stopsErr.message}` })
  }

  if (!allStops || allStops.length === 0) {
    return res.status(200).json({ message: 'No stops for today, no email sent', date: todayStr })
  }

  // Group by pharmacy
  const byPharmacy = {}
  allStops.forEach(s => {
    const p = s.pharmacy || 'Unknown'
    if (!byPharmacy[p]) byPharmacy[p] = []
    byPharmacy[p].push(s)
  })

  // Fetch pharmacy portal users to get email addresses
  const { data: pharmacyUsers } = await supabase
    .from('profiles')
    .select('email, pharmacy_name, role')
    .eq('role', 'pharmacy')

  const pharmacyEmails = {}
  if (pharmacyUsers) {
    pharmacyUsers.forEach(u => {
      if (u.email && u.pharmacy_name) {
        if (!pharmacyEmails[u.pharmacy_name]) pharmacyEmails[u.pharmacy_name] = []
        pharmacyEmails[u.pharmacy_name].push(u.email)
      }
    })
  }

  const results = []

  for (const [pharmacy, stops] of Object.entries(byPharmacy)) {
    const html = buildEmailHtml(pharmacy, todayStr, stops)
    const delivered = stops.filter(s => s.status === 'delivered').length
    const failed = stops.filter(s => s.status === 'failed' || s.status === 'attempted').length
    const subject = `CNC Delivery Summary — ${pharmacy} — ${delivered} delivered${failed > 0 ? `, ${failed} failed` : ''} — ${todayStr}`

    // Send to pharmacy contacts + admin
    const recipients = [...(pharmacyEmails[pharmacy] || []), ADMIN_EMAIL]
    const uniqueRecipients = [...new Set(recipients)]

    for (const email of uniqueRecipients) {
      try {
        await fetch(APPS_SCRIPT_URL, {
          method: 'POST',
          body: JSON.stringify({ action: 'email', to: email, subject, html }),
        })
        results.push({ pharmacy, email, status: 'sent' })
      } catch (e) {
        results.push({ pharmacy, email, status: 'failed', error: e.message })
      }
    }
  }

  return res.status(200).json({
    success: true,
    date: todayStr,
    pharmacies: Object.keys(byPharmacy).length,
    emailsSent: results.filter(r => r.status === 'sent').length,
    results,
  })
}
