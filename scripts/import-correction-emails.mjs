// Scan Dom's Gmail Sent folder for correction emails to BioTouch,
// extract driver number + order IDs + date, cross-reference
// driver_name from Supabase, and insert into dispatch_history_import.
//
// Run:  node scripts/import-correction-emails.mjs
// Needs GMAIL_USER + GMAIL_APP_PASSWORD + SUPABASE_URL +
//        SUPABASE_SERVICE_ROLE_KEY in .env

import 'dotenv/config'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { createClient } from '@supabase/supabase-js'

const GMAIL_USER = process.env.GMAIL_USER || 'dom@cncdeliveryservice.com'
const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD
if (!GMAIL_PASS) { console.error('GMAIL_APP_PASSWORD not set'); process.exit(1) }

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY not set'); process.exit(1)
}

// ── 1. Load driver number → name map from Supabase ──────────────
const { data: drivers } = await supabase
  .from('drivers')
  .select('driver_name, driver_number')
const driverMap = {}
for (const d of (drivers || [])) {
  if (d.driver_number) driverMap[String(d.driver_number)] = d.driver_name
}
console.log(`Loaded ${Object.keys(driverMap).length} drivers`)

// ── 2. Connect to Gmail IMAP (Sent folder) ──────────────────────
const client = new ImapFlow({
  host: 'imap.gmail.com',
  port: 993,
  secure: true,
  auth: { user: GMAIL_USER, pass: GMAIL_PASS },
  logger: false,
})

await client.connect()
console.log('Connected to Gmail IMAP')

// Gmail's Sent folder
const sentFolder = '[Gmail]/Sent Mail'
const lock = await client.getMailboxLock(sentFolder)

try {
  // Search for emails matching: subject contains "Assign to Driver",
  // sent to wfldispatch@biotouchglobal.com
  const uids = await client.search({
    subject: 'Assign to Driver',
    to: 'wfldispatch@biotouchglobal.com',
  })

  console.log(`Found ${uids.length} matching emails`)
  if (uids.length === 0) { console.log('Nothing to import.'); process.exit(0) }

  // Check which order_ids are already imported so we don't duplicate
  const { data: existing } = await supabase
    .from('dispatch_history_import')
    .select('order_id')
    .eq('source', 'correction_email')
  const existingIds = new Set((existing || []).map(r => r.order_id))
  console.log(`${existingIds.size} order_ids already in dispatch_history_import`)

  let totalInserted = 0
  let totalSkipped = 0
  let totalErrors = 0

  // Process in batches of 50 UIDs to avoid memory issues
  const BATCH = 50
  for (let i = 0; i < uids.length; i += BATCH) {
    const batch = uids.slice(i, i + BATCH)
    const range = batch.join(',')

    for await (const msg of client.fetch(range, { source: true })) {
      try {
        const parsed = await simpleParser(msg.source)

        // Extract driver number from subject: "Assign to Driver 55500"
        // or "Assign 3 Orders to Driver 55500"
        const subjectMatch = (parsed.subject || '').match(/Driver\s+(\d+)/i)
        if (!subjectMatch) {
          totalSkipped++
          continue
        }
        const driverNumber = subjectMatch[1]
        const driverName = driverMap[driverNumber] || null

        // Date from email
        const emailDate = parsed.date || new Date()
        const deliveryDate = emailDate.toISOString().split('T')[0]
        const dayOfWeek = emailDate.toLocaleDateString('en-US', { weekday: 'long' })

        // Extract order IDs from body. The body format is either:
        //   - Plain text: one order ID per line
        //   - HTML: order IDs inside <pre> tags, one per line
        let bodyText = ''
        if (parsed.text) {
          bodyText = parsed.text
        } else if (parsed.html) {
          // Extract content from <pre> tags
          const preMatch = parsed.html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i)
          if (preMatch) {
            bodyText = preMatch[1].replace(/<[^>]+>/g, '')
          } else {
            // Strip all HTML tags
            bodyText = parsed.html.replace(/<[^>]+>/g, '\n')
          }
        }

        // Split into lines, trim, filter empty
        const orderIds = bodyText
          .split(/[\n\r]+/)
          .map(line => line.trim())
          .filter(line => line.length > 0 && /^[A-Za-z0-9]/.test(line))

        if (orderIds.length === 0) {
          totalSkipped++
          continue
        }

        // Filter out already-imported order IDs
        const newOrderIds = orderIds.filter(oid => !existingIds.has(oid))
        if (newOrderIds.length === 0) {
          totalSkipped += orderIds.length
          continue
        }

        // Build rows for insert
        const rows = newOrderIds.map(orderId => ({
          delivery_date: deliveryDate,
          day_of_week: dayOfWeek,
          driver_name: driverName,
          order_id: orderId,
          source: 'correction_email',
          raw_data: {
            driver_number: driverNumber,
            subject: parsed.subject,
            email_date: emailDate.toISOString(),
          },
        }))

        // Insert batch
        const { error } = await supabase
          .from('dispatch_history_import')
          .insert(rows)

        if (error) {
          console.error(`  ✗ Insert error for driver ${driverNumber}: ${error.message}`)
          totalErrors += rows.length
        } else {
          totalInserted += rows.length
          // Track so we don't re-insert within this run
          for (const oid of newOrderIds) existingIds.add(oid)
        }

        if ((totalInserted + totalSkipped) % 200 === 0) {
          console.log(`  ... processed ${totalInserted + totalSkipped + totalErrors} order IDs so far`)
        }
      } catch (parseErr) {
        console.error(`  ✗ Parse error: ${parseErr.message}`)
        totalErrors++
      }
    }
  }

  console.log(`\nDone.`)
  console.log(`  Inserted: ${totalInserted}`)
  console.log(`  Skipped (already imported): ${totalSkipped}`)
  console.log(`  Errors: ${totalErrors}`)

} finally {
  lock.release()
  await client.logout()
  console.log('Disconnected from Gmail')
}
