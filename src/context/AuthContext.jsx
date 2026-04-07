import { createContext, useContext, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

function getInitialProfile() {
  try {
    const saved = localStorage.getItem('cnc-profile')
    return saved ? JSON.parse(saved) : null
  } catch { return null }
}

function getInitialUser() {
  try {
    const saved = localStorage.getItem('cnc-user')
    return saved ? JSON.parse(saved) : null
  } catch { return null }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(getInitialUser)
  const [profile, setProfile] = useState(getInitialProfile)
  const [loading] = useState(false)

  async function signOut() {
    const isPharm = profile?.role === 'pharmacy'
    try { await supabase.auth.signOut() } catch {}
    localStorage.removeItem('cnc-user')
    localStorage.removeItem('cnc-profile')
    localStorage.removeItem('cnc-token')
    setUser(null)
    setProfile(null)
    window.location.href = isPharm ? '/portal' : '/login'
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
    isPharmacy: profile?.role === 'pharmacy',
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
