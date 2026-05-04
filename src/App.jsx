import { useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { TenantProvider } from './context/TenantContext'
import ProtectedRoute from './components/ProtectedRoute'
import ErrorBoundary from './components/ErrorBoundary'
import LoginPage from './pages/LoginPage'
import DispatchPage from './pages/DispatchPage'
import DriverPage from './pages/DriverPage'
import HomePage from './pages/HomePage'
import PrivacyPage from './pages/PrivacyPage'
import SupportPage from './pages/SupportPage'
import HipaaPage from './pages/HipaaPage'
import MobileDispatch from './pages/MobileDispatch'
import BrandMark from './components/BrandMark'
import PortalLogin from './pages/portal/PortalLogin'
import PortalDashboard from './pages/portal/PortalDashboard'
import PortalDeliveries from './pages/portal/PortalDeliveries'
import PortalPODRecords from './pages/portal/PortalPODRecords'
import PortalReports from './pages/portal/PortalReports'
import PortalOrders from './pages/portal/PortalOrders'
import PortalPatients from './pages/portal/PortalPatients'
import PortalPickups from './pages/portal/PortalPickups'
import DispatchV2Routes from './pages/dispatch-v2/DispatchV2Routes'

function SiteGate({ children }) {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem('site-pass') === '1')
  const [pw, setPw] = useState('')
  const [error, setError] = useState(false)

  if (unlocked) return children

  function handleSubmit(e) {
    e.preventDefault()
    if (pw === '@Peaceout55') {
      sessionStorage.setItem('site-pass', '1')
      setUnlocked(true)
    } else {
      setError(true)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f9fb' }}>
      <form onSubmit={handleSubmit} style={{ textAlign: 'center', maxWidth: 360, width: '100%', padding: '0 1.5rem' }}>
        <div style={{ marginBottom: '2rem' }}><BrandMark variant="dark" /></div>
        <p style={{ fontSize: '0.9rem', opacity: 0.5, marginBottom: '1.5rem' }}>Enter the site password to continue.</p>
        <input
          type="password"
          value={pw}
          onChange={e => { setPw(e.target.value); setError(false) }}
          placeholder="Password"
          autoFocus
          style={{
            width: '100%', padding: '0.75rem 1rem', border: `1px solid ${error ? '#dc2626' : '#e5e7eb'}`,
            borderRadius: 8, fontSize: '0.95rem', marginBottom: '1rem', boxSizing: 'border-box',
          }}
        />
        {error && <p style={{ fontSize: '0.8rem', color: '#dc2626', marginBottom: '0.75rem' }}>Incorrect password.</p>}
        <button type="submit" style={{
          width: '100%', padding: '0.75rem', background: '#0A2463', color: '#fff',
          border: 'none', borderRadius: 8, fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer',
        }}>Enter Site</button>
        <a href="/login" style={{
          display: 'block', marginTop: '1.5rem', fontSize: '0.85rem', opacity: 0.5, color: '#0A2463',
        }}>Driver / Dispatch Login</a>
      </form>
    </div>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <TenantProvider>
          <Routes>
            <Route path="/" element={<SiteGate><HomePage /></SiteGate>} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/support" element={<SupportPage />} />
            <Route path="/hipaa" element={<HipaaPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/portal" element={<PortalLogin />} />
            <Route path="/portal/dashboard" element={<ProtectedRoute role="pharmacy"><PortalDashboard /></ProtectedRoute>} />
            <Route path="/portal/deliveries" element={<ProtectedRoute role="pharmacy"><PortalDeliveries /></ProtectedRoute>} />
            <Route path="/portal/pod-records" element={<ProtectedRoute role="pharmacy"><PortalPODRecords /></ProtectedRoute>} />
            <Route path="/portal/reports" element={<ProtectedRoute role="pharmacy"><PortalReports /></ProtectedRoute>} />
            <Route path="/portal/patients" element={<ProtectedRoute role="pharmacy"><PortalPatients /></ProtectedRoute>} />
            <Route path="/portal/orders" element={<ProtectedRoute role="pharmacy"><PortalOrders /></ProtectedRoute>} />
            <Route path="/portal/pickups" element={<ProtectedRoute role="pharmacy"><PortalPickups /></ProtectedRoute>} />
            <Route
              path="/dispatch"
              element={
                <ProtectedRoute role="dispatcher">
                  <DispatchPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/mobile"
              element={
                <ProtectedRoute role="dispatcher">
                  <MobileDispatch />
                </ProtectedRoute>
              }
            />
            <Route
              path="/driver"
              element={
                <ProtectedRoute role="driver">
                  <DriverPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dispatch-v2"
              element={
                <ProtectedRoute role="dispatcher">
                  <DispatchV2Routes />
                </ProtectedRoute>
              }
            />
          </Routes>
        </TenantProvider>
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App

