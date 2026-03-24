import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import './LoginPage.css'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { setUser, setProfile } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      // 1. Sign in via raw fetch — no Supabase client, no locks
      const authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      const authData = await authRes.json()

      if (!authRes.ok) {
        throw new Error(authData.error_description || authData.msg || 'Login failed')
      }

      // 2. Fetch profile via raw fetch
      const profileRes = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${authData.user.id}&select=*`,
        {
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${authData.access_token}`,
          },
        }
      )

      const profiles = await profileRes.json()
      const profile = profiles[0]

      if (!profile) {
        setError('Signed in but no profile found. Contact dispatch.')
        setSubmitting(false)
        return
      }

      // 3. Set session on Supabase client so writes use auth token
      await supabase.auth.setSession({
        access_token: authData.access_token,
        refresh_token: authData.refresh_token,
      })

      // 4. Save to context and localStorage
      setUser(authData.user)
      setProfile(profile)
      localStorage.setItem('cnc-profile', JSON.stringify(profile))
      localStorage.setItem('cnc-token', authData.access_token)

      // 4. Redirect
      if (profile.role === 'dispatcher') {
        navigate('/dispatch', { replace: true })
      } else {
        navigate('/driver', { replace: true })
      }
    } catch (err) {
      setError(
        err.message === 'Invalid login credentials'
          ? 'Invalid email or password.'
          : err.message
      )
      setSubmitting(false)
    }
  }

  return (
    <div className="login">
      <div className="login__card">
        <div className="login__header">
          <div className="login__logo">
            <span className="login__logo-icon">CNC</span>
            <span className="login__logo-text">Delivery</span>
          </div>
          <h1 className="login__title">Sign in</h1>
          <p className="login__sub">Access your dispatch or driver dashboard</p>
        </div>

        <form className="login__form" onSubmit={handleSubmit}>
          {error && <div className="login__error">{error}</div>}

          <div className="login__field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@cncdeliveryservice.com"
              required
              autoComplete="email"
              autoFocus
            />
          </div>

          <div className="login__field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="login__submit"
            disabled={submitting}
          >
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <a href="/" className="login__back">Back to homepage</a>
      </div>
    </div>
  )
}
