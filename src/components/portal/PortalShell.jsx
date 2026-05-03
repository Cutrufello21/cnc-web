import { useState, useEffect } from 'react'
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

const PatientIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="5.5" r="3" />
    <path d="M2.5 16c0-3.5 2.9-5.5 6.5-5.5s6.5 2 6.5 5.5" />
  </svg>
)

const UploadIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12v2a2 2 0 002 2h8a2 2 0 002-2v-2" />
    <polyline points="5 6 9 2 13 6" />
    <line x1="9" y1="2" x2="9" y2="12" />
  </svg>
)

const PickupIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9h12" />
    <polyline points="7 5 3 9 7 13" />
    <path d="M9 4v10" />
  </svg>
)

const navSections = [
  {
    label: 'Operations',
    items: [
      { label: 'Dashboard', path: '/portal/dashboard', Icon: DashboardIcon },
      { label: 'Deliveries', path: '/portal/deliveries', Icon: TruckIcon },
    ],
  },
  {
    label: 'Records',
    items: [
      { label: 'Patients', path: '/portal/patients', Icon: PatientIcon },
      { label: 'POD Records', path: '/portal/pod-records', Icon: CameraIcon },
      { label: 'Reports', path: '/portal/reports', Icon: ChartIcon },
    ],
  },
  {
    label: 'Admin',
    items: [
      { label: 'Pickups', path: '/portal/pickups', Icon: PickupIcon },
      { label: 'Upload Orders', path: '/portal/orders', Icon: UploadIcon, adminOnly: true },
    ],
  },
]

export default function PortalShell({ children, title }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [lightMode, setLightMode] = useState(() => localStorage.getItem('portal_theme') === 'light')

  useEffect(() => {
    document.documentElement.setAttribute('data-portal-theme', lightMode ? 'light' : 'dark')
    localStorage.setItem('portal_theme', lightMode ? 'light' : 'dark')
  }, [lightMode])

  const pharmacyName = profile?.pharmacy_name || profile?.pharmacy || 'Pharmacy'
  const isAdmin = pharmacyName === 'all' || profile?.role === 'dispatcher'
  const sections = navSections
    .map(s => ({ ...s, items: s.items.filter(i => !i.adminOnly || isAdmin) }))
    .filter(s => s.items.length > 0)

  return (
    <div className="portal-layout">
      {sidebarOpen && <div className="portal-overlay" onClick={() => setSidebarOpen(false)} />}

      <aside className={`portal-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="portal-sidebar-logo" onClick={() => navigate('/portal/dashboard')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 800, fontSize: '1.3rem', letterSpacing: '0.12em', color: 'var(--p-text)' }}>CNC</span>
            <span style={{ width: 1, height: 22, background: 'var(--p-text-ghost)', flexShrink: 0 }} />
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
              <span style={{ fontWeight: 700, fontSize: '0.72rem', letterSpacing: '0.18em', color: 'var(--p-text)' }}>DELIVERY</span>
              <span style={{ fontSize: '0.42rem', letterSpacing: '0.08em', color: 'var(--p-text-faint)', fontWeight: 500, textTransform: 'uppercase', marginTop: 1 }}>The last mile in patient care</span>
            </div>
          </div>
        </div>

        <nav className="portal-nav">
          {sections.map(section => (
            <div key={section.label}>
              <div className="portal-nav-section-label">{section.label}</div>
              {section.items.map(item => (
                <button
                  key={item.path}
                  className={`portal-nav-item ${location.pathname === item.path ? 'active' : ''}`}
                  onClick={() => { navigate(item.path); setSidebarOpen(false) }}
                >
                  <span className="portal-nav-icon" style={{ display: 'inline-flex', alignItems: 'center', marginRight: 8 }}><item.Icon /></span>
                  {item.label}
                </button>
              ))}
            </div>
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
          <button className="portal-theme-toggle" onClick={() => setLightMode(!lightMode)} title={lightMode ? 'Switch to dark mode' : 'Switch to light mode'}>
            {lightMode ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            )}
          </button>
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
