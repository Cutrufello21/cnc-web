import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export default function ProtectedRoute({ children, role }) {
  const { profile, setUser, setProfile } = useAuth()
  const [checking, setChecking] = useState(!profile)
  const [restored, setRestored] = useState(false)

  useEffect(() => {
    if (profile || restored) { setChecking(false); return }

    // Try to restore session from localStorage (once)
    const savedProfile = localStorage.getItem('cnc-profile')
    const savedToken = localStorage.getItem('cnc-token')

    if (savedProfile && savedToken) {
      const p = JSON.parse(savedProfile)
      setProfile(p)

      supabase.auth.getSession().then(({ data }) => {
        if (data.session) setUser(data.session.user)
      })
    }
    setRestored(true)
    setChecking(false)
  }, [profile, restored])

  if (checking) return null

  const activeProfile = profile || (() => {
    const saved = localStorage.getItem('cnc-profile')
    return saved ? JSON.parse(saved) : null
  })()

  if (!activeProfile) return <Navigate to="/login" replace />

  if (role && activeProfile.role !== role) {
    if (activeProfile.role === 'dispatcher') return <Navigate to="/dispatch" replace />
    if (activeProfile.role === 'driver') return <Navigate to="/driver" replace />
    return <Navigate to="/login" replace />
  }

  return children
}
