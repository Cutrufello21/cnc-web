import { useState, useEffect, useMemo } from 'react'
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

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [rulesRes, driversRes] = await Promise.all([
        fetch('/api/sheet-tab?tab=Routing+Rules&rows=500').then(r => r.json()),
        fetch('/api/sheet-tab?tab=Drivers&rows=20').then(r => r.json()),
      ])
      setRules(rulesRes)

      // Build driver list from the routing rules values
      const driverSet = new Set()
      rulesRes.data?.forEach(row => {
        DAYS.forEach(d => {
          const val = row[d]
          if (val) driverSet.add(val)
        })
      })
      setDrivers(Array.from(driverSet).sort())
    } catch {
      setRules(null)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave(zip, day, newDriver) {
    setSaving(true)
    try {
      const res = await fetch('/api/update-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zip, day, newDriver }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      // Update local state
      setRules(prev => ({
        ...prev,
        data: prev.data.map(row => {
          if ((row['ZIP Code'] || '').trim() === zip.trim()) {
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

  // Filtered + sorted data
  const filtered = useMemo(() => {
    if (!rules?.data) return []
    let rows = rules.data.filter(row => {
      if (search) {
        const q = search.toLowerCase()
        const matchesZip = (row['ZIP Code'] || '').toLowerCase().includes(q)
        const matchesRoute = (row['Route'] || '').toLowerCase().includes(q)
        if (!matchesZip && !matchesRoute) return false
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
        </div>
        <div className="re__toolbar-right">
          <input
            className="re__search"
            type="text"
            placeholder="Search ZIP or route..."
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
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const zip = row['ZIP Code'] || ''
              return (
                <tr key={zip}>
                  <td className="re__cell-zip">{zip}</td>
                  {DAYS.map(day => {
                    const val = row[day] || ''
                    const driverName = val.split('/')[0]
                    const isEditing = editCell?.zip === zip && editCell?.day === day

                    if (isEditing) {
                      return (
                        <td key={day} className="re__cell-editing">
                          <select
                            className="re__cell-select"
                            defaultValue={val}
                            autoFocus
                            onChange={(e) => {
                              if (e.target.value !== val) {
                                handleSave(zip, day, e.target.value)
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
                        onClick={() => setEditCell({ zip, day })}
                        title={`Click to change ${zip} ${day}`}
                      >
                        <span className="re__driver-name">{driverName || '—'}</span>
                      </td>
                    )
                  })}
                  <td className="re__cell-route">{row['Route'] || ''}</td>
                  <td className="re__cell-pharma">{row['Pharmacy'] || ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
