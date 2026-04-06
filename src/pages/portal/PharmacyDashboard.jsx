import { useState, useEffect, useMemo } from 'react'
import { usePharmacyAuth } from '../../context/PharmacyAuthContext'
import { supabase } from '../../lib/supabase'
import { useNavigate } from 'react-router-dom'
import './portal.css'

function formatDate(date) {
  return date.toISOString().split('T')[0]
}

function displayDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default function PharmacyDashboard() {
  const { tenant, signOut } = usePharmacyAuth()
  const navigate = useNavigate()
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()))
  const [stops, setStops] = useState([])
  const [loading, setLoading] = useState(true)

  async function fetchStops(date) {
    setLoading(true)
    const { data, error } = await supabase
      .from('daily_stops')
      .select('*')
      .eq('delivery_date', date)
      .eq('pharmacy', tenant.name)

    if (!error && data) {
      setStops(data)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchStops(selectedDate)

    // Realtime subscription
    const channel = supabase
      .channel('portal-dashboard')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'daily_stops',
          filter: `delivery_date=eq.${selectedDate}`,
        },
        () => {
          fetchStops(selectedDate)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [selectedDate, tenant.name])

  const kpis = useMemo(() => {
    const total = stops.length
    const delivered = stops.filter((s) => s.status === 'delivered').length
    const inProgress = stops.filter(
      (s) => s.status === 'dispatched' || s.status === 'in_progress'
    ).length
    const failed = stops.filter((s) => s.status === 'failed').length
    return { total, delivered, inProgress, failed }
  }, [stops])

  const progressPct =
    kpis.total > 0 ? Math.round((kpis.delivered / kpis.total) * 100) : 0

  const drivers = useMemo(() => {
    const map = {}
    stops.forEach((s) => {
      const name = s.driver_name || 'Unassigned'
      if (!map[name]) {
        map[name] = { name, assigned: 0, completed: 0 }
      }
      map[name].assigned++
      if (s.status === 'delivered') map[name].completed++
    })
    return Object.values(map).sort((a, b) => b.assigned - a.assigned)
  }, [stops])

  return (
    <div className="portal__layout">
      <header className="portal__header">
        <div className="portal__header-left">
          <h1 className="portal__header-title">{tenant.display_name}</h1>
          <span className="portal__header-date">{displayDate(selectedDate)}</span>
        </div>
        <div className="portal__header-right">
          <nav className="portal__nav">
            <button
              className="portal__nav-link portal__nav-link--active"
              onClick={() => navigate('/portal/dashboard')}
            >
              Dashboard
            </button>
            <button
              className="portal__nav-link"
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
        <div className="portal__date-picker">
          <label htmlFor="dashboard-date">Date</label>
          <input
            id="dashboard-date"
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="portal__loading-inline">
            <div className="portal__spinner" />
          </div>
        ) : (
          <>
            <div className="portal__kpi-grid">
              <div className="portal__kpi-card">
                <span className="portal__kpi-value">{kpis.total}</span>
                <span className="portal__kpi-label">Total Packages</span>
              </div>
              <div className="portal__kpi-card portal__kpi-card--green">
                <span className="portal__kpi-value">{kpis.delivered}</span>
                <span className="portal__kpi-label">Delivered</span>
              </div>
              <div className="portal__kpi-card portal__kpi-card--blue">
                <span className="portal__kpi-value">{kpis.inProgress}</span>
                <span className="portal__kpi-label">In Progress</span>
              </div>
              <div className="portal__kpi-card portal__kpi-card--red">
                <span className="portal__kpi-value">{kpis.failed}</span>
                <span className="portal__kpi-label">Failed</span>
              </div>
            </div>

            <div className="portal__progress-section">
              <div className="portal__progress-header">
                <span>Delivery Progress</span>
                <span className="portal__progress-pct">{progressPct}%</span>
              </div>
              <div className="portal__progress-bar">
                <div
                  className="portal__progress-fill"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className="portal__progress-detail">
                {kpis.delivered} of {kpis.total} packages delivered
              </span>
            </div>

            {drivers.length > 0 && (
              <div className="portal__drivers-section">
                <h2 className="portal__section-title">Active Drivers</h2>
                <div className="portal__drivers-table-wrap">
                  <table className="portal__table">
                    <thead>
                      <tr>
                        <th>Driver</th>
                        <th>Stops Assigned</th>
                        <th>Stops Completed</th>
                        <th>Progress</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drivers.map((d) => {
                        const pct =
                          d.assigned > 0
                            ? Math.round((d.completed / d.assigned) * 100)
                            : 0
                        return (
                          <tr key={d.name}>
                            <td className="portal__td-driver">{d.name}</td>
                            <td>{d.assigned}</td>
                            <td>{d.completed}</td>
                            <td>
                              <div className="portal__mini-progress">
                                <div
                                  className="portal__mini-progress-fill"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="portal__mini-pct">{pct}%</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {stops.length === 0 && (
              <div className="portal__empty">
                <p>No deliveries found for this date.</p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
