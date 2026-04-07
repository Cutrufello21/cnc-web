import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import './PortalShell.css'

const navItems = [
  { label: 'Dashboard', path: '/portal/dashboard', icon: '\u25A3' },
  { label: 'Deliveries', path: '/portal/deliveries', icon: '\u2750' },
  { label: 'POD Records', path: '/portal/pod-records', icon: '\u2611' },
  { label: 'Reports', path: '/portal/reports', icon: '\u2261' },
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
          <span className="portal-logo-text">CNC</span>
          <span className="portal-logo-dot">{'\u25CF'}</span>
        </div>

        <nav className="portal-nav">
          {navItems.map(item => (
            <button
              key={item.path}
              className={`portal-nav-item ${location.pathname === item.path ? 'active' : ''}`}
              onClick={() => { navigate(item.path); setSidebarOpen(false) }}
            >
              <span className="portal-nav-icon">{item.icon}</span>
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
