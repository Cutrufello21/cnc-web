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

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authData.user.id)
        .single()

      if (profileError || !profile) {
        setError('Account not found. Contact support.')
        setLoading(false)
        return
      }

      if (profile.role !== 'pharmacy') {
        setError('Access denied. This portal is for pharmacy clients only.')
        await supabase.auth.signOut()
        setLoading(false)
        return
      }

      localStorage.setItem('cnc-user', JSON.stringify(authData.user))
      localStorage.setItem('cnc-profile', JSON.stringify(profile))
      localStorage.setItem('cnc-token', authData.session.access_token)
      setUser(authData.user)
      setProfile(profile)
      navigate('/portal/dashboard')
    } catch {
      setError('Something went wrong. Please try again.')
    }

    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#1C1C1E',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      <div style={{ width: '100%', maxWidth: 380, padding: '0 1.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em' }}>
            CNC<span style={{ color: '#0A2463', fontSize: '0.5em', verticalAlign: 'super' }}>{'\u25CF'}</span>
          </div>
          <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)', marginTop: '0.25rem' }}>
            Pharmacy Client Portal
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <label style={{ display: 'block', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginBottom: 6, fontWeight: 500 }}>
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
              background: '#2A2A2E',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8,
              color: '#fff',
              fontSize: '0.9rem',
              marginBottom: '1rem',
              boxSizing: 'border-box',
              outline: 'none',
              fontFamily: 'inherit',
            }}
            placeholder="you@pharmacy.com"
          />

          <label style={{ display: 'block', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginBottom: 6, fontWeight: 500 }}>
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
              background: '#2A2A2E',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8,
              color: '#fff',
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
              color: '#fff',
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
          color: 'rgba(255,255,255,0.2)',
        }}>
          Powered by{' '}
          <a
            href="https://lynsoftware.net"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'rgba(255,255,255,0.35)', textDecoration: 'none' }}
          >
            LYN Software
          </a>
        </div>
      </div>
    </div>
  )
}
