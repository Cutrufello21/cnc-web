import { writeFileSync } from 'fs'
import nodemailer from 'nodemailer'
import { parseBody, fetchRange, appendRows, deleteRow, getSheetTabs, DAILY_SHEETS } from './_lib/sheets.js'
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

      // Get delivery day from one of the stops
      const { data: stopRow } = await supabase.from('daily_stops').select('delivery_day, driver_number')
        .eq('order_id', orderIds[0]).limit(1)
      const deliveryDay = stopRow?.[0]?.delivery_day || ''
      const fromDriverNumber = stopRow?.[0]?.driver_number || ''

      // Move stops in Supabase using service role key
      for (const orderId of orderIds) {
        await supabase.from('daily_stops').update({
          driver_name: toDriverName,
          driver_number: toDriverNumber,
          assigned_driver_number: toDriverNumber,
        }).eq('order_id', orderId)
      }

      // Move stops in Google Sheets
      const sheetId = DAILY_SHEETS[deliveryDay]
      if (sheetId) {
        try {
          const fromTab = `${fromDriverName} - ${fromDriverNumber}`
          const toTab = `${toDriverName} - ${toDriverNumber}`
          const tabs = await getSheetTabs(sheetId)
          const fromTabInfo = tabs.find(t => t.title === fromTab)
          const toTabInfo = tabs.find(t => t.title === toTab)

          if (fromTabInfo && toTabInfo) {
            const fromRows = await fetchRange(sheetId, `'${fromTab}'!A1:I200`)
            if (fromRows.length >= 2) {
              const headers = fromRows[0]
              const orderIdIdx = headers.findIndex(h => h.trim() === 'Order ID')
              const assignedIdx = headers.findIndex(h => h.trim() === 'Assigned Driver #')
              const driverNumIdx = headers.findIndex(h => h.trim() === 'Dispatch Driver #')
              const orderIdSet = new Set(orderIds.map(String))
              const rowsToMove = []
              const rowIndicesToDelete = []

              fromRows.forEach((row, i) => {
                if (i === 0) return
                const oid = row[orderIdIdx]?.trim()
                if (oid && orderIdSet.has(oid)) {
                  const newRow = [...row]
                  if (assignedIdx >= 0) newRow[assignedIdx] = toDriverNumber
                  if (driverNumIdx >= 0) newRow[driverNumIdx] = toDriverNumber
                  rowsToMove.push(newRow)
                  rowIndicesToDelete.push(i)
                }
              })

              if (rowsToMove.length > 0) {
                await appendRows(sheetId, `'${toTab}'!A1`, rowsToMove)
                for (const rowIdx of rowIndicesToDelete.reverse()) {
                  await deleteRow(sheetId, fromTabInfo.sheetId, rowIdx)
                }
              }
            }
          }
        } catch (sheetErr) {
          console.error('[transfer sheets]', sheetErr.message)
        }
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

    return res.status(400).json({ error: 'Unknown action' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
