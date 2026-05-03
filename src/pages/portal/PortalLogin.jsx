import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

export default function PortalLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { setUser, setProfile } = useAuth()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Clear any existing dispatch session
    localStorage.removeItem('cnc-user')
    localStorage.removeItem('cnc-profile')
    localStorage.removeItem('cnc-token')

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (authError) {
        setError('Invalid email or password.')
        setLoading(false)
        return
      }

      // Try profiles table first
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authData.user.id)
        .single()

      // Build pharmacy profile from either profiles table or user metadata
      const meta = authData.user.user_metadata || {}
      const appMeta = authData.user.app_metadata || {}
      const pharmacyName = profile?.pharmacy_name || profile?.pharmacy
        || meta.pharmacy_name || meta.pharmacy || meta.pharmacyName
        || appMeta.pharmacy_name || appMeta.pharmacy || null

      // Debug: log what we found (remove after testing)
      console.log('Profile:', profile)
      console.log('User metadata:', meta)
      console.log('App metadata:', appMeta)
      console.log('Resolved pharmacy:', pharmacyName)

      const isDispatcher = profile?.role === 'dispatcher'
      if (profile?.role === 'pharmacy' || isDispatcher || pharmacyName) {
        // Valid user — build the profile object
        const portalProfile = {
          id: authData.user.id,
          role: isDispatcher ? 'dispatcher' : 'pharmacy',
          pharmacy_name: isDispatcher ? 'all' : pharmacyName,
          display_name: profile?.display_name || profile?.full_name || meta.display_name || pharmacyName || 'CNC Admin',
          ...(profile || {}),
          role: isDispatcher ? 'dispatcher' : 'pharmacy',
          pharmacy_name: isDispatcher ? 'all' : pharmacyName,
        }

        localStorage.setItem('cnc-user', JSON.stringify(authData.user))
        localStorage.setItem('cnc-profile', JSON.stringify(portalProfile))
        localStorage.setItem('cnc-token', authData.session.access_token)
        setUser(authData.user)
        setProfile(portalProfile)
        navigate('/portal/dashboard')
      } else {
        setError('Access denied. This portal is for pharmacy clients only.')
        await supabase.auth.signOut()
        setLoading(false)
        return
      }
    } catch {
      setError('Something went wrong. Please try again.')
    }

    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--p-bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      <div style={{ width: '100%', maxWidth: 380, padding: '0 1.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--p-text)', letterSpacing: '-0.03em' }}>
            CNC<span style={{ color: '#0A2463', fontSize: '0.5em', verticalAlign: 'super' }}>{'\u25CF'}</span>
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--p-text-faint)', marginTop: '0.25rem' }}>
            Pharmacy Client Portal
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--p-text-faint)', marginBottom: 6, fontWeight: 500 }}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoFocus
            style={{
              width: '100%',
              padding: '0.7rem 0.85rem',
              background: 'var(--p-card)',
              border: '1px solid var(--p-border)',
              borderRadius: 8,
              color: 'var(--p-text)',
              fontSize: '0.9rem',
              marginBottom: '1rem',
              boxSizing: 'border-box',
              outline: 'none',
              fontFamily: 'inherit',
            }}
            placeholder="you@pharmacy.com"
          />

          <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--p-text-faint)', marginBottom: 6, fontWeight: 500 }}>
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '0.7rem 0.85rem',
              background: 'var(--p-card)',
              border: '1px solid var(--p-border)',
              borderRadius: 8,
              color: 'var(--p-text)',
              fontSize: '0.9rem',
              marginBottom: '1.25rem',
              boxSizing: 'border-box',
              outline: 'none',
              fontFamily: 'inherit',
            }}
            placeholder="Enter password"
          />

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 8,
              padding: '0.6rem 0.85rem',
              color: '#EF4444',
              fontSize: '0.8rem',
              marginBottom: '1rem',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.7rem',
              background: '#0A2463',
              color: 'var(--p-text)',
              border: 'none',
              borderRadius: 8,
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              fontFamily: 'inherit',
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div style={{
          textAlign: 'center',
          marginTop: '3rem',
          fontSize: '0.7rem',
          color: 'var(--p-text-ghost)',
        }}>
          Powered by{' '}
          <a
            href="https://lynsoftware.net"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--p-text-faint)', textDecoration: 'none' }}
          >
            LYN Software
          </a>
        </div>
      </div>
    </div>
  )
}
