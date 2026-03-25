import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export default function ProtectedRoute({ children, role }) {
  const { profile, setUser, setProfile } = useAuth()
  const [checking, setChecking] = useState(!profile)

  useEffect(() => {
    if (profile) return

    // Try to restore session from localStorage
    const savedProfile = localStorage.getItem('cnc-profile')
    const savedToken = localStorage.getItem('cnc-token')

    if (savedProfile && savedToken) {
      const p = JSON.parse(savedProfile)
      setProfile(p)

      // Restore Supabase auth session
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          setUser(data.session.user)
        }
      })
    }
    setChecking(false)
  }, [])

  if (checking) return null // Brief flash while restoring

  if (!profile) {
    const saved = localStorage.getItem('cnc-profile')
    if (!saved) return <Navigate to="/login" replace />

    // Restored from localStorage above — render children
    const p = JSON.parse(saved)
    if (role && p.role !== role) {
      if (p.role === 'dispatcher') return <Navigate to="/dispatch" replace />
      if (p.role === 'driver') return <Navigate to="/driver" replace />
      return <Navigate to="/login" replace />
    }
    return children
  }

  if (role && profile.role !== role) {
    if (profile.role === 'dispatcher') return <Navigate to="/dispatch" replace />
    if (profile.role === 'driver') return <Navigate to="/driver" replace />
    return <Navigate to="/login" replace />
  }

  return children
}
