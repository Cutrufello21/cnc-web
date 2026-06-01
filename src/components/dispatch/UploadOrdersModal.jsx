import { useState, useRef, useCallback } from 'react'
import { useTenant } from '../../context/TenantContext'
import { parseCSV, detectColumns } from '../../lib/csvOrders'

// Local YYYY-MM-DD (matches the date pattern used across RoutesView/DispatchPage).
function toDateStr(d) {
  if (!d) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dayName(dateStr) {
  if (!dateStr) return ''
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return days[new Date(dateStr + 'T12:00:00').getDay()]
}

// Manual CSV upload for the dispatch portal. Mirrors PortalOrders' flow but
// supports staging multiple files at once (BioTouch sends one CSV per pharmacy
// batch) and defaults the delivery date to the day currently open in Routes.
export default function UploadOrdersModal({ deliveryDateObj, onClose, onUploaded }) {
  const { tenant } = useTenant()
  const fileRef = useRef(null)

  const pharmacyOptions = (tenant?.pharmacyOrigins || []).map(o => o.name).filter(Boolean)
  const pharmacies = pharmacyOptions.length ? pharmacyOptions : ['SHSP', 'Aultman']

  const [deliveryDate, setDeliveryDate] = useState(() => toDateStr(deliveryDateObj) || toDateStr(new Date()))
  const [files, setFiles] = useState([]) // { id, name, headers, rows, mapping, pharmacy, error }
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState(null) // [{ name, pharmacy, inserted, skipped, error }]

  const addFiles = useCallback((fileList) => {
    const csvs = Array.from(fileList).filter(f => f.name.toLowerCase().endsWith('.csv') || f.type === 'text/csv')
    if (!csvs.length) return

    csvs.forEach((file) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const parsed = parseCSV(e.target.result)
        const entry = {
          id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          pharmacy: pharmacies[0],
          headers: [],
          rows: [],
          mapping: {},
          error: '',
        }
        if (parsed.length < 2) {
          entry.error = 'Needs a header row + at least one data row'
        } else {
          entry.headers = parsed[0]
          entry.rows = parsed.slice(1).filter(r => r.some(c => c))
          entry.mapping = detectColumns(entry.headers)
          if (entry.rows.length === 0) entry.error = 'No data rows found'
          else if (entry.mapping.patient_name === undefined || entry.mapping.address === undefined) {
            entry.error = 'Could not detect name/address columns'
          }
        }
        setFiles(prev => [...prev, entry])
      }
      reader.readAsText(file)
    })
  }, [pharmacies])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    addFiles(e.dataTransfer.files)
  }, [addFiles])

  const removeFile = (id) => setFiles(prev => prev.filter(f => f.id !== id))
  const setPharmacy = (id, pharmacy) => setFiles(prev => prev.map(f => f.id === id ? { ...f, pharmacy } : f))

  const validFiles = files.filter(f => !f.error && f.rows.length > 0)
  const totalOrders = validFiles.reduce((n, f) => n + f.rows.length, 0)

  const handleUpload = async () => {
    if (!deliveryDate || validFiles.length === 0) return
    setUploading(true)
    const token = localStorage.getItem('cnc-token')
    const out = []
    for (const f of validFiles) {
      try {
        const res = await fetch('/api/upload-orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            rows: f.rows,
            headers: f.headers,
            mapping: f.mapping,
            pharmacy: f.pharmacy,
            delivery_date: deliveryDate,
          }),
        })
        const data = await res.json()
        if (!res.ok) out.push({ name: f.name, pharmacy: f.pharmacy, error: data.error || 'Upload failed' })
        else out.push({ name: f.name, pharmacy: f.pharmacy, inserted: data.inserted, skipped: data.skipped })
      } catch {
        out.push({ name: f.name, pharmacy: f.pharmacy, error: 'Network error' })
      }
    }
    setResults(out)
    setUploading(false)
    if (out.some(r => r.inserted > 0) && onUploaded) onUploaded()
  }

  const inputStyle = { padding: '7px 10px', borderRadius: 8, border: '1px solid #E0E4ED', fontSize: 13, color: '#0B1E3D', background: '#fff' }

  return (
    <div className="dispatch__ai-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !uploading) onClose() }}>
      <div className="dispatch__ai-modal" style={{ maxWidth: 620 }}>
        <div className="dispatch__ai-header">
          <h3 className="dispatch__ai-title">Upload Orders CSV</h3>
          <button className="dispatch__ai-close" onClick={onClose} disabled={uploading}>✕</button>
        </div>

        <div style={{ padding: '18px 24px', overflowY: 'auto' }}>
          {!results && (
            <>
              {/* Delivery date */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#0B1E3D' }}>Delivery Date</label>
                <input type="date" style={inputStyle} value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
                {deliveryDate && <span style={{ fontSize: 12, color: '#6B7280' }}>{dayName(deliveryDate)}</span>}
              </div>

              {/* Drop zone */}
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                style={{
                  border: `2px dashed ${dragOver ? '#4A9EFF' : '#D5DAE5'}`,
                  borderRadius: 12, padding: '28px 20px', textAlign: 'center', cursor: 'pointer',
                  background: dragOver ? 'rgba(74,158,255,0.06)' : '#F8FAFC', transition: 'all 0.15s',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1E3D' }}>Drag &amp; drop CSV files here</div>
                <div style={{ fontSize: 12, color: '#9BA5B4', marginTop: 4 }}>or click to browse — you can add more than one</div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
                />
              </div>

              {/* Staged files */}
              {files.length > 0 && (
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {files.map(f => (
                    <div key={f.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                      border: '1px solid #EEF1F6', borderRadius: 10, background: '#fff',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1E3D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                        {f.error
                          ? <div style={{ fontSize: 11.5, color: '#EF4444', marginTop: 2 }}>{f.error}</div>
                          : <div style={{ fontSize: 11.5, color: '#16a34a', marginTop: 2 }}>{f.rows.length} order{f.rows.length !== 1 ? 's' : ''} detected</div>}
                      </div>
                      <select
                        style={{ ...inputStyle, padding: '5px 8px' }}
                        value={f.pharmacy}
                        disabled={!!f.error}
                        onChange={(e) => setPharmacy(f.id, e.target.value)}
                      >
                        {pharmacies.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                      <button
                        onClick={() => removeFile(f.id)}
                        style={{ border: 'none', background: 'none', color: '#9BA5B4', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}
                        title="Remove"
                      >✕</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Results */}
          {results && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {results.map((r, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  padding: '10px 12px', border: '1px solid #EEF1F6', borderRadius: 10,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1E3D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.name} <span style={{ color: '#9BA5B4', fontWeight: 500 }}>· {r.pharmacy}</span>
                  </div>
                  {r.error
                    ? <span style={{ fontSize: 12, color: '#EF4444', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.error}</span>
                    : <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        +{r.inserted} added
                        {r.assigned ? ` · ${r.assigned} assigned` : ''}
                        {r.unassigned ? ` · ${r.unassigned} unassigned` : ''}
                      </span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 24px', borderTop: '1px solid #f0f2f5' }}>
          {!results ? (
            <>
              <button className="dispatch__send-btn dispatch__send-btn--corrections" onClick={onClose} disabled={uploading}>Cancel</button>
              <button
                className="dispatch__send-btn"
                onClick={handleUpload}
                disabled={uploading || validFiles.length === 0 || !deliveryDate}
              >
                {uploading ? 'Uploading...' : `Upload ${totalOrders} order${totalOrders !== 1 ? 's' : ''}`}
              </button>
            </>
          ) : (
            <button className="dispatch__send-btn" onClick={onClose}>Done</button>
          )}
        </div>
      </div>
    </div>
  )
}
