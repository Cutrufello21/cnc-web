import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import StopCard from '../components/driver/StopCard'
import WeeklyBar from '../components/driver/WeeklyBar'
import TimeOffCalendar from '../components/driver/TimeOffCalendar'
import ThemeToggle from '../components/ThemeToggle'
import './DashboardShell.css'
import './DriverPage.css'

export default function DriverPage() {
  const { user, profile, signOut } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('stops')

  useEffect(() => {
    if (user?.email) fetchDriverData()
  }, [user?.email])

  async function fetchDriverData() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/driver?email=${encodeURIComponent(user.email)}`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || `API error: ${res.status}`)
      }
      setData(await res.json())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="shell">
      <header className="shell__header">
        <div className="container shell__header-inner">
          <div className="shell__brand">
            <span className="shell__logo">CNC</span>
            <span className="shell__title">Driver Portal</span>
          </div>
          <div className="shell__user">
            <ThemeToggle />
            <span className="shell__name">{data?.driverName || profile?.full_name}</span>
            <button className="shell__signout" onClick={signOut}>Sign Out</button>
          </div>
        </div>
      </header>

      <main className="shell__main container">
        {loading && (
          <div className="dispatch__loading">
            <div className="dispatch__spinner" />
            <p>Loading your route...</p>
          </div>
        )}

        {error && (
          <div className="dispatch__error">
            <p>{error}</p>
            <button onClick={fetchDriverData}>Retry</button>
          </div>
        )}

        {data && !loading && (
          <>
            {/* Status banner */}
            {data.noDeliveryToday ? (
              <div className="driver__banner driver__banner--off">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="8" y1="12" x2="16" y2="12" />
                </svg>
                <div>
                  <h3>No deliveries today</h3>
                  <p>It's {data.deliveryDay}. Routes resume on the next business day.</p>
                </div>
              </div>
            ) : !data.approved ? (
              <div className="driver__banner driver__banner--pending">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
                <div>
                  <h3>Route not ready yet</h3>
                  <p>Your {data.deliveryDay} route is being prepared. You'll be notified when it's approved.</p>
                </div>
              </div>
            ) : (
              <div className="driver__banner driver__banner--approved">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <div>
                  <h3>Route approved</h3>
                  <p>Your {data.deliveryDay} route is ready. {data.stopCount} stop{data.stopCount !== 1 ? 's' : ''} today.</p>
                </div>
              </div>
            )}

            {/* Quick stats */}
            <div className="driver__stats">
              <div className="driver__stat">
                <span className="driver__stat-value">{data.stopCount || 0}</span>
                <span className="driver__stat-label">Today's Stops</span>
              </div>
              <div className="driver__stat">
                <span className="driver__stat-value driver__stat-value--cold">{data.coldChainCount || 0}</span>
                <span className="driver__stat-label">Cold Chain</span>
              </div>
              <div className="driver__stat">
                <span className="driver__stat-value">{data.weekTotal || 0}</span>
                <span className="driver__stat-label">This Week</span>
              </div>
            </div>

            {/* Tabs */}
            <div className="driver__tabs">
              <button
                className={`driver__tab ${activeTab === 'stops' ? 'driver__tab--active' : ''}`}
                onClick={() => setActiveTab('stops')}
              >
                Stops ({data.stopCount || 0})
              </button>
              <button
                className={`driver__tab ${activeTab === 'week' ? 'driver__tab--active' : ''}`}
                onClick={() => setActiveTab('week')}
              >
                Weekly Summary
              </button>
              <button
                className={`driver__tab ${activeTab === 'timeoff' ? 'driver__tab--active' : ''}`}
                onClick={() => setActiveTab('timeoff')}
              >
                Time Off
              </button>
            </div>

            {/* Tab content */}
            {activeTab === 'stops' && (
              <div className="driver__stops">
                {!data.approved && !data.noDeliveryToday ? (
                  <div className="driver__not-ready">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                    </svg>
                    <h3>Route not ready yet</h3>
                    <p>Your stop list will appear here once the dispatcher approves tonight's routes.</p>
                  </div>
                ) : data.stops?.length > 0 ? (
                  data.stops.map((stop, i) => (
                    <StopCard
                      key={i}
                      stop={stop}
                      index={i + 1}
                      total={data.stops.length}
                    />
                  ))
                ) : (
                  <div className="driver__not-ready">
                    <h3>No stops assigned</h3>
                    <p>You have no deliveries for {data.deliveryDay}.</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'week' && (
              <WeeklyBar dailyStops={data.dailyStops} weekTotal={data.weekTotal} />
            )}

            {activeTab === 'timeoff' && (
              <TimeOffCalendar driverName={data.driverName} />
            )}
          </>
        )}
      </main>
    </div>
  )
}
