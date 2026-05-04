import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

// Platform-neutral fallback rendered whenever the real tenant can't be
// loaded (logged-in but fetch failed, schema not deployed, network blip).
// Deliberately NOT CNC's branding — defaulting to navy/periwinkle would
// flash CNC visuals at LYN Rx tenants during a fetch failure.
export const PLATFORM_DEFAULT = {
  id: 0,
  slug: 'platform',
  displayName: 'LYN Rx Platform',
  legalName: null,
  brand: {
    primaryColor: '#0F172A',
    accentColor: '#64748B',
    logoUrl: null,
    logoDarkUrl: null,
    fontFamily: 'Inter',
  },
  features: {
    tesla: false,
    cxt: false,
    dualPharmacyChain: false,
    roadWarrior: false,
    aiDispatch: false,
    aiInsights: false,
    communicationsHub: false,
    shiftOffers: false,
    pickupRequests: false,
    analyticsInsights: false,
    scheduleAudit: false,
    whiteLabelBranding: false,
  },
  tier: 'starter',
  status: 'active',
  trialEndsAt: null,
  timezone: 'America/New_York',
  defaultLocale: 'en-US',
  pharmacyOrigins: [],
  adminEmails: [],
}

const STALE_AFTER_MS = 60 * 60 * 1000 // 1 hour — tab-regain refresh threshold

export const TenantContext = createContext(null)

export function TenantProvider({ children }) {
  const { user } = useAuth()
  const [tenant, setTenant] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  // Refs (not state) — these don't drive renders, so refs avoid extra re-renders.
  const fetchedAtRef = useRef(0)
  const lastUserIdRef = useRef(null)

  const fetchTenant = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token

      const res = await fetch('/api/tenant', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })

      if (!res.ok) {
        let code = `http_${res.status}`
        try {
          const body = await res.json()
          if (body?.error) code = body.error
        } catch { /* non-JSON body — keep generic code */ }
        const err = new Error(code)
        err.code = code
        err.status = res.status
        throw err
      }

      const body = await res.json()
      setTenant(body)
      setError(null)
      fetchedAtRef.current = Date.now()
    } catch (err) {
      console.error('[useTenant] fetch failed:', err?.message || err)
      // If we had a working tenant before the refresh failed, keep it.
      // Only fall back to PLATFORM_DEFAULT if we never had a real tenant.
      setTenant(prev => (prev && prev.id !== 0) ? prev : PLATFORM_DEFAULT)
      setError(err)
      fetchedAtRef.current = Date.now()
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Trigger 1: user change. Fetch on first sign-in or user swap. Clear on sign-out.
  useEffect(() => {
    if (!user?.id) {
      setTenant(null)
      setError(null)
      setIsLoading(false)
      fetchedAtRef.current = 0
      lastUserIdRef.current = null
      return
    }
    if (lastUserIdRef.current !== user.id) {
      lastUserIdRef.current = user.id
      setTenant(null)        // clear any prior tenant before the first fetch resolves
      fetchTenant()
    }
  }, [user?.id, fetchTenant])

  // Trigger 2: tab regains focus AND cache is older than 1 hour.
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState !== 'visible') return
      if (!lastUserIdRef.current) return
      const age = Date.now() - fetchedAtRef.current
      if (age >= STALE_AFTER_MS) fetchTenant()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [fetchTenant])

  // Trigger 3: explicit refreshTenant() call from a consumer (exposed below).

  const value = {
    tenant,
    isLoading,
    error,
    refreshTenant: fetchTenant,
  }

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
}

export function useTenant() {
  const ctx = useContext(TenantContext)
  if (!ctx) throw new Error('useTenant must be used within TenantProvider')
  return ctx
}
