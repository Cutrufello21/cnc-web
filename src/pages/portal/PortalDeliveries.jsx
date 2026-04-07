import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import PortalShell from '../../components/portal/PortalShell'
import { PODModal, hasPodEvidence, getStatusClass, getStatusLabel, formatTime } from './PortalDashboard'

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('en-CA')
}

export default function PortalDeliveries() {
  const { profile } = useAuth()
  const [stops, setStops] = useState([])
  const [loading, setLoading] = useState(true)
  const [podStop, setPodStop] = useState(null)
  const [startDate, setStartDate] = useState(daysAgo(7))
  const [endDate, setEndDate] = useState(new Date().toLocaleDateString('en-CA'))
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [driverFilter, setDriverFilter] = useState('all')

  const pharmacyName = profile?.pharmacy_name || profile?.pharmacy || 'SHSP'

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('daily_stops')
        .select('*')
        .eq('pharmacy', pharmacyName)
        .gte('delivery_date', startDate)
        .lte('delivery_date', endDate)
        .order('delivery_date', { ascending: false })

      if (!error && data) setStops(data)
      setLoading(false)
    }
    load()
  }, [pharmacyName, startDate, endDate])

  const drivers = useMemo(() => {
    const set = new Set()
    stops.forEach(s => { if (s.driver_name) set.add(s.driver_name) })
    return Array.from(set).sort()
  }, [stops])

  const filtered = useMemo(() => {
    return stops.filter(s => {
      if (search) {
        const q = search.toLowerCase()
        const matchName = (s.patient_name || '').toLowerCase().includes(q)
        const matchAddr = (s.address || '').toLowerCase().includes(q)
        if (!matchName && !matchAddr) return false
      }
      if (statusFilter !== 'all') {
        const cls = getStatusClass(s.status)
        if (statusFilter !== cls) return false
      }
      if (driverFilter !== 'all' && s.driver_name !== driverFilter) return false
      return true
    })
  }, [stops, search, statusFilter, driverFilter])

  return (
    <PortalShell title="Deliveries">
      <div className="portal-filters">
        <div className="portal-filter-group">
          <span className="portal-filter-label">Start Date</span>
          <input
            type="date"
            className="portal-input"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
          />
        </div>
        <div className="portal-filter-group">
          <span className="portal-filter-label">End Date</span>
          <input
            type="date"
            className="portal-input"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
          />
        </div>
        <div className="portal-filter-group">
          <span className="portal-filter-label">Search</span>
          <input
            type="text"
            className="portal-input"
            placeholder="Patient or address..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="portal-filter-group">
          <span className="portal-filter-label">Status</span>
          <select className="portal-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="delivered">Delivered</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        <div className="portal-filter-group">
          <span className="portal-filter-label">Driver</span>
          <select className="portal-select" value={driverFilter} onChange={e => setDriverFilter(e.target.value)}>
            <option value="all">All Drivers</option>
            {drivers.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>

      <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', marginBottom: 12 }}>
        {filtered.length} deliveries found
      </div>

      {loading ? (
        <div className="portal-loading">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="portal-empty">No deliveries match your filters.</div>
      ) : (
        <div className="portal-table-wrap">
          <table className="portal-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Patient</th>
                <th>Address</th>
                <th>City</th>
                <th>Zip</th>
                <th>Driver</th>
                <th>Status</th>
                <th>Time</th>
                <th>POD</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(stop => (
                <tr
                  key={stop.id}
                  style={{ cursor: hasPodEvidence(stop) ? 'pointer' : 'default' }}
                  onClick={() => {
                    if (hasPodEvidence(stop)) {
                      setPodStop(stop)
                    }
                  }}
                >
                  <td>{stop.delivery_date || '-'}</td>
                  <td>{stop.patient_name || '-'}</td>
                  <td>{stop.address || '-'}</td>
                  <td>{stop.city || '-'}</td>
                  <td>{stop.zip || '-'}</td>
                  <td>{stop.driver_name || '-'}</td>
                  <td>
                    <span className={`portal-badge ${getStatusClass(stop.status)}`}>
                      {getStatusLabel(stop.status)}
                    </span>
                  </td>
                  <td>{formatTime(stop.delivered_at)}</td>
                  <td>
                    {hasPodEvidence(stop) ? (
                      <button className="portal-pod-btn" onClick={e => { e.stopPropagation(); setPodStop(stop) }}>
                        POD
                      </button>
                    ) : <span style={{ color: 'rgba(255,255,255,0.25)' }}>-</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {podStop && <PODModal stop={podStop} onClose={() => setPodStop(null)} />}
    </PortalShell>
  )
}
