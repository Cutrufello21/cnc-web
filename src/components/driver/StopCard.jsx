import { useState } from 'react'
import './StopCard.css'

export default function StopCard({ stop, index, total }) {
  const [expanded, setExpanded] = useState(false)

  const name = stop['Name'] || stop['Patient'] || stop['Customer'] || '—'
  const address = stop['Address'] || ''
  const city = stop['City'] || ''
  const zip = stop['ZIP'] || ''
  const orderId = stop['Order ID'] || stop['Order_ID'] || ''
  const isColdChain = stop._coldChain
  const pharmacy = stop['Pharmacy'] || ''
  const notes = stop['Notes'] || stop['Special Instructions'] || ''

  const fullAddress = [address, city, zip ? `OH ${zip}` : ''].filter(Boolean).join(', ')

  // Map link
  const mapQuery = encodeURIComponent(fullAddress)
  const mapsUrl = `https://maps.apple.com/?q=${mapQuery}`

  return (
    <div className={`stop ${isColdChain ? 'stop--cold' : ''}`}>
      <div className="stop__main" onClick={() => setExpanded(!expanded)}>
        <div className="stop__number">
          <span>{index}</span>
          <span className="stop__of">/{total}</span>
        </div>

        <div className="stop__info">
          <div className="stop__top-row">
            <h4 className="stop__name">{name}</h4>
            {isColdChain && <span className="stop__badge stop__badge--cold">Cold Chain</span>}
            {pharmacy && <span className="stop__badge stop__badge--pharma">{pharmacy}</span>}
          </div>
          <p className="stop__address">{fullAddress || 'No address'}</p>
          {orderId && <p className="stop__order">Order #{orderId}</p>}
        </div>

        <svg
          className={`stop__chevron ${expanded ? 'stop__chevron--open' : ''}`}
          width="20" height="20" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {expanded && (
        <div className="stop__details">
          {notes && (
            <div className="stop__notes">
              <span className="stop__notes-label">Notes:</span> {notes}
            </div>
          )}
          <div className="stop__actions">
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="stop__btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              Open in Maps
            </a>
            <a href={`tel:`} className="stop__btn stop__btn--secondary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              Call
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
