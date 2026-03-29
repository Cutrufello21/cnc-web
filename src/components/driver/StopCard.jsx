import { useState } from 'react'
import './StopCard.css'

export default function StopCard({ stop, index, total, isSelected, onToggleSelect, onExportDrag }) {
  const [expanded, setExpanded] = useState(false)

  const name = stop['Name'] || stop['Patient'] || stop['Customer'] || '—'
  const address = stop['Address'] || ''
  const city = stop['City'] || ''
  const zip = stop['ZIP'] || ''
  const orderId = stop['Order ID'] || stop['Order_ID'] || ''
  const isColdChain = stop._coldChain
  const isSigRequired = stop._sigRequired
  const pharmacy = stop['Pharmacy'] || ''
  const notes = stop['Notes'] || stop['Special Instructions'] || ''
  const packageCount = stop._packageCount || 1
  const consolidatedOrders = stop._consolidatedOrders || []
  const isConsolidated = packageCount > 1
  const allOrderIds = isConsolidated ? consolidatedOrders.map(o => o.orderId) : [orderId]

  const fullAddress = [address, city, zip ? `OH ${zip}` : ''].filter(Boolean).join(', ')
  const mapQuery = encodeURIComponent(fullAddress)
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`

  const delivered = stop.status === 'delivered'
  const failed = stop.status === 'failed'
  const isDone = delivered || failed

  return (
    <div
      className={`stop ${isColdChain ? 'stop--cold' : ''} ${isSigRequired ? 'stop--sig' : ''} ${isSelected ? 'stop--selected' : ''} ${delivered ? 'stop--delivered' : ''} ${failed ? 'stop--failed' : ''}`}
      draggable={isSelected}
      onDragStart={onExportDrag}
    >
      <div className="stop__main" onClick={() => setExpanded(!expanded)}>
        {!isDone ? (
          <input
            type="checkbox"
            className="stop__checkbox"
            checked={isSelected || false}
            onChange={(e) => { e.stopPropagation(); onToggleSelect?.() }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : null}
        <div className={`stop__number ${delivered ? 'stop__number--done' : ''} ${failed ? 'stop__number--failed' : ''}`}>
          {isDone ? (
            failed ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            ) : (
              <svg className="stop__check-anim" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            )
          ) : (
            <>
              <span>{index}</span>
              <span className="stop__of">/{total}</span>
            </>
          )}
        </div>

        <div className="stop__info">
          <div className="stop__top-row">
            <h4 className={`stop__name ${isDone ? 'stop__name--done' : ''}`}>{name}</h4>
            {isConsolidated && <span className="stop__package-count">{packageCount} packages</span>}
            {isColdChain && <span className="stop__badge stop__badge--cold">Cold Chain</span>}
            {isSigRequired && <span className="stop__badge stop__badge--sig">Sig Required</span>}
            {pharmacy && !isDone && <span className="stop__badge stop__badge--pharma">{pharmacy}</span>}
            {delivered && <span className="stop__badge stop__badge--delivered">Delivered</span>}
            {failed && <span className="stop__badge stop__badge--failed">Failed</span>}
          </div>
          <p className={`stop__address ${isDone ? 'stop__address--done' : ''}`}>{fullAddress || 'No address'}</p>
          {!isConsolidated && orderId && <p className="stop__order">Order #{orderId}</p>}
          {isConsolidated && <p className="stop__order">{allOrderIds.map(id => `#${id}`).join(', ')}</p>}
          {failed && stop.failure_reason && <p className="stop__failure-reason">{stop.failure_reason}</p>}
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
          {isConsolidated && (
            <div className="stop__sub-orders">
              <div className="stop__sub-orders-title">{packageCount} orders at this address</div>
              {consolidatedOrders.map((o, i) => (
                <div key={o.orderId || i} className="stop__sub-order">
                  <span className="stop__sub-order-id">#{o.orderId}</span>
                  <span className="stop__sub-order-name">{o.name}</span>
                  {o.coldChain && <span className="stop__badge stop__badge--cold">CC</span>}
                  {o.sigRequired && <span className="stop__badge stop__badge--sig">Sig</span>}
                </div>
              ))}
            </div>
          )}
          {notes && (
            <div className="stop__notes">
              <span className="stop__notes-label">Notes:</span> {notes}
            </div>
          )}
          <div className="stop__actions">
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="stop__btn stop__btn--maps">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              Navigate
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
