import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import ErrorBoundary from './components/ErrorBoundary'
import LoginPage from './pages/LoginPage'
import DispatchPage from './pages/DispatchPage'
import DriverPage from './pages/DriverPage'
import HomePage from './pages/HomePage'

function PreviewGate() {
  const [params] = useSearchParams()
  return params.get('key') === 'cnc2026' ? <HomePage /> : <Navigate to="/login" replace />
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/preview" element={<PreviewGate />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/dispatch"
            element={
              <ProtectedRoute role="dispatcher">
                <DispatchPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/driver"
            element={
              <ProtectedRoute role="driver">
                <DriverPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App

