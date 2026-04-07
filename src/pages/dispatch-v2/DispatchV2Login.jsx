import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function DispatchV2Login() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  // Redirect if already logged in
  const existing = localStorage.getItem('cnc-dispatch-v2')
  if (existing) {
    try {
      const parsed = JSON.parse(existing)
      if (parsed && parsed.role === 'dispatch-v2') {
        navigate('/dispatch-v2/routes', { replace: true })
        return null
      }
    } catch (_) { /* ignore */ }
  }

  function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const nameLower = name.trim().toLowerCase()
    if ((nameLower === 'dom' || nameLower === 'dominic') && password === '@Peaceout55') {
      localStorage.setItem('cnc-dispatch-v2', JSON.stringify({ name: 'Dom', role: 'dispatch-v2' }))
      navigate('/dispatch-v2/routes', { replace: true })
    } else {
      setError('Invalid name or password.')
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#1C1C1E',
    }}>
      <form onSubmit={handleSubmit} style={{
        width: '100%',
        maxWidth: 380,
        padding: '0 1.5rem',
        textAlign: 'center',
      }}>
        {/* CNC Branding */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <span style={{ fontSize: 36, fontWeight: 800, color: '#fff', letterSpacing: 2 }}>CNC</span>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', background: '#0A2463',
              display: 'inline-block', marginBottom: -12, marginLeft: 2,
            }} />
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', letterSpacing: 4, marginTop: 2 }}>
            DELIVERY
          </div>
        </div>

        <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 600, marginBottom: 24 }}>
          Dispatch Portal
        </h2>

        <input
          type="text"
          placeholder="Name"
          value={name}
          onChange={e => { setName(e.target.value); setError('') }}
          autoFocus
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '12px 14px', background: '#2A2A2E',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8, color: '#fff', fontSize: 15,
            marginBottom: 12, outline: 'none',
          }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => { setPassword(e.target.value); setError('') }}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '12px 14px', background: '#2A2A2E',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8, color: '#fff', fontSize: 15,
            marginBottom: 16, outline: 'none',
          }}
        />

        {error && (
          <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{error}</p>
        )}

        <button type="submit" style={{
          width: '100%', padding: '12px', background: '#0A2463', color: '#fff',
          border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600,
          cursor: 'pointer',
        }}>
          Sign In
        </button>

        <p style={{
          marginTop: 48, fontSize: 11, color: 'rgba(255,255,255,0.25)',
        }}>
          v2 Dispatch &middot; Powered by LYN
        </p>
      </form>
    </div>
  )
}
