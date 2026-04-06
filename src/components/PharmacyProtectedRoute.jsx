import { Navigate } from 'react-router-dom'
import { usePharmacyAuth } from '../context/PharmacyAuthContext'

export default function PharmacyProtectedRoute({ children }) {
  const { user, tenant, loading } = usePharmacyAuth()

  if (loading) {
    return (
      <div className="portal__loading">
        <div className="portal__spinner" />
        <p>Loading...</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/portal" replace />
  }

  if (!tenant) {
    return (
      <div className="portal__no-access">
        <h2>No Pharmacy Access</h2>
        <p>Your account is not associated with a pharmacy. Please contact CNC Delivery to set up your portal access.</p>
        <a href="/portal" className="portal__btn">Back to Login</a>
      </div>
    )
  }

  return children
}
