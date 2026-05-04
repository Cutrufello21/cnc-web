import './BrandMark.css'
import { useTenant } from '../context/TenantContext'

export default function BrandMark({ variant = 'light', size = 'default' }) {
  const { tenant, isLoading, error } = useTenant()

  // Active loading/error with no tenant: render an empty wrapper so we
  // don't flash CNC branding at a non-CNC tenant during the initial fetch.
  if ((isLoading || error) && !tenant?.displayName) {
    return (
      <div
        className={`brand-mark brand-mark--${variant} brand-mark--${size}`}
        aria-busy={isLoading || undefined}
      />
    )
  }

  // No session (unauthenticated marketing visitors, site-gate, login):
  // cncdelivery.com is the CNC tenant's marketing site, so default there.
  const displayName = tenant?.displayName || 'CNC Delivery'

  const parts = displayName.trim().split(/\s+/)
  const monogram = parts[0] || ''
  const descriptor = parts.slice(1).join(' ').toUpperCase()

  return (
    <div className={`brand-mark brand-mark--${variant} brand-mark--${size}`}>
      <span className="brand-mark__cnc">{monogram}</span>
      {descriptor && (
        <>
          <span className="brand-mark__rule" />
          <div className="brand-mark__right">
            <span className="brand-mark__delivery">{descriptor}</span>
            <span className="brand-mark__line" />
            <span className="brand-mark__tagline">The last mile in patient care</span>
          </div>
        </>
      )}
    </div>
  )
}
