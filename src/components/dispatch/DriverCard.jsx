import { useState, useMemo, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { dbUpdate } from '../../lib/db'
import { DRIVER_EMAILS_ENABLED } from '../../lib/flags'
import { useTenant } from '../../context/TenantContext'
import { fetchPatientNotes, normalizePatientKey } from '../../lib/patientNotes'
import PatientNoteModal from '../PatientNoteModal'
import './DriverCard.css'

const PHARMACY_COLORS = {
  SHSP: { bg: '#eef4ff', text: '#3b82f6', label: 'SHSP' },
  Aultman: { bg: '#dcfce7', text: '#16a34a', label: 'Aultman' },
  Both: { bg: '#f0fdf4', text: '#16a34a', label: 'BOTH' },
  ADMIN: { bg: '#0A2463', text: '#ffffff', label: 'ADMIN' },
  PM: { bg: '#FEE2E2', text: '#EF4444', label: 'PM' },
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

export default function DriverCard({ driver, inactive = false, allDrivers = [], selectedDay, deliveryDate, onRefresh, onMoveComplete, swapSelected, onSwapToggle, batchSelected, onSelectByZip, onSelectByCity }) {
  const { tenant } = useTenant()
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
  const dateStr = deliveryDate
    ? `${deliveryDate.getFullYear()}-${String(deliveryDate.getMonth()+1).padStart(2,'0')}-${String(deliveryDate.getDate()).padStart(2,'0')}`
    : (selectedDay || '')
  const reviewKey = 'reviewed-' + (driver['Driver Name'] || '') + '-' + dateStr
  // One-time cleanup: remove legacy day-of-week keys (e.g. "reviewed-Adam-Wed") that
  // caused stale checkmarks to carry across weeks. Safe to remove this block after a few weeks.
  useEffect(() => {
    try {
      const dows = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
      for (const d of dows) localStorage.removeItem('reviewed-' + (driver['Driver Name'] || '') + '-' + d)
    } catch(e) {}
  }, [])
  const [reviewed, setReviewedRaw] = useState(() => {
    try { return localStorage.getItem(reviewKey) === '1' } catch(e) { return false }
  })
  function setReviewed(v) {
    setReviewedRaw(v)
    try { if (v) localStorage.setItem(reviewKey, '1'); else localStorage.removeItem(reviewKey) } catch(e) {}
  }
  const [optimizing, setOptimizing] = useState(false)
  const [optimized, setOptimized] = useState(false)
  const [patientNotes, setPatientNotes] = useState(new Map())
  const [noteTarget, setNoteTarget] = useState(null) // { patientName, initialNote, lastEditedBy, lastEditedAt }

  const name = driver['Driver Name'] || '—'
  const id = driver['Driver #'] || driver['Driver Number'] || driver['Driver ID'] || ''
  const stops = driver.stops || 0
  const totalPackages = driver.totalPackages || stops
  const coldChain = driver.coldChain || 0
  const rawDetails = driver.stopDetails || []

  // Compute pharmacy badge from actual orders
  const pharma = useMemo(() => {
    if (driver.is_admin) return PHARMACY_COLORS.ADMIN
    const shift = driver.shift || 'AM'
    const orderPharmas = new Set()
    for (const s of rawDetails) {
      const p = s.Pharmacy || s.pharmacy || ''
      if (p) orderPharmas.add(p)
    }
    if (orderPharmas.has('SHSP') && orderPharmas.has('Aultman')) return PHARMACY_COLORS.Both
    if (orderPharmas.has('Aultman')) return PHARMACY_COLORS.Aultman
    if (orderPharmas.has('SHSP')) return PHARMACY_COLORS.SHSP
    // PM-only driver with no orders
    if (shift === 'PM' && orderPharmas.size === 0) return PHARMACY_COLORS.PM
    // Fallback to driver's static pharmacy field
    const fallback = driver['Pharmacy'] || driver.pharmacy || ''
    return PHARMACY_COLORS[fallback] || PHARMACY_COLORS.SHSP
  }, [driver, rawDetails])
  const tabName = driver.tabName || ''

  const otherDrivers = allDrivers.filter((d) =>
    d['Driver Name'] !== name && d.tabName
  )

  // Bulk-load patient notes whenever this card's stops change (and only when expanded).
  useEffect(() => {
    if (!expanded || rawDetails.length === 0) return
    let cancelled = false
    const names = rawDetails.map(s => s.Name || s.name).filter(Boolean)
    fetchPatientNotes(names).then(map => {
      if (!cancelled) setPatientNotes(map)
    })
    return () => { cancelled = true }
  }, [expanded, rawDetails])

  // Enrich details with display fields
  const enriched = useMemo(() => rawDetails.map(stop => {
    const cc = stop['Cold Chain'] || ''
    const hasColdChain = cc && cc.toLowerCase() !== 'no' && cc.toLowerCase() !== 'n' && cc.trim() !== ''
    return {
      ...stop,
      _hasColdChain: hasColdChain,
      _hasSigRequired: (stop.Notes || stop.notes || '').toLowerCase().includes('signature'),
      _ccEdited: stop._ccEdited || false,
      _isOutlier: !!stop._isOutlier,
      _outlierReason: stop._outlierReason || '',
      _driverNote: stop._driverNote || '',
      _flagsDisplay: [hasColdChain ? '❄️' : '', (stop.Notes || stop.notes || '').toLowerCase().includes('signature') ? '✍️' : '', stop._ccEdited ? '✏️' : ''].filter(Boolean).join(' '),
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
      // Expand consolidated order IDs — a single selected row may contain multiple orders
      const orderIds = Array.from(selected).flatMap(oid => {
        const stop = details.find(s => s['Order ID'] === oid)
        return stop?._consolidatedOrderIds || [oid]
      })

      // Update daily_stops via API (service role, bypasses RLS)
      // Format delivery date for the API
      const dd = deliveryDate
        ? `${deliveryDate.getFullYear()}-${String(deliveryDate.getMonth()+1).padStart(2,'0')}-${String(deliveryDate.getDate()).padStart(2,'0')}`
        : undefined

      const res = await fetch('/api/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'transfer',
          orderIds,
          toDriverName,
          toDriverNumber,
          fromDriverName: name,
          source: 'dispatch',
          deliveryDate: dd,
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

  async function handleOptimizeRoute(e) {
    e.stopPropagation()
    if (optimizing || enriched.length < 2) return
    setOptimizing(true)
    const tenantId = tenant?.id
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      const res = await fetch('/api/optimize-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          stops: enriched.map(s => ({
            address: s.Address || s.address || '',
            city: s.City || s.city || '',
            zip: s['Zip Code'] || s.ZIP || s.zip || '',
            coldChain: !!s._hasColdChain,
            sigRequired: !!s._hasSigRequired,
          })),
          pharmacy: pharmacy || 'SHSP',
        }),
      })
      const data = await res.json()
      if (data.optimizedOrder) {
        // Update sort_order in daily_stops for this driver
        const reordered = data.optimizedOrder.map(i => enriched[i]).filter(Boolean)
        for (let i = 0; i < reordered.length; i++) {
          const oid = reordered[i]['Order ID']
          if (oid) {
            // daily_stops has no tenant_id column yet — see useDispatchActions for context.
            await supabase.from('daily_stops').update({ sort_order: i }).eq('order_id', oid)
          }
        }
        setOptimized(true)
        setMoveResult(`Route optimized via ${data.method || 'OSRM'} — ${data.totalDistance || 0} mi`)
        if (onRefresh) setTimeout(onRefresh, 500)
      }
    } catch (err) {
      setMoveResult(`Optimize error: ${err.message}`)
    } finally {
      setOptimizing(false)
    }
  }

  async function handleClearOrder(e) {
    e.stopPropagation()
    if (!confirm(`Reset stop order for ${name}? This will clear all sort positions.`)) return
    const tenantId = tenant?.id
    try {
      for (const s of enriched) {
        const oid = s['Order ID']
        if (oid) await supabase.from('daily_stops').update({ sort_order: null }).eq('order_id', oid)
      }
      setOptimized(false)
      setMoveResult('Sort order cleared')
      if (onRefresh) setTimeout(onRefresh, 500)
    } catch (err) {
      setMoveResult(`Error: ${err.message}`)
    }
  }

  async function handleReopen(stop) {
    const oid = stop['Order ID']
    if (!confirm(`Reopen order ${oid} as active (undo delivery)?`)) return
    try {
      await dbUpdate('daily_stops', { status: 'dispatched', delivered_at: null }, { order_id: oid })
      setMoveResult(`Order ${oid} reopened`)
      if (onRefresh) setTimeout(onRefresh, 500)
    } catch (err) {
      setMoveResult(`Error: ${err.message}`)
    }
  }

  // Inline-edit a single field on a stop's daily_stops row.
  async function handleFieldEdit(stop, field, value) {
    const stopId = stop._stopId
    if (!stopId) {
      setMoveResult('Error: missing stop id')
      return
    }
    const patch = { [field]: value }
    // Side-effects for status transitions so the pharmacy portal shows
    // a sensible time (or clears it) immediately.
    if (field === 'status') {
      if (value === 'delivered' && !stop.delivered_at) patch.delivered_at = new Date().toISOString()
      if (value === 'dispatched') patch.delivered_at = null
    }
    try {
      await dbUpdate('daily_stops', patch, { id: stopId })
      setMoveResult(`Updated ${field} → ${value}`)
      if (onRefresh) setTimeout(onRefresh, 300)
    } catch (err) {
      setMoveResult(`Error: ${err.message}`)
    }
  }

  const PHARMACY_OPTIONS = ['SHSP', 'Aultman', 'Both']
  const STATUS_OPTIONS = [
    { value: 'dispatched', label: 'Active' },
    { value: 'delivered',  label: 'Delivered' },
    { value: 'failed',     label: 'Failed' },
    { value: 'attempted',  label: 'Attempted' },
  ]

  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxw2xx2atYfnEfGzCaTmkDShmt96D1JsLFSckScOndB94RV2IGev63fpS7Ndc0GqSHWWQ/exec'
  const RW_DRIVERS = ['Alex', 'Josh', 'Laura', 'Mark', 'Mike', 'Nick', 'Dom', 'Nicholas']

  async function handleSendOne(e) {
    e.stopPropagation()
    if (!confirm(`Send route to ${name}?`)) return
    setSending(true)
    try {
      const cc = coldChain
      const ccLine = cc > 0 ? ` — ${cc} are cold chain.` : '.'
      if (DRIVER_EMAILS_ENABLED && driver.Email) {
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
      }

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

      // Push notification to this driver
      fetch('/api/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'push_notify', driverNames: [name], title: 'Route Ready', body: `You have ${stops} stops assigned. Open the app to view your route.` })
      }).catch(() => {})

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
            checked={swapSelected?.has(name) || reviewed}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => { e.stopPropagation(); if (onSwapToggle) onSwapToggle(name); else setReviewed(e.target.checked) }}
            title={swapSelected?.size > 0 ? 'Select for swap' : 'Mark as reviewed'}
            style={swapSelected?.has(name) ? { accentColor: '#7c3aed' } : {}}
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
          <span className="dcard__stat-label">Stops{totalPackages > stops ? ` (${totalPackages} pkg)` : ''}</span>
        </div>
        {coldChain > 0 && (
          <div className={`dcard__stat dcard__stat--cold${coldChain > 26 ? ' dcard__stat--alert' : ''}`}>
            <span className="dcard__stat-value">{coldChain}{coldChain > 26 ? ' \u{1F6A9}' : ''}</span>
            <span className="dcard__stat-label">Cold Chain{coldChain > 26 ? ' — Over Limit!' : ''}</span>
          </div>
        )}
      </div>

      {noteTarget && (
        <PatientNoteModal
          patientName={noteTarget.patientName}
          initialNote={noteTarget.initialNote}
          lastEditedBy={noteTarget.lastEditedBy}
          lastEditedAt={noteTarget.lastEditedAt}
          onClose={() => setNoteTarget(null)}
          onSaved={(row) => {
            const key = normalizePatientKey(noteTarget.patientName)
            setPatientNotes(prev => {
              const next = new Map(prev)
              if (row) next.set(key, row)
              else next.delete(key)
              return next
            })
          }}
        />
      )}

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
                <th>Status</th>
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
                <td></td>
              </tr>
            </thead>
            <tbody>
              {details.map((stop, i) => {
                const orderId = stop['Order ID'] || ''
                const isSelected = selected.has(orderId)
                return (
                  <tr
                    key={i}
                    className={`${stop._hasColdChain ? 'dcard__row--cold' : ''} ${isSelected || batchSelected?.has(orderId) ? 'dcard__row--selected' : ''} ${stop._status === 'delivered' ? 'dcard__row--delivered' : ''} ${stop._status === 'failed' ? 'dcard__row--failed' : ''}`}
                  >
                    <td className="dcard__cell-check">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(orderId)}
                      />
                    </td>
                    <td className="dcard__cell-num">{i + 1}</td>
                    <td className="dcard__cell-order">
                      {stop._packageCount > 1 ? (
                        <span title={stop._consolidatedOrderIds?.join(', ')}>
                          {stop._consolidatedOrderIds?.join(', ')}
                          <span className="dcard__pkg-badge">{stop._packageCount} pkg</span>
                        </span>
                      ) : (orderId || '—')}
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {stop._packageCount > 1 ? (
                          <span title={stop._consolidatedNames?.join(', ')}>
                            {stop['Name'] || '—'}
                            {stop._consolidatedNames?.length > 1 && <span className="dcard__multi-name"> +{stop._consolidatedNames.length - 1}</span>}
                          </span>
                        ) : (stop['Name'] || '—')}
                        {(() => {
                          const pname = stop['Name'] || ''
                          if (!pname) return null
                          const noteRow = patientNotes.get(normalizePatientKey(pname))
                          const hasNote = !!noteRow?.note
                          return (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setNoteTarget({
                                  patientName: pname,
                                  initialNote: noteRow?.note || '',
                                  lastEditedBy: noteRow?.updated_by || '',
                                  lastEditedAt: noteRow?.updated_at || '',
                                })
                              }}
                              title={hasNote ? `Note: ${noteRow.note}` : 'Add patient note'}
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                padding: 0, fontSize: 14, lineHeight: 1,
                                opacity: hasNote ? 1 : 0.35,
                              }}
                            >
                              {hasNote ? '📝' : '✎'}
                            </button>
                          )
                        })()}
                      </span>
                    </td>
                    <td className="dcard__cell-addr">{stop['Address'] || '—'}</td>
                    <td style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); onSelectByCity?.(stop['City']) }} title={`Select all ${stop['City']} stops`}>{stop['City'] || '—'}</td>
                    <td className="dcard__cell-zip" style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); onSelectByZip?.(stop['Zip Code'] || stop['ZIP']) }} title={`Select all ${stop['Zip Code'] || stop['ZIP']} stops`}>{stop['Zip Code'] || stop['ZIP'] || '—'}</td>
                    <td className="dcard__cell-notes">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
                        {stop._flagsDisplay && <span>{stop._flagsDisplay}</span>}
                        {stop._isOutlier && (
                          <span
                            title={stop._outlierReason || 'Outlier'}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              background: '#fef3c7', color: '#92400e',
                              fontSize: 11, fontWeight: 600,
                              padding: '2px 6px', borderRadius: 4,
                              maxWidth: 220,
                            }}
                          >
                            🚩
                            {stop._outlierReason && (
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {stop._outlierReason}
                              </span>
                            )}
                          </span>
                        )}
                        {stop._driverNote && (
                          <span
                            title={stop._driverNote}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              background: '#eef2ff', color: '#4338ca',
                              fontSize: 11, fontWeight: 500,
                              padding: '2px 6px', borderRadius: 4,
                              maxWidth: 220,
                            }}
                          >
                            📝
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {stop._driverNote}
                            </span>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="dcard__cell-pharma">
                      <select
                        value={PHARMACY_OPTIONS.includes(stop['Pharmacy']) ? stop['Pharmacy'] : ''}
                        onChange={(e) => handleFieldEdit(stop, 'pharmacy', e.target.value)}
                        title="Change pharmacy"
                        style={{
                          background: 'transparent', border: '1px solid transparent',
                          padding: '2px 4px', borderRadius: 4, font: 'inherit',
                          color: 'inherit', cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(0,0,0,0.15)'}
                        onMouseLeave={(e) => e.currentTarget.style.borderColor = 'transparent'}
                      >
                        {!PHARMACY_OPTIONS.includes(stop['Pharmacy']) && (
                          <option value="">{stop['Pharmacy'] || '—'}</option>
                        )}
                        {PHARMACY_OPTIONS.map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </td>
                    <td className="dcard__cell-status">
                      <select
                        value={stop._status || 'dispatched'}
                        onChange={(e) => handleFieldEdit(stop, 'status', e.target.value)}
                        title="Change status"
                        style={{
                          background: 'transparent', border: '1px solid transparent',
                          padding: '2px 4px', borderRadius: 4, font: 'inherit',
                          color: stop._status === 'delivered' ? '#16a34a'
                               : stop._status === 'failed' || stop._status === 'attempted' ? '#dc2626'
                               : 'inherit',
                          fontWeight: stop._status && stop._status !== 'dispatched' ? 600 : 400,
                          cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(0,0,0,0.15)'}
                        onMouseLeave={(e) => e.currentTarget.style.borderColor = 'transparent'}
                      >
                        {STATUS_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
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
    </div>
  )
}
