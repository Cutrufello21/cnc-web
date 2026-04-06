import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const PharmacyAuthContext = createContext(null)

export function PharmacyAuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [tenant, setTenant] = useState(null)
  const [loading, setLoading] = useState(true)

  async function fetchTenant(userId) {
    const { data, error } = await supabase
      .from('tenant_users')
      .select('tenant_id, role, tenants(id, name, display_name, slug)')
      .eq('user_id', userId)
      .limit(1)
      .single()

    if (error || !data) {
      setTenant(null)
      return null
    }

    const t = {
      id: data.tenants.id,
      name: data.tenants.name,
      display_name: data.tenants.display_name,
      slug: data.tenants.slug,
      role: data.role,
    }
    setTenant(t)
    return t
  }

  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user && !cancelled) {
          setUser(session.user)
          await fetchTenant(session.user.id)
        }
      } catch {
        // no session
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT') {
          setUser(null)
          setTenant(null)
        }
      }
    )

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) throw error

    setUser(data.user)
    const t = await fetchTenant(data.user.id)
    return { user: data.user, tenant: t }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    setTenant(null)
  }

  const value = { user, tenant, loading, signIn, signOut }

  return (
    <PharmacyAuthContext.Provider value={value}>
      {children}
    </PharmacyAuthContext.Provider>
  )
}

export function usePharmacyAuth() {
  const ctx = useContext(PharmacyAuthContext)
  if (!ctx) throw new Error('usePharmacyAuth must be used within PharmacyAuthProvider')
  return ctx
}
