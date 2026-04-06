import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePharmacyAuth } from '../../context/PharmacyAuthContext'
import BrandMark from '../../components/BrandMark'
import './portal.css'

export default function PharmacyLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { signIn, user, tenant } = usePharmacyAuth()
  const navigate = useNavigate()

  // If already authenticated with tenant, redirect
  if (user && tenant) {
    navigate('/portal/dashboard', { replace: true })
    return null
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const result = await signIn(email.trim(), password)
      if (!result.tenant) {
        setError('Your account is not linked to a pharmacy. Contact CNC Delivery for access.')
        setSubmitting(false)
        return
      }
      navigate('/portal/dashboard')
    } catch (err) {
      setError(
        err.message === 'Invalid login credentials'
          ? 'Invalid email or password.'
          : err.message || 'Login failed. Please try again.'
      )
      setSubmitting(false)
    }
  }

  return (
    <div className="portal__login">
      <div className="portal__login-card">
        <div className="portal__login-header">
          <div className="portal__login-logo">
            <BrandMark variant="dark" />
          </div>
          <h1 className="portal__login-title">Pharmacy Portal</h1>
          <p className="portal__login-sub">Sign in to view your deliveries</p>
        </div>

        <form className="portal__login-form" onSubmit={handleSubmit}>
          {error && <div className="portal__login-error">{error}</div>}

          <div className="portal__login-field">
            <label htmlFor="portal-email">Email</label>
            <input
              id="portal-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="pharmacy@example.com"
              required
              autoComplete="email"
              autoFocus
            />
          </div>

          <div className="portal__login-field">
            <label htmlFor="portal-password">Password</label>
            <input
              id="portal-password"
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
            className="portal__login-submit"
            disabled={submitting}
          >
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <a href="/" className="portal__login-back">Back to homepage</a>
      </div>
    </div>
  )
}
