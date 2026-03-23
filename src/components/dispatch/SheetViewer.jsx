import { useState, useEffect, useMemo } from 'react'
import './SheetViewer.css'

const QUICK_TABS = [
  'Routing Rules',
  'Drivers',
  'Weekly Stops',
  'Orders',
  'Log',
  'Unassigned History',
  'SHSP Log',
  'Aultman Log',
  'Patient Analytics',
  'ZIP Analytics',
  'Location Intelligence',
]

export default function SheetViewer() {
  const [allTabs, setAllTabs] = useState(null)
  const [activeTab, setActiveTab] = useState('Routing Rules')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState(null)
  const [sortDir, setSortDir] = useState('asc') // 'asc' or 'desc'
  const [columnFilters, setColumnFilters] = useState({}) // { headerName: filterValue }

  useEffect(() => {
    fetch('/api/master-tabs')
      .then((r) => r.json())
      .then((d) => setAllTabs(d.tabs))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (activeTab) loadTab(activeTab)
  }, [activeTab])

  async function loadTab(tab) {
    setLoading(true)
    setSearch('')
    setSortCol(null)
    setSortDir('asc')
    setColumnFilters({})
    try {
      const rows = tab === 'Orders' ? 200 : 500
      const res = await fetch(`/api/sheet-tab?tab=${encodeURIComponent(tab)}&rows=${rows}`)
      const json = await res.json()
      setData(json)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  function handleSort(header) {
    if (sortCol === header) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(header)
      setSortDir('asc')
    }
  }

  function handleColumnFilter(header, value) {
    setColumnFilters((prev) => {
      const next = { ...prev }
      if (value) next[header] = value
      else delete next[header]
      return next
    })
  }

  // Filter + sort
  const processed = useMemo(() => {
    if (!data?.data) return []

    let rows = data.data

    // Global search
    if (search) {
      const q = search.toLowerCase()
      rows = rows.filter((row) =>
        Object.values(row).some((v) =>
          typeof v === 'string' && v.toLowerCase().includes(q)
        )
      )
    }

    // Column filters
    for (const [col, val] of Object.entries(columnFilters)) {
      if (val) {
        const q = val.toLowerCase()
        rows = rows.filter((row) =>
          (row[col] || '').toLowerCase().includes(q)
        )
      }
    }

    // Sort
    if (sortCol) {
      rows = [...rows].sort((a, b) => {
        const av = a[sortCol] || ''
        const bv = b[sortCol] || ''
        // Try numeric sort first
        const an = parseFloat(av.replace(/[,$%]/g, ''))
        const bn = parseFloat(bv.replace(/[,$%]/g, ''))
        if (!isNaN(an) && !isNaN(bn)) {
          return sortDir === 'asc' ? an - bn : bn - an
        }
        // String sort
        const cmp = av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' })
        return sortDir === 'asc' ? cmp : -cmp
      })
    }

    return rows
  }, [data, search, columnFilters, sortCol, sortDir])

  // Get unique values for column filter dropdowns (top 20)
  function getColumnValues(header) {
    if (!data?.data) return []
    const vals = new Set()
    data.data.forEach((row) => {
      const v = (row[header] || '').trim()
      if (v) vals.add(v)
    })
    return Array.from(vals).sort().slice(0, 30)
  }

  const activeFilters = Object.keys(columnFilters).length

  return (
    <div className="sviewer">
      {/* Tab pills */}
      <div className="sviewer__tabs">
        {QUICK_TABS.map((tab) => (
          <button
            key={tab}
            className={`sviewer__tab ${activeTab === tab ? 'sviewer__tab--active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
        {allTabs && (
          <select
            className="sviewer__more"
            value=""
            onChange={(e) => { if (e.target.value) setActiveTab(e.target.value) }}
          >
            <option value="">More...</option>
            {allTabs
              .filter((t) => !QUICK_TABS.includes(t.title))
              .map((t) => (
                <option key={t.sheetId} value={t.title}>{t.title}</option>
              ))}
          </select>
        )}
      </div>

      {/* Toolbar */}
      <div className="sviewer__toolbar">
        <h3 className="sviewer__title">{activeTab}</h3>
        <div className="sviewer__search-wrap">
          <input
            className="sviewer__search"
            type="text"
            placeholder="Search all columns..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {activeFilters > 0 && (
            <button
              className="sviewer__clear-filters"
              onClick={() => setColumnFilters({})}
            >
              Clear {activeFilters} filter{activeFilters > 1 ? 's' : ''}
            </button>
          )}
          {data && <span className="sviewer__count">{processed.length} rows</span>}
        </div>
      </div>

      {/* Table */}
      {loading && (
        <div className="sviewer__loading">Loading {activeTab}...</div>
      )}

      {!loading && data && (
        <div className="sviewer__table-wrap">
          <table className="sviewer__table">
            <thead>
              <tr>
                {data.headers.map((h, i) => (
                  <th key={i} onClick={() => handleSort(h)} className="sviewer__th-sortable">
                    <div className="sviewer__th-content">
                      <span>{h}</span>
                      {sortCol === h && (
                        <span className="sviewer__sort-arrow">
                          {sortDir === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
              <tr className="sviewer__filter-row">
                {data.headers.map((h, i) => {
                  const vals = getColumnValues(h)
                  return (
                    <td key={i} className="sviewer__filter-cell">
                      {vals.length <= 30 && vals.length > 0 ? (
                        <select
                          className="sviewer__filter-select"
                          value={columnFilters[h] || ''}
                          onChange={(e) => handleColumnFilter(h, e.target.value)}
                        >
                          <option value="">All</option>
                          {vals.map((v) => (
                            <option key={v} value={v}>{v}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="sviewer__filter-input"
                          type="text"
                          placeholder="Filter..."
                          value={columnFilters[h] || ''}
                          onChange={(e) => handleColumnFilter(h, e.target.value)}
                        />
                      )}
                    </td>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {processed.map((row, i) => (
                <tr key={i}>
                  {data.headers.map((h, j) => (
                    <td key={j}>{row[h] || ''}</td>
                  ))}
                </tr>
              ))}
              {processed.length === 0 && (
                <tr>
                  <td colSpan={data.headers.length} className="sviewer__empty">
                    {search || activeFilters ? 'No matching rows' : 'No data'}
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
