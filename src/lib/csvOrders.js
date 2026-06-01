// Shared client-side CSV parsing + Trellis column auto-detection.
// Used by PortalOrders (pharmacy portal) and UploadOrdersModal (dispatch portal).
// Mirrors the server-side detection in api/upload-orders.js.

// Parse CSV text into an array of rows (each row an array of cells).
export function parseCSV(text) {
  const lines = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      lines.push(current)
      current = ''
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++
      lines.push(current)
      current = ''
      // End of row marker
      lines.push(null)
    } else {
      current += ch
    }
  }
  if (current) lines.push(current)

  // Split into rows by null markers
  const rows = []
  let row = []
  for (const cell of lines) {
    if (cell === null) {
      if (row.length > 0) rows.push(row)
      row = []
    } else {
      row.push(cell.trim())
    }
  }
  if (row.length > 0) rows.push(row)

  return rows
}

// Auto-detect column mapping from header row.
// Trellis CSVs have Origin* (pharmacy) and Dest* (recipient) pairs — must prefer Dest*.
export function detectColumns(headers) {
  const lower = headers.map(h => (h || '').toLowerCase())
  const mapping = {}

  // Prefer dest/recipient columns; fall back to generic; skip origin/sender columns.
  const findBest = (preferredKeys, genericKeys = []) => {
    const isOrigin = (h) => h.includes('origin') || h.includes('sender') || h.includes('shipper')
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

// Field metadata for manual column-mapping UIs.
export const ALL_FIELDS = [
  { key: 'patient_name', label: 'Patient Name', required: true },
  { key: 'address', label: 'Address', required: true },
  { key: 'city', label: 'City' },
  { key: 'zip', label: 'ZIP' },
  { key: 'order_id', label: 'Order ID / Rx #' },
  { key: 'cold_chain', label: 'Cold Chain' },
  { key: 'phone', label: 'Phone' },
  { key: 'notes', label: 'Notes' },
]
