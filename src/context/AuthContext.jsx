import { createContext, useContext, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

function getInitialProfile() {
  try {
    const saved = localStorage.getItem('cnc-profile')
    return saved ? JSON.parse(saved) : null
  } catch { return null }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(getInitialProfile)
  const [loading] = useState(false)

  async function signOut() {
    try { await supabase.auth.signOut() } catch {}
    setUser(null)
    setProfile(null)
    window.location.href = '/login'
  }

  const value = {
    user,
    profile,
    loading,
    setUser,
    setProfile,
    signOut,
    isDispatcher: profile?.role === 'dispatcher',
    isDriver: profile?.role === 'driver',
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
