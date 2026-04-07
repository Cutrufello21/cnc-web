import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import './PortalShell.css'

const DashboardIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1.5" y="1.5" width="6" height="6" rx="1" />
    <rect x="10.5" y="1.5" width="6" height="6" rx="1" />
    <rect x="1.5" y="10.5" width="6" height="6" rx="1" />
    <rect x="10.5" y="10.5" width="6" height="6" rx="1" />
  </svg>
)

const TruckIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1.5 3h9v9h-9z" />
    <path d="M10.5 6.75h3l2.5 3v3.25h-5.5v-6.25z" />
    <circle cx="4.5" cy="13.5" r="1.5" />
    <circle cx="13.5" cy="13.5" r="1.5" />
  </svg>
)

const CameraIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 5.5a1 1 0 011-1h2.172a1 1 0 00.707-.293l.914-.914A1 1 0 017.5 3h3a1 1 0 01.707.293l.914.914a1 1 0 00.707.293H15a1 1 0 011 1v8a1 1 0 01-1 1H3a1 1 0 01-1-1v-8z" />
    <circle cx="9" cy="9.5" r="2.5" />
  </svg>
)

const ChartIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="9" width="3" height="6" rx="0.5" />
    <rect x="7.5" y="5" width="3" height="10" rx="0.5" />
    <rect x="13" y="2.5" width="3" height="12.5" rx="0.5" />
  </svg>
)

const navItems = [
  { label: 'Dashboard', path: '/portal/dashboard', Icon: DashboardIcon },
  { label: 'Deliveries', path: '/portal/deliveries', Icon: TruckIcon },
  { label: 'POD Records', path: '/portal/pod-records', Icon: CameraIcon },
  { label: 'Reports', path: '/portal/reports', Icon: ChartIcon },
]

export default function PortalShell({ children, title }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const pharmacyName = profile?.pharmacy_name || profile?.pharmacy || 'Pharmacy'

  return (
    <div className="portal-layout">
      {sidebarOpen && <div className="portal-overlay" onClick={() => setSidebarOpen(false)} />}

      <aside className={`portal-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="portal-sidebar-logo" onClick={() => navigate('/portal/dashboard')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 800, fontSize: '1.3rem', letterSpacing: '0.12em', color: '#fff' }}>CNC</span>
            <span style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.25)', flexShrink: 0 }} />
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
              <span style={{ fontWeight: 700, fontSize: '0.72rem', letterSpacing: '0.18em', color: '#fff' }}>DELIVERY</span>
              <span style={{ fontSize: '0.42rem', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.45)', fontWeight: 500, textTransform: 'uppercase', marginTop: 1 }}>The last mile in patient care</span>
            </div>
          </div>
        </div>

        <nav className="portal-nav">
          {navItems.map(item => (
            <button
              key={item.path}
              className={`portal-nav-item ${location.pathname === item.path ? 'active' : ''}`}
              onClick={() => { navigate(item.path); setSidebarOpen(false) }}
            >
              <span className="portal-nav-icon" style={{ display: 'inline-flex', alignItems: 'center', marginRight: 8 }}><item.Icon /></span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="portal-sidebar-bottom">
          <button className="portal-signout" onClick={signOut}>Sign Out</button>
          <div className="portal-powered">
            Powered by{' '}
            <a href="https://lynsoftware.net" target="_blank" rel="noopener noreferrer">
              LYN Software
            </a>
          </div>
        </div>
      </aside>

      <div className="portal-main">
        <header className="portal-header">
          <button className="portal-hamburger" onClick={() => setSidebarOpen(!sidebarOpen)}>
            <span /><span /><span />
          </button>
          <h1 className="portal-page-title">{title || 'Dashboard'}</h1>
          <div className="portal-user-pill">
            <div className="portal-avatar">
              {pharmacyName.charAt(0).toUpperCase()}
            </div>
            <span className="portal-pharmacy-name">{pharmacyName}</span>
          </div>
        </header>

        <div className="portal-content">
          {children}
        </div>
      </div>
    </div>
  )
}
