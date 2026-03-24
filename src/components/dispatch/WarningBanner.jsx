import './WarningBanner.css'

export default function WarningBanner({ warning, onDismiss }) {
  const isHigh = warning.severity === 'high'

  return (
    <div className={`wbanner ${isHigh ? 'wbanner--high' : 'wbanner--medium'}`}>
      <div className="wbanner__icon">
        {isHigh ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        )}
      </div>
      <div className="wbanner__content">
        <p className="wbanner__message">{warning.message}</p>
        {warning.details?.length > 0 && (
          <div className="wbanner__details">
            {warning.details.map((d, i) => (
              <span key={i} className="wbanner__tag">{d}</span>
            ))}
          </div>
        )}
      </div>
      {onDismiss && (
        <button className="wbanner__dismiss" onClick={onDismiss}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  )
}
