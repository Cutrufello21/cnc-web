import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
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
      // Look up driver from Supabase
      const { data: driverRow, error: driverErr } = await supabase.from('drivers')
        .select('*').eq('email', user.email.toLowerCase()).single()
      if (driverErr || !driverRow) throw new Error('Driver not found')

      const driverName = driverRow.driver_name
      const driverId = driverRow.driver_number
      const tabName = `${driverName} - ${driverId}`

      const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      const todayName = DAYS[new Date().getDay()]
      const isWeekend = todayName === 'Sunday' || todayName === 'Saturday'

      // Get payroll data from Supabase
      const { data: payrollData } = await supabase.from('payroll')
        .select('*').eq('driver_name', driverName)
        .order('week_of', { ascending: false }).limit(1)

      const payroll = payrollData?.[0]
      let weekTotal = 0
      let dailyStops = {}
      if (payroll) {
        dailyStops = { Mon: payroll.mon || 0, Tue: payroll.tue || 0, Wed: payroll.wed || 0, Thu: payroll.thu || 0, Fri: payroll.fri || 0 }
        weekTotal = payroll.week_total || 0
      }

      if (isWeekend) {
        setData({
          approved: false, noDeliveryToday: true,
          deliveryDay: todayName, driverName, driverId,
          stops: [], stopCount: 0, coldChainCount: 0, weekTotal, dailyStops,
        })
        return
      }

      // Get the most recent stops for this driver — query by driver name,
      // order by delivery_date descending, take the latest batch
      const { data: latestStops } = await supabase.from('daily_stops')
        .select('delivery_date')
        .eq('driver_name', driverName)
        .order('delivery_date', { ascending: false })
        .limit(1)

      const deliveryDate = latestStops?.[0]?.delivery_date || new Date().toISOString().split('T')[0]
      const DAYNAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
      const deliveryDayName = DAYNAMES[new Date(deliveryDate + 'T12:00:00').getDay()]

      // Get daily stops and approval status from Supabase
      const [stopsRes, logsRes] = await Promise.all([
        supabase.from('daily_stops').select('*')
          .eq('delivery_date', deliveryDate).eq('driver_name', driverName),
        supabase.from('dispatch_logs').select('*')
          .eq('delivery_day', deliveryDayName).in('status', ['Complete', 'Success'])
          .order('date', { ascending: false }).limit(1),
      ])

      const stops = (stopsRes.data || []).map((s, idx) => ({
        _index: idx,
        'Order ID': s.order_id, Name: s.patient_name,
        Address: s.address, City: s.city, ZIP: s.zip,
        Pharmacy: s.pharmacy, 'Cold Chain': s.cold_chain ? 'Yes' : '',
        _coldChain: s.cold_chain,
        Notes: s.notes || '',
      }))
      // Approved if dispatch log exists OR if stops are already in Supabase
      const approved = (logsRes.data && logsRes.data.length > 0) || stops.length > 0

      setData({
        approved, deliveryDay: deliveryDayName, driverName, driverId, tabName,
        stops, stopCount: stops.length,
        coldChainCount: stops.filter(s => s._coldChain).length,
        weekTotal, dailyStops,
      })
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
                Schedule
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
                  <>
                    {data.stops.map((stop, i) => (
                      <StopCard
                        key={i}
                        stop={stop}
                        index={i + 1}
                        total={data.stops.length}
                      />
                    ))}
                    <CopyRouteButton stops={data.stops} />
                  </>
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

function CopyRouteButton({ stops }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    const text = stops
      .map(s => `${s.Address || ''}, ${s.City || ''}, ${s.ZIP || ''}`)
      .filter(line => line.replace(/,/g, '').trim())
      .join('\n')
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      className="driver__copy-route"
      onClick={handleCopy}
      style={{
        display: 'block', margin: '16px auto', padding: '6px 16px',
        fontSize: 12, color: '#6b7280', background: 'transparent',
        border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer',
      }}
    >
      {copied ? 'Copied!' : 'Copy Route'}
    </button>
  )
}
