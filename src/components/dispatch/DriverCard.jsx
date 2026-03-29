import { useState, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import './DriverCard.css'

function fmtTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

const PHARMACY_COLORS = {
  SHSP: { bg: '#eef4ff', text: '#3b82f6', label: 'SHSP' },
  Aultman: { bg: '#dcfce7', text: '#16a34a', label: 'Aultman' },
  Both: { bg: '#f0fdf4', text: '#16a34a', label: 'Both' },
}

const COLUMNS = [
  { key: 'Order ID', label: 'Order ID' },
  { key: 'Name', label: 'Name' },
  { key: 'Address', label: 'Address' },
  { key: 'City', label: 'City' },
  { key: 'Zip Code', label: 'ZIP', fallback: 'ZIP' },
  { key: '_flagsDisplay', label: 'Notes' },
  { key: 'Pharmacy', label: 'Pharmacy' },
]

export default function DriverCard({ driver, inactive = false, allDrivers = [], selectedDay, onRefresh, onMoveComplete }) {
  const [expanded, setExpanded] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [reassignTo, setReassignTo] = useState('')
  const [moving, setMoving] = useState(false)
  const [moveResult, setMoveResult] = useState(null)
  const [sortCol, setSortCol] = useState(null)
  const [sortDir, setSortDir] = useState('asc')
  const [filters, setFilters] = useState({})
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [reviewed, setReviewed] = useState(false)
  const [viewingPhotos, setViewingPhotos] = useState(null) // { urls: [], orderId: '' }

  const name = driver['Driver Name'] || '—'
  const id = driver['Driver #'] || driver['Driver Number'] || driver['Driver ID'] || ''
  const pharmacy = driver['Pharmacy'] || driver.pharmacy || ''
  const pharma = PHARMACY_COLORS[pharmacy] || PHARMACY_COLORS.SHSP
  const stops = driver.stops || 0
  const coldChain = driver.coldChain || 0
  const rawDetails = driver.stopDetails || []
  const tabName = driver.tabName || ''

  const otherDrivers = allDrivers.filter((d) =>
    d['Driver Name'] !== name && d.tabName
  )

  // Enrich details with display fields
  const enriched = useMemo(() => rawDetails.map(stop => {
    const cc = stop['Cold Chain'] || ''
    const hasColdChain = cc && cc.toLowerCase() !== 'no' && cc.toLowerCase() !== 'n' && cc.trim() !== ''
    return {
      ...stop,
      _hasColdChain: hasColdChain,
      _hasSigRequired: (stop.Notes || stop.notes || '').toLowerCase().includes('signature'),
      _flagsDisplay: [hasColdChain ? '❄️' : '', (stop.Notes || stop.notes || '').toLowerCase().includes('signature') ? '✍️' : ''].filter(Boolean).join(' '),
    }
  }), [rawDetails])

  // Filter + sort
  const details = useMemo(() => {
    let rows = enriched

    // Apply column filters
    for (const [col, val] of Object.entries(filters)) {
      if (val) {
        const q = val.toLowerCase()
        rows = rows.filter(row => {
          const cellVal = row[col] || row[COLUMNS.find(c => c.key === col)?.fallback] || ''
          return cellVal.toString().toLowerCase().includes(q)
        })
      }
    }

    // Sort
    if (sortCol) {
      rows = [...rows].sort((a, b) => {
        const av = a[sortCol] || a[COLUMNS.find(c => c.key === sortCol)?.fallback] || ''
        const bv = b[sortCol] || b[COLUMNS.find(c => c.key === sortCol)?.fallback] || ''
        const an = parseFloat(av.toString().replace(/[,$%]/g, ''))
        const bn = parseFloat(bv.toString().replace(/[,$%]/g, ''))
        if (!isNaN(an) && !isNaN(bn)) {
          return sortDir === 'asc' ? an - bn : bn - an
        }
        const cmp = av.toString().localeCompare(bv.toString(), undefined, { numeric: true, sensitivity: 'base' })
        return sortDir === 'asc' ? cmp : -cmp
      })
    }

    return rows
  }, [enriched, filters, sortCol, sortDir])

  function handleSort(col) {
    if (sortCol === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  function handleFilter(col, value) {
    setFilters(prev => {
      const next = { ...prev }
      if (value) next[col] = value
      else delete next[col]
      return next
    })
  }

  // Get unique values for dropdowns (columns with few unique values)
  function getUniqueValues(col) {
    const vals = new Set()
    enriched.forEach(row => {
      const v = (row[col] || row[COLUMNS.find(c => c.key === col)?.fallback] || '').toString().trim()
      if (v) vals.add(v)
    })
    return Array.from(vals).sort()
  }

  function toggleSelect(orderId) {
    const next = new Set(selected)
    if (next.has(orderId)) next.delete(orderId)
    else next.add(orderId)
    setSelected(next)
  }

  function selectAll() {
    if (selected.size === details.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(details.map((s) => s['Order ID']).filter(Boolean)))
    }
  }

  async function handleReassign() {
    if (!reassignTo || selected.size === 0) return
    setMoving(true)
    setMoveResult(null)
    try {
      const toDriverName = reassignTo.split(' - ')[0].trim()
      const toDriverNumber = reassignTo.split(' - ')[1]?.trim() || ''
      const orderIds = Array.from(selected)

      // Update daily_stops via API (service role, bypasses RLS)
      const res = await fetch('/api/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'transfer',
          orderIds,
          toDriverName,
          toDriverNumber,
          fromDriverName: name,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Move failed')

      setMoveResult(`Moved ${result.moved || orderIds.length} stop${orderIds.length > 1 ? 's' : ''} to ${toDriverName}`)
      setSelected(new Set())
      setReassignTo('')
      if (onMoveComplete) onMoveComplete({ orderIds, fromName: name, fromNumber: driver['Driver #'] || '', toName: toDriverName, count: result.moved || orderIds.length })

      // Log decision for learning engine
      for (const oid of orderIds) {
        const stop = details.find(s => s['Order ID'] === oid)
        fetch('/api/dispatch-log-decision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'log_move',
            deliveryDate: stop?.delivery_date || '',
            deliveryDay: selectedDay || '',
            orderId: oid,
            zip: stop?.['Zip Code'] || stop?.ZIP || '',
            city: stop?.City || '',
            pharmacy: stop?.Pharmacy || '',
            fromDriver: name,
            toDriver: toDriverName,
          }),
        }).catch(() => {}) // fire and forget
      }
      if (onRefresh) setTimeout(onRefresh, 500)
    } catch (err) {
      setMoveResult(`Error: ${err.message}`)
    } finally {
      setMoving(false)
    }
  }

  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxw2xx2atYfnEfGzCaTmkDShmt96D1JsLFSckScOndB94RV2IGev63fpS7Ndc0GqSHWWQ/exec'
  const RW_DRIVERS = ['Alex', 'Josh', 'Laura', 'Mark', 'Mike', 'Nick', 'Dom', 'Nicholas']

  async function handleSendOne(e) {
    e.stopPropagation()
    if (!driver.Email) { setMoveResult('No email on file'); return }
    if (!confirm(`Send route to ${name}?`)) return
    setSending(true)
    try {
      const cc = coldChain
      const ccLine = cc > 0 ? ` — ${cc} are cold chain.` : '.'
      await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({
          action: 'email',
          to: driver.Email,
          subject: `CNC Delivery — ${name} — ${selectedDay}`,
          html: `<div style="font-family:-apple-system,sans-serif;max-width:500px">
            <h2 style="color:#0A2463">CNC Delivery</h2>
            <p>Hi ${name},</p>
            <p>You have <strong>${stops} stops</strong> for ${selectedDay}${ccLine}</p>
            <p><a href="https://cncdelivery.com/driver" style="display:inline-block;padding:12px 24px;background:#0A2463;color:white;text-decoration:none;border-radius:8px;font-weight:600">View Your Route</a></p>
            <p style="color:#6b7280;font-size:13px">CNC Delivery</p>
          </div>`,
        }),
      })

      // Push to Road Warrior if applicable
      if (RW_DRIVERS.includes(name) && rawDetails.length > 0) {
        await fetch('/api/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'roadwarrior',
            drivers: [{
              name,
              routeName: `${name} - ${selectedDay}`,
              stops: rawDetails.map(s => ({
                order_id: s['Order ID'] || '', address: s.Address || '',
                city: s.City || '', zip: s.ZIP || '',
                cold_chain: s._coldChain || false, pharmacy: s.Pharmacy || '',
              })),
            }],
          }),
        })
      }

      setSent(true)
      setMoveResult(`Sent to ${name}${RW_DRIVERS.includes(name) ? ' + Road Warrior' : ''}`)
      setTimeout(() => { setSent(false); setMoveResult(null) }, 5000)
    } catch (err) {
      setMoveResult(`Error: ${err.message}`)
    } finally {
      setSending(false)
    }
  }

  const activeFilters = Object.keys(filters).length

  return (
    <div className={`dcard ${inactive ? 'dcard--inactive' : ''} ${expanded ? 'dcard--expanded' : ''} ${reviewed ? 'dcard--reviewed' : ''}`}>
      <div className="dcard__header" onClick={() => stops > 0 && setExpanded(!expanded)}>
        <div className="dcard__name-row">
          <input
            type="checkbox"
            className="dcard__review-check"
            checked={reviewed}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => { e.stopPropagation(); setReviewed(e.target.checked) }}
            title="Mark as reviewed"
          />
          <h3 className={`dcard__name ${reviewed ? 'dcard__name--reviewed' : ''}`}>{name}</h3>
          <span className="dcard__id">#{id}</span>
        </div>
        <div className="dcard__header-right">
          <span
            className="dcard__pharmacy"
            style={{ background: pharma.bg, color: pharma.text }}
          >
            {pharma.label}
          </span>
          {stops > 0 && (
            <svg
              className={`dcard__chevron ${expanded ? 'dcard__chevron--open' : ''}`}
              width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          )}
        </div>
      </div>

      <div className="dcard__stats">
        <div className="dcard__stat">
          <span className="dcard__stat-value">{stops}</span>
          <span className="dcard__stat-label">Stops</span>
        </div>
        {stops > 0 && (() => {
          const deliveredCount = rawDetails.filter(s => s.status === 'delivered').length
          if (deliveredCount === 0) return null
          const pct = Math.round((deliveredCount / stops) * 100)
          const allDone = deliveredCount === stops
          return (
            <div className={`dcard__stat ${allDone ? 'dcard__stat--done' : ''}`}>
              <span className="dcard__stat-value dcard__stat-value--progress">
                {deliveredCount}/{stops}
              </span>
              <div className="dcard__progress-bar">
                <div className="dcard__progress-fill" style={{ width: `${pct}%` }} />
              </div>
              <span className="dcard__stat-label">{allDone ? 'Complete' : 'Delivered'}</span>
            </div>
          )
        })()}
        {coldChain > 0 && (
          <div className={`dcard__stat dcard__stat--cold${coldChain > 26 ? ' dcard__stat--alert' : ''}`}>
            <span className="dcard__stat-value">{coldChain}{coldChain > 26 ? ' \u{1F6A9}' : ''}</span>
            <span className="dcard__stat-label">Cold Chain{coldChain > 26 ? ' — Over Limit!' : ''}</span>
          </div>
        )}
        {stops > 0 && (
          <button
            className={`dcard__send ${sent ? 'dcard__send--done' : ''}`}
            onClick={handleSendOne}
            disabled={sending || sent}
          >
            {sent ? 'Sent' : sending ? '...' : 'Send'}
          </button>
        )}
      </div>

      {expanded && enriched.length > 0 && (
        <div className="dcard__stops">
          {/* Reassign toolbar */}
          {selected.size > 0 && (
            <div className="dcard__reassign">
              <span className="dcard__reassign-count">{selected.size} selected</span>
              <select
                className="dcard__reassign-select"
                value={reassignTo}
                onChange={(e) => setReassignTo(e.target.value)}
              >
                <option value="">Move to...</option>
                {otherDrivers.map((d) => (
                  <option key={d.tabName} value={d.tabName}>
                    {d['Driver Name']} ({d.stops} stops)
                  </option>
                ))}
              </select>
              <button
                className="dcard__reassign-btn"
                onClick={handleReassign}
                disabled={!reassignTo || moving}
              >
                {moving ? 'Moving...' : 'Move'}
              </button>
            </div>
          )}

          {moveResult && (
            <div className={`dcard__move-result ${moveResult.startsWith('Error') ? 'dcard__move-result--err' : ''}`}>
              {moveResult}
            </div>
          )}

          {/* Filter status */}
          {activeFilters > 0 && (
            <div className="dcard__filter-bar">
              <span>{details.length} of {enriched.length} stops shown</span>
              <button className="dcard__filter-clear" onClick={() => setFilters({})}>
                Clear filters
              </button>
            </div>
          )}

          <table className="dcard__table">
            <thead>
              {/* Sortable headers */}
              <tr>
                <th className="dcard__th-check">
                  <input
                    type="checkbox"
                    checked={selected.size === details.length && details.length > 0}
                    onChange={selectAll}
                  />
                </th>
                <th>#</th>
                {COLUMNS.map(col => (
                  <th
                    key={col.key}
                    className="dcard__th-sort"
                    onClick={() => handleSort(col.key)}
                  >
                    {col.label}
                    {sortCol === col.key && (
                      <span className="dcard__sort-arrow">{sortDir === 'asc' ? ' ↑' : ' ↓'}</span>
                    )}
                  </th>
                ))}
                <th className="dcard__th-status">Status</th>
                <th className="dcard__th-status">Time</th>
                <th className="dcard__th-status">Proof</th>
              </tr>
              {/* Filter row */}
              <tr className="dcard__filter-row">
                <td></td>
                <td></td>
                {COLUMNS.map(col => {
                  const uniques = getUniqueValues(col.key)
                  const useDropdown = col.key === 'City' || col.key === 'Pharmacy' || col.key === '_flagsDisplay'
                  return (
                    <td key={col.key} className="dcard__filter-cell">
                      {useDropdown && uniques.length <= 30 ? (
                        <select
                          className="dcard__filter-sel"
                          value={filters[col.key] || ''}
                          onChange={(e) => handleFilter(col.key, e.target.value)}
                        >
                          <option value="">All</option>
                          {uniques.map(v => (
                            <option key={v} value={v}>{v}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="dcard__filter-inp"
                          type="text"
                          placeholder="Filter..."
                          value={filters[col.key] || ''}
                          onChange={(e) => handleFilter(col.key, e.target.value)}
                        />
                      )}
                    </td>
                  )
                })}
                <td></td><td></td><td></td>
              </tr>
            </thead>
            <tbody>
              {details.map((stop, i) => {
                const orderId = stop['Order ID'] || ''
                const isSelected = selected.has(orderId)
                return (
                  <tr
                    key={i}
                    className={`${stop._hasColdChain ? 'dcard__row--cold' : ''} ${isSelected ? 'dcard__row--selected' : ''}`}
                  >
                    <td className="dcard__cell-check">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(orderId)}
                      />
                    </td>
                    <td className="dcard__cell-num">{i + 1}</td>
                    <td className="dcard__cell-order">{orderId || '—'}</td>
                    <td>{stop['Name'] || '—'}</td>
                    <td className="dcard__cell-addr">{stop['Address'] || '—'}</td>
                    <td>{stop['City'] || '—'}</td>
                    <td className="dcard__cell-zip">{stop['Zip Code'] || stop['ZIP'] || '—'}</td>
                    <td className="dcard__cell-notes">{stop._flagsDisplay}</td>
                    <td className="dcard__cell-pharma">{stop['Pharmacy'] || '—'}</td>
                    <td className="dcard__cell-status">
                      <span className={`dcard__status-dot ${stop.status === 'delivered' ? 'dcard__status-dot--done' : ''}`} />
                    </td>
                    <td className="dcard__cell-time">{stop.status === 'delivered' ? fmtTime(stop.delivered_at) : ''}</td>
                    <td className="dcard__cell-photos">
                      {(() => {
                        const urls = stop.photo_urls || (stop.photo_url ? [stop.photo_url] : [])
                        if (urls.length === 0) return null
                        return (
                          <button
                            className="dcard__photo-btn"
                            onClick={(e) => { e.stopPropagation(); setViewingPhotos({ urls, orderId: stop['Order ID'] || '' }) }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                              <circle cx="12" cy="13" r="4"/>
                            </svg>
                            {urls.length}
                          </button>
                        )
                      })()}
                    </td>
                  </tr>
                )
              })}
              {details.length === 0 && enriched.length > 0 && (
                <tr>
                  <td colSpan={9 + COLUMNS.length} className="dcard__no-match">
                    No stops match filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {/* Photo lightbox */}
      {viewingPhotos && (
        <div className="dcard__lightbox" onClick={() => setViewingPhotos(null)}>
          <div className="dcard__lightbox-content" onClick={(e) => e.stopPropagation()}>
            <div className="dcard__lightbox-header">
              <span>Order #{viewingPhotos.orderId} — {viewingPhotos.urls.length} photo{viewingPhotos.urls.length !== 1 ? 's' : ''}</span>
              <button className="dcard__lightbox-close" onClick={() => setViewingPhotos(null)}>&times;</button>
            </div>
            <div className="dcard__lightbox-gallery">
              {viewingPhotos.urls.map((url, i) => (
                <img key={i} src={url} alt={`Delivery photo ${i + 1}`} className="dcard__lightbox-img" />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
