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

  // Map link — works on both iOS and Android
  const mapQuery = encodeURIComponent(fullAddress)
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`

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
            {notes && <span className="stop__note-icon" title={notes}>&#128221;</span>}
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
          </div>
        </div>
      )}
    </div>
  )
}
