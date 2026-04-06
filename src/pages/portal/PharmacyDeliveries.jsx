import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePharmacyAuth } from '../../context/PharmacyAuthContext'
import { supabase } from '../../lib/supabase'
import './portal.css'

function formatDate(date) {
  return date.toISOString().split('T')[0]
}

function formatTimestamp(ts) {
  if (!ts) return '--'
  const d = new Date(ts)
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

const STATUS_CLASSES = {
  delivered: 'portal__badge--green',
  dispatched: 'portal__badge--blue',
  failed: 'portal__badge--red',
  in_progress: 'portal__badge--blue',
}

export default function PharmacyDeliveries() {
  const { tenant, signOut } = usePharmacyAuth()
  const navigate = useNavigate()
  const today = formatDate(new Date())
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [stops, setStops] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  async function fetchStops() {
    setLoading(true)
    const { data, error } = await supabase
      .from('daily_stops')
      .select('*')
      .eq('pharmacy', tenant.name)
      .gte('delivery_date', startDate)
      .lte('delivery_date', endDate)
      .order('delivery_date', { ascending: false })

    if (!error && data) {
      setStops(data)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchStops()
  }, [startDate, endDate, tenant.name])

  const filtered = useMemo(() => {
    if (!search.trim()) return stops
    const q = search.toLowerCase()
    return stops.filter(
      (s) =>
        (s.patient_name || '').toLowerCase().includes(q) ||
        (s.address || '').toLowerCase().includes(q)
    )
  }, [stops, search])

  return (
    <div className="portal__layout">
      <header className="portal__header">
        <div className="portal__header-left">
          <h1 className="portal__header-title">{tenant.display_name}</h1>
        </div>
        <div className="portal__header-right">
          <nav className="portal__nav">
            <button
              className="portal__nav-link"
              onClick={() => navigate('/portal/dashboard')}
            >
              Dashboard
            </button>
            <button
              className="portal__nav-link portal__nav-link--active"
              onClick={() => navigate('/portal/deliveries')}
            >
              Deliveries
            </button>
          </nav>
          <button className="portal__btn portal__btn--outline" onClick={signOut}>
            Sign Out
          </button>
        </div>
      </header>

      <main className="portal__main">
        <div className="portal__deliveries-controls">
          <div className="portal__date-range">
            <div className="portal__date-picker">
              <label htmlFor="del-start">From</label>
              <input
                id="del-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="portal__date-picker">
              <label htmlFor="del-end">To</label>
              <input
                id="del-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <div className="portal__search">
            <input
              type="text"
              placeholder="Search patient name or address..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="portal__count">
          {filtered.length} deliver{filtered.length === 1 ? 'y' : 'ies'}
        </div>

        {loading ? (
          <div className="portal__loading-inline">
            <div className="portal__spinner" />
          </div>
        ) : (
          <div className="portal__table-wrap">
            <table className="portal__table portal__table--deliveries">
              <thead>
                <tr>
                  <th>Patient Name</th>
                  <th>Address</th>
                  <th>City</th>
                  <th>ZIP</th>
                  <th>Driver</th>
                  <th>Status</th>
                  <th>Delivered At</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="portal__table-empty">
                      No deliveries found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((s) => (
                    <tr
                      key={s.id}
                      className="portal__table-row--clickable"
                      onClick={() => navigate(`/portal/pod/${s.order_id || s.id}`)}
                    >
                      <td>{s.patient_name || '--'}</td>
                      <td>{s.address || '--'}</td>
                      <td>{s.city || '--'}</td>
                      <td>{s.zip || '--'}</td>
                      <td>{s.driver_name || '--'}</td>
                      <td>
                        <span
                          className={`portal__badge ${STATUS_CLASSES[s.status] || ''}`}
                        >
                          {s.status || 'unknown'}
                        </span>
                      </td>
                      <td>{formatTimestamp(s.delivered_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
