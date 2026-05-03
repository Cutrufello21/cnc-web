import { supabase } from './_lib/supabase.js'
import { requireAuth } from './_lib/auth.js'

// Day name from date string
function getDayName(dateStr) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return days[new Date(dateStr + 'T12:00:00').getDay()]
}

// Auto-detect column mapping from headers
// Trellis CSVs have Origin* (pharmacy) and Dest* (recipient) pairs — must prefer Dest*.
function detectColumns(headers) {
  const lower = headers.map(h => (h || '').trim().toLowerCase())
  const mapping = {}

  const isOrigin = (h) => h.includes('origin') || h.includes('sender') || h.includes('shipper')
  const findBest = (preferredKeys, genericKeys = []) => {
    const preferIdx = lower.findIndex(h => !isOrigin(h) && preferredKeys.some(k => h.includes(k)))
    if (preferIdx >= 0) return preferIdx
    if (!genericKeys.length) return -1
    return lower.findIndex(h => !isOrigin(h) && genericKeys.some(k => h.includes(k)))
  }

  const nameIdx = findBest(['destname', 'recipient', 'patient'], ['name'])
  if (nameIdx >= 0) mapping.patient_name = nameIdx

  const addrIdx = findBest(['destaddress', 'destination address', 'delivery address'], ['address', 'street'])
  if (addrIdx >= 0) mapping.address = addrIdx

  const cityIdx = findBest(['destcity'], ['city'])
  if (cityIdx >= 0) mapping.city = cityIdx

  const zipIdx = findBest(['destzip', 'destpostal'], ['zip', 'postal'])
  if (zipIdx >= 0) mapping.zip = zipIdx

  const orderIdx = findBest(['orderid', 'order id', 'order_id', 'order #'], ['order', 'rx'])
  if (orderIdx >= 0) mapping.order_id = orderIdx

  const coldIdx = findBest(['cold', 'refrigerat', 'temp'])
  if (coldIdx >= 0) mapping.cold_chain = coldIdx

  const phoneIdx = findBest(['destphone', 'recipient phone'], ['phone', 'tel'])
  if (phoneIdx >= 0) mapping.phone = phoneIdx

  const noteIdx = findBest(['destcomments', 'specialinst', 'delivery note'], ['note', 'instruction'])
  if (noteIdx >= 0) mapping.notes = noteIdx

  return mapping
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const user = await requireAuth(req, res, { allowApiSecret: true })
  if (!user) return

  const { rows, headers, mapping, pharmacy, delivery_date } = req.body

  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'No rows provided' })
  }
  if (!pharmacy) {
    return res.status(400).json({ error: 'Pharmacy name required' })
  }
  if (!delivery_date) {
    return res.status(400).json({ error: 'Delivery date required' })
  }

  // If headers provided without mapping, auto-detect
  const colMap = mapping || (headers ? detectColumns(headers) : null)
  if (!colMap || colMap.patient_name === undefined || colMap.address === undefined) {
    return res.status(400).json({
      error: 'Could not detect columns. Need at least patient name and address columns.',
      detectedMapping: colMap,
      headers,
    })
  }

  const delivery_day = getDayName(delivery_date)

  // Build insert rows
  const insertRows = []
  let skipped = 0

  for (const row of rows) {
    const patientName = (row[colMap.patient_name] || '').trim()
    const address = (row[colMap.address] || '').trim()

    // Skip empty rows
    if (!patientName && !address) {
      skipped++
      continue
    }

    const coldVal = colMap.cold_chain !== undefined ? (row[colMap.cold_chain] || '').trim().toLowerCase() : ''
    const noteVal = colMap.notes !== undefined ? (row[colMap.notes] || '').toLowerCase() : ''
    // Trellis CSVs don't have a cold-chain column — markers live in DestComments/SpecialInst.
    const noteHasCold = /(^|[^a-z])(cold chain|refrigerat|frozen|keep cold|cooler)([^a-z]|$)/.test(noteVal)
    const isCold = (coldVal !== '' && coldVal !== 'no' && coldVal !== 'n' && coldVal !== 'false' && coldVal !== '0') || noteHasCold

    // Trellis sometimes puts phone digits in DestZip — only accept 5-digit ZIPs.
    const rawZip = colMap.zip !== undefined ? (row[colMap.zip] || '').trim() : ''
    const cleanZip = /^\d{5}(-\d{4})?$/.test(rawZip) ? rawZip : ''

    insertRows.push({
      delivery_date,
      delivery_day,
      patient_name: patientName,
      address,
      city: colMap.city !== undefined ? (row[colMap.city] || '').trim() : '',
      zip: cleanZip,
      order_id: colMap.order_id !== undefined ? (row[colMap.order_id] || '').trim() : '',
      pharmacy,
      cold_chain: isCold,
      status: 'pending',
      phone: colMap.phone !== undefined ? (row[colMap.phone] || '').trim() : null,
      delivery_note: colMap.notes !== undefined ? (row[colMap.notes] || '').trim() : null,
    })
  }

  if (insertRows.length === 0) {
    return res.status(400).json({ error: 'No valid rows to insert after parsing' })
  }

  // Insert in batches of 500
  let inserted = 0
  for (let i = 0; i < insertRows.length; i += 500) {
    const batch = insertRows.slice(i, i + 500)
    const { error } = await supabase.from('daily_stops').insert(batch)
    if (error) {
      return res.status(500).json({
        error: `Database error on batch ${Math.floor(i / 500) + 1}: ${error.message}`,
        inserted,
      })
    }
    inserted += batch.length
  }

  return res.status(200).json({
    success: true,
    inserted,
    skipped,
    delivery_date,
    pharmacy,
  })
}
