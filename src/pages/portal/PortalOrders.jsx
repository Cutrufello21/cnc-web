import { useState, useRef, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import PortalShell from '../../components/portal/PortalShell'

// Parse CSV text into array of arrays
function parseCSV(text) {
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

// Auto-detect column mapping
// Trellis CSVs have Origin* (pharmacy) and Dest* (recipient) pairs — must prefer Dest*.
function detectColumns(headers) {
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

const REQUIRED_FIELDS = ['patient_name', 'address']
const ALL_FIELDS = [
  { key: 'patient_name', label: 'Patient Name', required: true },
  { key: 'address', label: 'Address', required: true },
  { key: 'city', label: 'City' },
  { key: 'zip', label: 'ZIP' },
  { key: 'order_id', label: 'Order ID / Rx #' },
  { key: 'cold_chain', label: 'Cold Chain' },
  { key: 'phone', label: 'Phone' },
  { key: 'notes', label: 'Notes' },
]

export default function PortalOrders() {
  const { profile } = useAuth()
  const fileRef = useRef(null)

  const [step, setStep] = useState('upload') // upload → map → preview → done
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState([])
  const [rows, setRows] = useState([])
  const [mapping, setMapping] = useState({})
  const [deliveryDate, setDeliveryDate] = useState(() => {
    // Default to next weekday
    const d = new Date()
    const day = d.getDay()
    if (day === 0) d.setDate(d.getDate() + 1)
    else if (day === 6) d.setDate(d.getDate() + 2)
    return d.toLocaleDateString('en-CA')
  })
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [selectedPharmacy, setSelectedPharmacy] = useState('SHSP')

  const pharmacyName = profile?.pharmacy_name || profile?.pharmacy || 'SHSP'
  const isAdmin = pharmacyName === 'all' || profile?.role === 'dispatcher'

  // Only dispatchers can upload orders
  if (!isAdmin) {
    return (
      <PortalShell title="Upload Orders">
        <div className="portal-empty">You do not have permission to upload orders.</div>
      </PortalShell>
    )
  }

  const handleFile = useCallback((file) => {
    if (!file) return
    setError('')
    setFileName(file.name)

    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target.result
      const parsed = parseCSV(text)

      if (parsed.length < 2) {
        setError('File must have a header row and at least one data row.')
        return
      }

      const hdrs = parsed[0]
      const dataRows = parsed.slice(1).filter(r => r.some(c => c))

      if (dataRows.length === 0) {
        setError('No data rows found in file.')
        return
      }

      setHeaders(hdrs)
      setRows(dataRows)

      // Auto-detect mapping
      const detected = detectColumns(hdrs)
      setMapping(detected)

      // If we have required fields mapped, go to preview; otherwise go to mapping
      if (detected.patient_name !== undefined && detected.address !== undefined) {
        setStep('preview')
      } else {
        setStep('map')
      }
    }
    reader.readAsText(file)
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file && (file.name.endsWith('.csv') || file.type === 'text/csv')) {
      handleFile(file)
    } else {
      setError('Please upload a .csv file')
    }
  }, [handleFile])

  const handleSubmit = async () => {
    setUploading(true)
    setError('')

    try {
      const token = localStorage.getItem('cnc-token')
      const res = await fetch('/api/upload-orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          rows,
          headers,
          mapping,
          pharmacy: isAdmin ? selectedPharmacy : pharmacyName,
          delivery_date: deliveryDate,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Upload failed')
      } else {
        setResult(data)
        setStep('done')
      }
    } catch (err) {
      setError('Network error — please try again')
    } finally {
      setUploading(false)
    }
  }

  const handleReset = () => {
    setStep('upload')
    setFileName('')
    setHeaders([])
    setRows([])
    setMapping({})
    setResult(null)
    setError('')
  }

  const updateMapping = (field, colIdx) => {
    setMapping(prev => ({
      ...prev,
      [field]: colIdx === '' ? undefined : parseInt(colIdx),
    }))
  }

  const mappingValid = mapping.patient_name !== undefined && mapping.address !== undefined

  // Preview data using current mapping
  const previewRows = rows.slice(0, 10).map(row => ({
    patient_name: mapping.patient_name !== undefined ? row[mapping.patient_name] || '' : '',
    address: mapping.address !== undefined ? row[mapping.address] || '' : '',
    city: mapping.city !== undefined ? row[mapping.city] || '' : '',
    zip: mapping.zip !== undefined ? row[mapping.zip] || '' : '',
    order_id: mapping.order_id !== undefined ? row[mapping.order_id] || '' : '',
    cold_chain: mapping.cold_chain !== undefined ? row[mapping.cold_chain] || '' : '',
  }))

  return (
    <PortalShell title="Upload Orders">
      {/* Step: Upload */}
      {step === 'upload' && (
        <div className="portal-upload-section">
          <div
            className={`portal-drop-zone ${dragOver ? 'portal-drop-zone--active' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <div className="portal-drop-icon">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="var(--p-text-ghost)" strokeWidth="1.5">
                <path d="M8 32v4a4 4 0 004 4h24a4 4 0 004-4v-4" />
                <polyline points="14 18 24 8 34 18" />
                <line x1="24" y1="8" x2="24" y2="32" />
              </svg>
            </div>
            <div className="portal-drop-text">
              Drag & drop a CSV file here
            </div>
            <div className="portal-drop-subtext">
              or click to browse
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={(e) => handleFile(e.target.files[0])}
            />
          </div>

          <div className="portal-upload-help">
            <h3>CSV Format</h3>
            <p>Your file should have a header row with columns like:</p>
            <code>Name, Address, City, Zip, Order ID, Cold Chain</code>
            <p style={{ marginTop: 8, fontSize: '0.75rem', color: 'var(--p-text-faint)' }}>
              Column names are auto-detected. At minimum, we need a patient name and address column.
            </p>
          </div>
        </div>
      )}

      {/* Step: Column Mapping */}
      {step === 'map' && (
        <div className="portal-map-section">
          <div className="portal-map-header">
            <h3>Map Your Columns</h3>
            <p>We couldn't auto-detect all required columns. Please map them below.</p>
          </div>

          <div className="portal-map-grid">
            {ALL_FIELDS.map(field => (
              <div key={field.key} className="portal-map-row">
                <label className="portal-map-label">
                  {field.label}
                  {field.required && <span style={{ color: '#EF4444', marginLeft: 4 }}>*</span>}
                </label>
                <select
                  className="portal-select"
                  value={mapping[field.key] ?? ''}
                  onChange={(e) => updateMapping(field.key, e.target.value)}
                >
                  <option value="">— Skip —</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>{h}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="portal-map-actions">
            <button className="portal-btn secondary" onClick={handleReset}>Back</button>
            <button
              className="portal-btn"
              disabled={!mappingValid}
              onClick={() => setStep('preview')}
            >
              Next: Preview
            </button>
          </div>
        </div>
      )}

      {/* Step: Preview */}
      {step === 'preview' && (
        <div className="portal-preview-section">
          <div className="portal-preview-header">
            <div>
              <h3>{fileName}</h3>
              <p>{rows.length} order{rows.length !== 1 ? 's' : ''} detected</p>
            </div>
            <div className="portal-preview-controls">
              <div className="portal-filter-group">
                <span className="portal-filter-label">Delivery Date</span>
                <input
                  type="date"
                  className="portal-input"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                />
              </div>
              {isAdmin && (
                <div className="portal-filter-group">
                  <span className="portal-filter-label">Pharmacy</span>
                  <select
                    className="portal-select"
                    value={selectedPharmacy}
                    onChange={(e) => setSelectedPharmacy(e.target.value)}
                  >
                    <option value="SHSP">SHSP</option>
                    <option value="Aultman">Aultman</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="portal-table-wrap" style={{ marginBottom: 16 }}>
            <table className="portal-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Patient Name</th>
                  <th>Address</th>
                  <th>City</th>
                  <th>ZIP</th>
                  <th>Order ID</th>
                  <th>Cold</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => (
                  <tr key={i}>
                    <td style={{ color: 'var(--p-text-faint)' }}>{i + 1}</td>
                    <td>{row.patient_name || <span style={{ color: 'var(--p-text-ghost)' }}>—</span>}</td>
                    <td>{row.address || <span style={{ color: 'var(--p-text-ghost)' }}>—</span>}</td>
                    <td>{row.city || <span style={{ color: 'var(--p-text-ghost)' }}>—</span>}</td>
                    <td>{row.zip || <span style={{ color: 'var(--p-text-ghost)' }}>—</span>}</td>
                    <td>{row.order_id || <span style={{ color: 'var(--p-text-ghost)' }}>—</span>}</td>
                    <td>{row.cold_chain && row.cold_chain.toLowerCase() !== 'no' && row.cold_chain.toLowerCase() !== 'n'
                      ? <span className="portal-cold-chain">Cold</span>
                      : ''
                    }</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 10 && (
              <div style={{ padding: 10, textAlign: 'center', fontSize: '0.72rem', color: 'var(--p-text-faint)' }}>
                Showing first 10 of {rows.length} rows
              </div>
            )}
          </div>

          <div className="portal-preview-actions">
            <button className="portal-btn secondary" onClick={() => setStep('map')}>Edit Mapping</button>
            <button className="portal-btn" onClick={handleSubmit} disabled={uploading}>
              {uploading ? 'Uploading...' : `Upload ${rows.length} Orders`}
            </button>
          </div>
        </div>
      )}

      {/* Step: Done */}
      {step === 'done' && result && (
        <div className="portal-done-section">
          <div className="portal-done-icon">
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
              <circle cx="32" cy="32" r="30" stroke="#10B981" strokeWidth="2" />
              <polyline points="20 33 28 41 44 25" stroke="#10B981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </div>
          <h2 className="portal-done-title">Orders Uploaded</h2>
          <div className="portal-done-stats">
            <div className="portal-stat-card">
              <div className="portal-stat-label">Inserted</div>
              <div className="portal-stat-value" style={{ color: '#10B981' }}>{result.inserted}</div>
            </div>
            <div className="portal-stat-card">
              <div className="portal-stat-label">Skipped (empty)</div>
              <div className="portal-stat-value">{result.skipped}</div>
            </div>
            <div className="portal-stat-card">
              <div className="portal-stat-label">Delivery Date</div>
              <div className="portal-stat-value" style={{ fontSize: '1rem' }}>{result.delivery_date}</div>
            </div>
            <div className="portal-stat-card">
              <div className="portal-stat-label">Pharmacy</div>
              <div className="portal-stat-value" style={{ fontSize: '1rem' }}>{result.pharmacy}</div>
            </div>
          </div>
          <button className="portal-btn" onClick={handleReset} style={{ marginTop: 24 }}>
            Upload More
          </button>
        </div>
      )}

      {error && (
        <div className="portal-error-banner">
          {error}
        </div>
      )}
    </PortalShell>
  )
}
