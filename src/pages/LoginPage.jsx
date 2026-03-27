import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import BrandMark from '../components/BrandMark'
import './LoginPage.css'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export default function LoginPage() {
  const [username, setUsername] = useState('')
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
      // Look up email from username (driver name) or use as-is if it contains @
      let email = username.trim()
      if (!email.includes('@')) {
        const lower = email.toLowerCase()
        if (lower.startsWith('cc.')) {
          // cc.name → cc.name@cncdeliveryservice.com
          email = `${lower}@cncdeliveryservice.com`
        } else {
          // Look up driver by name → get their email from drivers table
          const { data: drivers } = await supabase.from('drivers')
            .select('email, driver_name')
            .ilike('driver_name', lower)
            .limit(1)
          if (drivers?.length > 0 && drivers[0].email) {
            email = drivers[0].email
          } else {
            throw new Error('Username not found. Try your first name or email.')
          }
        }
      }

      // 1. Sign in via raw fetch
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

      // 3. Save to context and localStorage — then redirect immediately
      setUser(authData.user)
      setProfile(profile)
      localStorage.setItem('cnc-user', JSON.stringify(authData.user))
      localStorage.setItem('cnc-profile', JSON.stringify(profile))
      localStorage.setItem('cnc-token', authData.access_token)

      // 4. Redirect using window.location for guaranteed navigation
      if (profile.role === 'dispatcher') {
        window.location.href = '/dispatch'
      } else {
        window.location.href = '/driver'
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
            <BrandMark variant="dark" />
          </div>
          <h1 className="login__title">Sign in</h1>
          <p className="login__sub">Access your dispatch or driver dashboard</p>
        </div>

        <form className="login__form" onSubmit={handleSubmit}>
          {error && <div className="login__error">{error}</div>}

          <div className="login__field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="cc.bobby"
              required
              autoComplete="username"
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
