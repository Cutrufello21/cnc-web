import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children, role }) {
  const { profile } = useAuth()

  // No profile means not logged in — check localStorage as fallback
  if (!profile) {
    const saved = localStorage.getItem('cnc-profile')
    if (!saved) return <Navigate to="/login" replace />

    // We have a saved profile but context lost it (page refresh)
    // Redirect to login to re-auth
    return <Navigate to="/login" replace />
  }

  if (role && profile.role !== role) {
    if (profile.role === 'dispatcher') return <Navigate to="/dispatch" replace />
    if (profile.role === 'driver') return <Navigate to="/driver" replace />
    return <Navigate to="/login" replace />
  }

  return children
}
