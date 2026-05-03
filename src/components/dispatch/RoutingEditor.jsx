import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { dbUpdate, dbUpsert, dbDelete } from '../../lib/db'
import './RoutingEditor.css'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

export default function RoutingEditor() {
  const [rules, setRules] = useState(null)
  const [drivers, setDrivers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterDriver, setFilterDriver] = useState('')
  const [filterPharmacy, setFilterPharmacy] = useState('')
  const [filterDay, setFilterDay] = useState('')
  const [sortCol, setSortCol] = useState(null)
  const [sortDir, setSortDir] = useState('asc')
  const [editCell, setEditCell] = useState(null) // { zip, day }
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newZip, setNewZip] = useState({ zip: '', mon: '', tue: '', wed: '', thu: '', fri: '', route: '', pharmacy: 'SHSP' })
  const [addingZip, setAddingZip] = useState(false)
  const [editRow, setEditRow] = useState(null) // zip code being edited
  const [editData, setEditData] = useState({})
  const [deleting, setDeleting] = useState(null)
  const [editCities, setEditCities] = useState(false)
  const [cityEdits, setCityEdits] = useState({})
  const [editRoutes, setEditRoutes] = useState(false)
  const [routeEdits, setRouteEdits] = useState({})

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [{ data: rulesData }, { data: driversData }] = await Promise.all([
        supabase.from('routing_rules').select('*'),
        supabase.from('drivers').select('driver_name, driver_number').eq('active', true),
      ])

      // Map to expected format
      const mapped = (rulesData || []).map(r => ({
        'ZIP Code': r.zip_code, City: r.city || '', Mon: r.mon, Tue: r.tue, Wed: r.wed,
        Thu: r.thu, Fri: r.fri, Route: r.route, Pharmacy: r.pharmacy,
      }))
      setRules({ headers: ['ZIP Code', 'City', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Route', 'Pharmacy'], data: mapped })

      // Build driver list from drivers table + any in routing rules
      const driverSet = new Set()
      ;(driversData || []).filter(d => d.driver_name !== 'Demo Driver').forEach(d => {
        driverSet.add(d.driver_number ? `${d.driver_name}/${d.driver_number}` : d.driver_name)
      })
      mapped.forEach(row => {
        DAYS.forEach(d => { if (row[d]) driverSet.add(row[d]) })
      })
      setDrivers(Array.from(driverSet).sort())
    } catch {
      setRules(null)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave(zip, pharmacy, day, newDriver) {
    setSaving(true)
    try {
      const col = { Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri' }[day]
      if (!col) throw new Error(`Invalid day: ${day}`)

      await dbUpdate('routing_rules', { [col]: newDriver }, { zip_code: zip.trim(), pharmacy })

      setRules(prev => ({
        ...prev,
        data: prev.data.map(row => {
          if ((row['ZIP Code'] || '').trim() === zip.trim() && row.Pharmacy === pharmacy) {
            return { ...row, [day]: newDriver }
          }
          return row
        })
      }))

      setToast(`${zip} ${day} → ${newDriver.split('/')[0]}`)
      setTimeout(() => setToast(null), 3000)
      setEditCell(null)
    } catch (err) {
      setToast(`Error: ${err.message}`)
      setTimeout(() => setToast(null), 4000)
    } finally {
      setSaving(false)
    }
  }

  async function handleAddZip() {
    if (!newZip.zip) return
    setAddingZip(true)
    try {
      await dbUpsert('routing_rules', {
        zip_code: newZip.zip,
        city: newZip.city || '',
        mon: newZip.mon || '', tue: newZip.tue || '', wed: newZip.wed || '',
        thu: newZip.thu || '', fri: newZip.fri || '',
        route: newZip.route || '', pharmacy: newZip.pharmacy || '',
      }, 'zip_code,pharmacy')

      setToast(`ZIP ${newZip.zip} added`)
      setTimeout(() => setToast(null), 3000)
      setNewZip({ zip: '', mon: '', tue: '', wed: '', thu: '', fri: '', route: '', pharmacy: 'SHSP' })
      setShowAddForm(false)
      loadData()
    } catch (err) {
      setToast(`Error: ${err.message}`)
      setTimeout(() => setToast(null), 4000)
    } finally {
      setAddingZip(false)
    }
  }

  function startEditRow(row) {
    setEditRow(`${row['ZIP Code']}|${row['Pharmacy']}`)
    setEditData({
      city: row['City'] || '',
      mon: row['Mon'] || '', tue: row['Tue'] || '', wed: row['Wed'] || '',
      thu: row['Thu'] || '', fri: row['Fri'] || '',
      route: row['Route'] || '', pharmacy: row['Pharmacy'] || '',
      originalPharmacy: row['Pharmacy'] || '',
    })
  }

  async function saveEditRow() {
    if (!editRow) return
    const editZip = editRow.split('|')[0]
    setSaving(true)
    try {
      await dbUpdate('routing_rules', {
          city: editData.city,
          mon: editData.mon, tue: editData.tue, wed: editData.wed,
          thu: editData.thu, fri: editData.fri,
          route: editData.route, pharmacy: editData.pharmacy,
        }, { zip_code: editZip, pharmacy: editData.originalPharmacy || editData.pharmacy })
      setToast(`ZIP ${editRow} updated`)
      setTimeout(() => setToast(null), 3000)
      setEditRow(null)
      loadData()
    } catch (err) {
      setToast(`Error: ${err.message}`)
      setTimeout(() => setToast(null), 4000)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(zip, pharmacy) {
    if (!confirm(`Delete ZIP ${zip} (${pharmacy}) from routing rules?`)) return
    setDeleting(zip)
    try {
      await dbDelete('routing_rules', { zip_code: zip, pharmacy })
      setToast(`ZIP ${zip} deleted`)
      setTimeout(() => setToast(null), 3000)
      loadData()
    } catch (err) {
      setToast(`Error: ${err.message}`)
      setTimeout(() => setToast(null), 4000)
    } finally {
      setDeleting(null)
    }
  }

  // Filtered + sorted data
  const filtered = useMemo(() => {
    if (!rules?.data) return []
    let rows = rules.data.filter(row => {
      if (search) {
        const q = search.toLowerCase()
        const matchesZip = (row['ZIP Code'] || '').toLowerCase().includes(q)
        const matchesCity = (row['City'] || '').toLowerCase().includes(q)
        const matchesRoute = (row['Route'] || '').toLowerCase().includes(q)
        if (!matchesZip && !matchesCity && !matchesRoute) return false
      }
      if (filterDriver) {
        const hasDriver = DAYS.some(d => (row[d] || '').includes(filterDriver))
        if (!hasDriver) return false
      }
      if (filterPharmacy) {
        if ((row['Pharmacy'] || '') !== filterPharmacy) return false
      }
      return true
    })

    if (sortCol) {
      rows = [...rows].sort((a, b) => {
        const av = a[sortCol] || ''
        const bv = b[sortCol] || ''
        const cmp = av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' })
        return sortDir === 'asc' ? cmp : -cmp
      })
    }

    return rows
  }, [rules, search, filterDriver, filterPharmacy, sortCol, sortDir])

  function handleSort(col) {
    if (sortCol === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  // Get unique pharmacies
  const pharmacies = useMemo(() => {
    if (!rules?.data) return []
    const set = new Set()
    rules.data.forEach(r => { if (r.Pharmacy) set.add(r.Pharmacy) })
    return Array.from(set).sort()
  }, [rules])

  if (loading) return <div className="re__loading"><div className="dispatch__spinner" />Loading routing rules...</div>

  return (
    <div className="re">
      {toast && (
        <div className={`re__toast ${toast.startsWith('Error') ? 're__toast--err' : ''}`}>
          {toast}
        </div>
      )}

      <div className="re__toolbar">
        <div className="re__toolbar-left">
          <h3 className="re__title">Routing Rules</h3>
          <span className="re__count">{filtered.length} ZIPs</span>
          {!editCities ? (
            <button className="re__edit-cities-btn" onClick={() => { setEditCities(true); setCityEdits({}); setEditRoutes(false) }}>Edit Cities</button>
          ) : (
            <button className="re__edit-cities-btn re__edit-cities-btn--save" onClick={async () => {
              const entries = Object.entries(cityEdits)
              if (entries.length === 0) { setEditCities(false); return }
              setSaving(true)
              let saved = 0
              for (const [key, city] of entries) {
                const [zip, pharmacy] = key.split('|')
                try { await dbUpdate('routing_rules', { city }, { zip_code: zip, pharmacy }); saved++ } catch {}
              }
              setRules(prev => ({ ...prev, data: prev.data.map(r => {
                const k = r['ZIP Code'] + '|' + r['Pharmacy']
                return cityEdits[k] !== undefined ? { ...r, City: cityEdits[k] } : r
              })}))
              setToast(`${saved} cities updated`)
              setTimeout(() => setToast(null), 3000)
              setCityEdits({})
              setEditCities(false)
              setSaving(false)
            }}>Save Cities ({Object.keys(cityEdits).length})</button>
          )}
          {!editRoutes ? (
            <button className="re__edit-cities-btn" onClick={() => { setEditRoutes(true); setRouteEdits({}); setEditCities(false) }}>Edit Routes</button>
          ) : (
            <button className="re__edit-cities-btn re__edit-cities-btn--save" onClick={async () => {
              const entries = Object.entries(routeEdits)
              if (entries.length === 0) { setEditRoutes(false); return }
              setSaving(true)
              let saved = 0
              for (const [key, route] of entries) {
                const [zip, pharmacy] = key.split('|')
                try { await dbUpdate('routing_rules', { route }, { zip_code: zip, pharmacy }); saved++ } catch {}
              }
              setRules(prev => ({ ...prev, data: prev.data.map(r => {
                const k = r['ZIP Code'] + '|' + r['Pharmacy']
                return routeEdits[k] !== undefined ? { ...r, Route: routeEdits[k] } : r
              })}))
              setToast(`${saved} routes updated`)
              setTimeout(() => setToast(null), 3000)
              setRouteEdits({})
              setEditRoutes(false)
              setSaving(false)
            }}>Save Routes ({Object.keys(routeEdits).length})</button>
          )}
        </div>
        <div className="re__toolbar-right">
          <input
            className="re__search"
            type="text"
            placeholder="Search ZIP, city, or route..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="re__filter-select"
            value={filterPharmacy}
            onChange={(e) => setFilterPharmacy(e.target.value)}
          >
            <option value="">All pharmacies</option>
            {pharmacies.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select
            className="re__filter-select"
            value={filterDriver}
            onChange={(e) => setFilterDriver(e.target.value)}
          >
            <option value="">All drivers</option>
            {drivers.map(d => (
              <option key={d} value={d}>{d.split('/')[0]}</option>
            ))}
          </select>
        </div>
      </div>

      <p className="re__hint">Click any cell to change the driver assignment. Changes write directly to the Master Sheet.</p>

      <div className="re__table-wrap">
        <table className="re__table">
          <thead>
            <tr>
              <th className="re__th-sortable" onClick={() => handleSort('ZIP Code')}>
                ZIP {sortCol === 'ZIP Code' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th className="re__th-sortable" onClick={() => handleSort('City')}>
                City {sortCol === 'City' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </th>
              {DAYS.map(d => (
                <th key={d} className={filterDay === d ? 're__th--active' : ''} onClick={() => setFilterDay(filterDay === d ? '' : d)}>
                  {d}
                </th>
              ))}
              <th className="re__th-sortable" onClick={() => handleSort('Route')}>
                Route {sortCol === 'Route' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th className="re__th-sortable" onClick={() => handleSort('Pharmacy')}>
                Pharmacy {sortCol === 'Pharmacy' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th style={{ width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const zip = row['ZIP Code'] || ''
              const pharmacy = row.Pharmacy || ''
              const rowKey = `${zip}|${pharmacy}`
              const isEditingRow = editRow === rowKey

              if (isEditingRow) {
                return (
                  <tr key={rowKey} className="re__row--editing">
                    <td className="re__cell-zip">{zip}</td>
                    <td><input className="re__edit-input" value={editData.city} onChange={(e) => setEditData({ ...editData, city: e.target.value })} placeholder="City" style={{ width: 100 }} /></td>
                    {DAYS.map(day => (
                      <td key={day} className="re__cell-editing">
                        <select
                          className="re__cell-select"
                          value={editData[day.toLowerCase()] || ''}
                          onChange={(e) => setEditData({ ...editData, [day.toLowerCase()]: e.target.value })}
                        >
                          <option value="">—</option>
                          {drivers.map(d => (
                            <option key={d} value={d}>{d.split('/')[0]}</option>
                          ))}
                        </select>
                      </td>
                    ))}
                    <td>
                      <input className="re__edit-input" value={editData.route} onChange={(e) => setEditData({ ...editData, route: e.target.value })} placeholder="Route" />
                    </td>
                    <td>
                      <select className="re__cell-select" value={editData.pharmacy} onChange={(e) => setEditData({ ...editData, pharmacy: e.target.value })}>
                        {pharmacies.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </td>
                    <td className="re__cell-actions">
                      <button className="re__action-btn re__action-btn--save" onClick={saveEditRow} disabled={saving} title="Save">&#10003;</button>
                      <button className="re__action-btn re__action-btn--cancel" onClick={() => setEditRow(null)} title="Cancel">&#10005;</button>
                    </td>
                  </tr>
                )
              }

              return (
                <tr key={rowKey}>
                  <td className="re__cell-zip">{zip}</td>
                  <td className="re__cell-city">
                    {editCities ? (
                      <input className="re__city-input" value={cityEdits[`${zip}|${pharmacy}`] !== undefined ? cityEdits[`${zip}|${pharmacy}`] : (row['City'] || '')} onChange={(e) => setCityEdits(prev => ({ ...prev, [`${zip}|${pharmacy}`]: e.target.value }))} />
                    ) : (
                      row['City'] || <span style={{ color: '#d1d5db' }}>—</span>
                    )}
                  </td>
                  {DAYS.map(day => {
                    const val = row[day] || ''
                    const driverName = val.split('/')[0]
                    const isEditing = editCell?.zip === zip && editCell?.pharmacy === pharmacy && editCell?.day === day

                    if (isEditing) {
                      return (
                        <td key={day} className="re__cell-editing">
                          <select
                            className="re__cell-select"
                            defaultValue={val}
                            autoFocus
                            onChange={(e) => {
                              if (e.target.value !== val) {
                                handleSave(zip, pharmacy, day, e.target.value)
                              } else {
                                setEditCell(null)
                              }
                            }}
                            onBlur={() => !saving && setEditCell(null)}
                          >
                            {drivers.map(d => (
                              <option key={d} value={d}>{d.split('/')[0]}</option>
                            ))}
                          </select>
                        </td>
                      )
                    }

                    return (
                      <td
                        key={day}
                        className={`re__cell-driver ${filterDay && filterDay !== day ? 're__cell--dim' : ''}`}
                        onClick={() => setEditCell({ zip, pharmacy, day })}
                        title={`Click to change ${zip} ${day}`}
                      >
                        <span className="re__driver-name">{driverName || '—'}</span>
                      </td>
                    )
                  })}
                  <td className="re__cell-route">
                    {editRoutes ? (
                      <input className="re__city-input" value={routeEdits[`${zip}|${pharmacy}`] !== undefined ? routeEdits[`${zip}|${pharmacy}`] : (row['Route'] || '')} onChange={(e) => setRouteEdits(prev => ({ ...prev, [`${zip}|${pharmacy}`]: e.target.value }))} />
                    ) : (
                      row['Route'] || ''
                    )}
                  </td>
                  <td className="re__cell-pharma">{row['Pharmacy'] || ''}</td>
                  <td className="re__cell-actions">
                    <button className="re__action-btn re__action-btn--edit" onClick={() => startEditRow(row)} title="Edit row">&#9998;</button>
                    <button className="re__action-btn re__action-btn--delete" onClick={() => handleDelete(zip, pharmacy)} disabled={deleting === zip} title="Delete ZIP">&times;</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Add ZIP button / form */}
      {!showAddForm ? (
        <button className="re__add-btn" onClick={() => setShowAddForm(true)}>
          + Add ZIP Code
        </button>
      ) : (
        <div className="re__add-form">
          <h4 className="re__add-title">Add New ZIP Code</h4>
          <div className="re__add-row">
            <div className="re__add-field">
              <label>ZIP Code</label>
              <input
                type="text"
                value={newZip.zip}
                onChange={(e) => setNewZip({ ...newZip, zip: e.target.value })}
                placeholder="44XXX"
                autoFocus
              />
            </div>
            <div className="re__add-field">
              <label>City</label>
              <input
                type="text"
                value={newZip.city || ''}
                onChange={(e) => setNewZip({ ...newZip, city: e.target.value })}
                placeholder="e.g. Wadsworth"
              />
            </div>
            <div className="re__add-field">
              <label>Route</label>
              <input
                type="text"
                value={newZip.route}
                onChange={(e) => setNewZip({ ...newZip, route: e.target.value })}
                placeholder="e.g. West, Canton"
              />
            </div>
            <div className="re__add-field">
              <label>Pharmacy</label>
              <select
                value={newZip.pharmacy}
                onChange={(e) => setNewZip({ ...newZip, pharmacy: e.target.value })}
              >
                {pharmacies.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="re__add-row">
            {DAYS.map(day => (
              <div className="re__add-field" key={day}>
                <label>{day}</label>
                <select
                  value={newZip[day.toLowerCase()]}
                  onChange={(e) => setNewZip({ ...newZip, [day.toLowerCase()]: e.target.value })}
                >
                  <option value="">—</option>
                  {drivers.map(d => (
                    <option key={d} value={d}>{d.split('/')[0]}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="re__add-actions">
            <button
              className="re__add-submit"
              onClick={handleAddZip}
              disabled={!newZip.zip || addingZip}
            >
              {addingZip ? 'Adding...' : 'Add to Routing Rules'}
            </button>
            <button className="re__add-cancel" onClick={() => setShowAddForm(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
