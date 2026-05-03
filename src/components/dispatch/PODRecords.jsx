import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { PODModal, getPhotoUrls, hasPodEvidence, formatTime } from '../../pages/portal/PortalDashboard'
import { downloadBulkPodPdf } from '../../lib/podPdf'
import '../portal/PortalShell.css'
import './PODRecords.css'

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function PODRecords() {
  const [stops, setStops] = useState([])
  const [confirmations, setConfirmations] = useState({})
  const [loading, setLoading] = useState(true)
  const [podStop, setPodStop] = useState(null)
  const [date, setDate] = useState(todayStr())
  const [pharmacyFilter, setPharmacyFilter] = useState('all')
  const [driverFilter, setDriverFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [bulkExporting, setBulkExporting] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('daily_stops')
        .select('*')
        .eq('delivery_date', date)
        .eq('status', 'delivered')
        .limit(2000)
      if (!error && data) {
        const withPod = data.filter(s => hasPodEvidence(s))
        setStops(withPod)
        const ids = withPod.map(s => String(s.id || s.order_id)).filter(Boolean)
        if (ids.length > 0) {
          const { data: confs } = await supabase
            .from('delivery_confirmations')
            .select('stop_id, gps_distance_feet, geofence_overridden, barcode_scanned, barcode_matched, handed_directly')
            .in('stop_id', ids)
          const map = {}
          ;(confs || []).forEach(c => { if (!map[c.stop_id]) map[c.stop_id] = c })
          setConfirmations(map)
        } else {
          setConfirmations({})
        }
      }
      setLoading(false)
    }
    load()
  }, [date])

  const drivers = [...new Set(stops.map(s => s.driver_name).filter(Boolean))].sort()
  const pharmacies = [...new Set(stops.map(s => s.pharmacy).filter(Boolean))].sort()
  const filtered = stops.filter(s => {
    if (pharmacyFilter !== 'all' && s.pharmacy !== pharmacyFilter) return false
    if (driverFilter !== 'all' && s.driver_name !== driverFilter) return false
    if (search) {
      const q = search.toLowerCase()
      const hay = `${s.patient_name || ''} ${s.address || ''} ${s.city || ''} ${s.zip || ''} ${s.order_id || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  const sigCount = stops.filter(s => s.signature_url).length

  return (
    <div className="pod-records">
      <div className="pod-records__header">
        <div>
          <h2 className="pod-records__title">POD Records</h2>
          <p className="pod-records__sub">Photos, signatures, and GPS for delivered stops.</p>
        </div>
        <button
          className="pod-records__export"
          disabled={filtered.length === 0 || bulkExporting}
          onClick={async () => {
            setBulkExporting(true)
            try { await downloadBulkPodPdf(filtered, date) } catch {}
            setBulkExporting(false)
          }}
        >
          {bulkExporting ? 'Generating...' : `Export ${filtered.length} as PDF`}
        </button>
      </div>

      <div className="pod-records__filters">
        <div className="pod-records__filter">
          <label>Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div className="pod-records__filter">
          <label>Pharmacy</label>
          <select value={pharmacyFilter} onChange={e => setPharmacyFilter(e.target.value)}>
            <option value="all">All</option>
            {pharmacies.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="pod-records__filter">
          <label>Driver</label>
          <select value={driverFilter} onChange={e => setDriverFilter(e.target.value)}>
            <option value="all">All</option>
            {drivers.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="pod-records__filter pod-records__filter--grow">
          <label>Search</label>
          <input
            type="text"
            placeholder="Patient, address, ZIP, or order #"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="pod-records__stats">
        <span>{filtered.length} of {stops.length} record{stops.length !== 1 ? 's' : ''}</span>
        <span>{sigCount} with signature</span>
      </div>

      {loading ? (
        <div className="pod-records__loading"><div className="dispatch__spinner" />Loading PODs...</div>
      ) : filtered.length === 0 ? (
        <div className="pod-records__empty">
          <div className="pod-records__empty-title">No POD records</div>
          <div className="pod-records__empty-sub">No proof of delivery found for this date and filter.</div>
        </div>
      ) : (
        <div className="pod-records__grid">
          {filtered.map(stop => {
            const photos = getPhotoUrls(stop)
            const thumb = photos[0] || stop.signature_url || null
            const photoCount = photos.length
            const conf = confirmations[String(stop.id || stop.order_id)]
            const handedDirectly = !!conf?.handed_directly
            const photosOk = photoCount >= 2 || (handedDirectly && photoCount >= 1)
            const geoOk = conf && !conf.geofence_overridden && conf.gps_distance_feet != null
            const geoFail = conf && conf.geofence_overridden
            const barcodeOk = conf && conf.barcode_scanned && conf.barcode_matched
            const barcodeFail = conf && conf.barcode_scanned && !conf.barcode_matched
            return (
              <button key={stop.id} className="pod-records__card" onClick={() => setPodStop(stop)}>
                {thumb ? (
                  <img className="pod-records__card-thumb" src={thumb} alt="POD" />
                ) : (
                  <div className="pod-records__card-thumb pod-records__card-thumb--empty">No image</div>
                )}
                <div className="pod-records__card-body">
                  <div className="pod-records__card-name">
                    {stop.patient_name || '-'}
                    {photoCount > 0 && <span style={{ color: '#9BA5B4', fontWeight: 400, marginLeft: 4 }}>({photoCount})</span>}
                  </div>
                  <div className="pod-records__card-addr">{stop.address || '-'}{stop.city ? `, ${stop.city}` : ''}</div>
                  <div className="pod-records__card-driver">
                    <span>{stop.driver_name || '-'}</span>
                    <span className="pod-records__dot">·</span>
                    <span>{formatTime(stop.delivered_at)}</span>
                  </div>
                  <div className="pod-records__card-badges">
                    <span className={`pod-records__pill ${photosOk ? 'pod-records__pill--ok' : 'pod-records__pill--fail'}`}>
                      {photoCount} Photo{photoCount !== 1 ? 's' : ''}
                    </span>
                    {conf && (
                      <span className={`pod-records__pill ${geoOk ? 'pod-records__pill--ok' : 'pod-records__pill--fail'}`}>
                        Geofence {geoOk ? '✓' : geoFail ? '✗' : '—'}
                      </span>
                    )}
                    {conf && conf.barcode_scanned && (
                      <span className={`pod-records__pill ${barcodeOk ? 'pod-records__pill--ok' : 'pod-records__pill--fail'}`}>
                        Scan {barcodeOk ? '✓' : '✗'}
                      </span>
                    )}
                    {handedDirectly && <span className="pod-records__pill pod-records__pill--info">Handed ✓</span>}
                    {stop.signature_url && <span className="pod-records__pill pod-records__pill--info">Signed</span>}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {podStop && <PODModal stop={podStop} onClose={() => setPodStop(null)} />}
    </div>
  )
}
