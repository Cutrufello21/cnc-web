import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import PortalShell from '../../components/portal/PortalShell'

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('en-CA')
}

export default function PortalReports() {
  const { profile } = useAuth()
  const [stops, setStops] = useState([])
  const [loading, setLoading] = useState(true)
  const [startDate, setStartDate] = useState(daysAgo(30))
  const [endDate, setEndDate] = useState(new Date().toLocaleDateString('en-CA'))

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

  const stats = useMemo(() => {
    const total = stops.length
    const delivered = stops.filter(s => s.status === 'delivered').length
    const failed = stops.filter(s => s.status === 'failed' || s.status === 'attempted').length
    const withPod = stops.filter(s => s.status === 'delivered' && (s.photo_url || s.signature_url || s.photo_urls)).length
    const podRate = delivered > 0 ? Math.round((withPod / delivered) * 100) : 0

    // Most active driver
    const driverCounts = {}
    stops.forEach(s => {
      if (s.driver_name) {
        driverCounts[s.driver_name] = (driverCounts[s.driver_name] || 0) + 1
      }
    })
    const topDriver = Object.entries(driverCounts).sort((a, b) => b[1] - a[1])[0]

    // Busiest day
    const dayCounts = {}
    stops.forEach(s => {
      if (s.delivery_date) {
        dayCounts[s.delivery_date] = (dayCounts[s.delivery_date] || 0) + 1
      }
    })
    const busiestDay = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0]

    return { total, delivered, failed, podRate, topDriver, busiestDay }
  }, [stops])

  function exportCSV() {
    if (stops.length === 0) return

    const headers = ['Date', 'Patient', 'Address', 'City', 'Zip', 'Driver', 'Status', 'Delivered At', 'Notes']
    const rows = stops.map(s => [
      s.delivery_date || '',
      s.patient_name || '',
      s.address || '',
      s.city || '',
      s.zip || '',
      s.driver_name || '',
      s.status || '',
      s.delivered_at || '',
      s.delivery_note || '',
    ])

    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cnc-deliveries-${startDate}-to-${endDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <PortalShell title="Reports">
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
        <div className="portal-filter-group" style={{ alignSelf: 'flex-end' }}>
          <button className="portal-btn" onClick={exportCSV} disabled={stops.length === 0}>
            Export CSV
          </button>
        </div>
      </div>

      {loading ? (
        <div className="portal-loading">Loading report...</div>
      ) : (
        <>
          <div className="portal-report-summary">
            <div className="portal-stat-card">
              <div className="portal-stat-label">Total Deliveries</div>
              <div className="portal-stat-value">{stats.total}</div>
            </div>
            <div className="portal-stat-card">
              <div className="portal-stat-label">Delivered</div>
              <div className="portal-stat-value" style={{ color: '#10B981' }}>{stats.delivered}</div>
            </div>
            <div className="portal-stat-card">
              <div className="portal-stat-label">Failed</div>
              <div className="portal-stat-value" style={{ color: '#EF4444' }}>{stats.failed}</div>
            </div>
            <div className="portal-stat-card">
              <div className="portal-stat-label">POD Capture Rate</div>
              <div className="portal-stat-value">{stats.podRate}%</div>
            </div>
            <div className="portal-stat-card">
              <div className="portal-stat-label">Most Active Driver</div>
              <div className="portal-stat-value" style={{ fontSize: '1rem' }}>
                {stats.topDriver ? `${stats.topDriver[0]} (${stats.topDriver[1]})` : '-'}
              </div>
            </div>
            <div className="portal-stat-card">
              <div className="portal-stat-label">Busiest Day</div>
              <div className="portal-stat-value" style={{ fontSize: '1rem' }}>
                {stats.busiestDay ? `${stats.busiestDay[0]} (${stats.busiestDay[1]})` : '-'}
              </div>
            </div>
          </div>

          {stops.length === 0 ? (
            <div className="portal-empty">No data for the selected date range.</div>
          ) : (
            <div className="portal-table-wrap">
              <table className="portal-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Patient</th>
                    <th>Address</th>
                    <th>Driver</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stops.slice(0, 100).map(stop => (
                    <tr key={stop.id}>
                      <td>{stop.delivery_date || '-'}</td>
                      <td>{stop.patient_name || '-'}</td>
                      <td>{stop.address || '-'}</td>
                      <td>{stop.driver_name || '-'}</td>
                      <td>
                        <span className={`portal-badge ${stop.status === 'delivered' ? 'delivered' : stop.status === 'failed' || stop.status === 'attempted' ? 'failed' : 'pending'}`}>
                          {stop.status === 'delivered' ? 'Delivered' : stop.status === 'failed' || stop.status === 'attempted' ? 'Failed' : 'Pending'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {stops.length > 100 && (
                <div style={{ padding: 12, textAlign: 'center', fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)' }}>
                  Showing first 100 of {stops.length} rows. Export CSV for full data.
                </div>
              )}
            </div>
          )}
        </>
      )}
    </PortalShell>
  )
}
