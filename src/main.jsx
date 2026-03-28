import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

// Restore theme preference
const savedTheme = localStorage.getItem('cnc-theme')
if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme)

// Global error monitoring — catches unhandled errors outside React tree
function logGlobalError(type, message, stack) {
  fetch('/api/error-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type,
      message: String(message).slice(0, 2000),
      stack: stack ? String(stack).slice(0, 5000) : null,
      metadata: {
        url: window.location.href,
        user: localStorage.getItem('cnc-user') || null,
      },
    }),
  }).catch(() => {})
}

window.addEventListener('error', (e) => {
  logGlobalError('window_error', e.message, e.error?.stack)
})

window.addEventListener('unhandledrejection', (e) => {
  logGlobalError('unhandled_rejection', e.reason?.message || String(e.reason), e.reason?.stack)
})

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)

// Fade out preloader
const preloader = document.getElementById('preloader')
if (preloader) {
  setTimeout(() => {
    preloader.style.opacity = '0'
    preloader.style.visibility = 'hidden'
    setTimeout(() => preloader.remove(), 400)
  }, 600)
}
