import { useEffect } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import './DispatchV2Shell.css'

const navItems = [
  {
    label: 'Routes',
    path: '/dispatch-v2/routes',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    label: 'Drivers',
    path: '/dispatch-v2/drivers',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    label: 'Sort List',
    path: '/dispatch-v2/sort-list',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
      </svg>
    ),
  },
  {
    label: 'Routing Rules',
    path: '/dispatch-v2/routing-rules',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    label: 'Settings',
    path: '/dispatch-v2/settings',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
]

export default function DispatchV2Shell({ title, children }) {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    try {
      const auth = JSON.parse(localStorage.getItem('cnc-dispatch-v2'))
      if (!auth || auth.role !== 'dispatch-v2') {
        navigate('/dispatch-v2', { replace: true })
      }
    } catch {
      navigate('/dispatch-v2', { replace: true })
    }
  }, [navigate])

  function handleSignOut() {
    localStorage.removeItem('cnc-dispatch-v2')
    navigate('/dispatch-v2', { replace: true })
  }

  return (
    <div className="dv2-layout">
      {/* Sidebar */}
      <aside className="dv2-sidebar">
        <div className="dv2-sidebar-logo">
          <div className="dv2-sidebar-logo-text">
            <span className="dv2-sidebar-logo-cnc">CNC</span>
            <span className="dv2-sidebar-logo-dot" />
          </div>
          <div className="dv2-sidebar-logo-sub">DELIVERY</div>
        </div>

        <nav className="dv2-nav">
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={`dv2-nav-item${location.pathname === item.path ? ' active' : ''}`}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="dv2-sidebar-bottom">
          <button className="dv2-signout" onClick={handleSignOut}>
            Sign Out
          </button>
          <div className="dv2-sidebar-footer">
            v2 Dispatch &middot; Powered by LYN
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="dv2-main">
        <header className="dv2-header">
          <div className="dv2-header-title">{title}</div>
          <div className="dv2-header-user">
            <div className="dv2-header-avatar">D</div>
            Dom
          </div>
        </header>
        <div className="dv2-content">
          {children}
        </div>
      </div>
    </div>
  )
}
