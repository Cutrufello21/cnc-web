import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import './SheetViewer.css'

const QUICK_TABS = [
  'Routing Rules',
  'Drivers',
  'Weekly Stops',
  'Orders',
  'Log',
  'Unassigned History',
]

const TABLE_MAP = {
  'Routing Rules': { table: 'routing_rules', cols: { zip_code: 'ZIP Code', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', route: 'Route', pharmacy: 'Pharmacy' } },
  'Drivers': { table: 'drivers', cols: { driver_name: 'Driver Name', driver_number: 'Driver #', email: 'Email', pharmacy: 'Pharmacy', rate_mth: 'Rate MTH', rate_wf: 'Rate WF', office_fee: 'Office Fee', flat_salary: 'Flat Salary', active: 'Active' } },
  'Weekly Stops': { table: 'payroll', cols: { driver_name: 'Driver Name', driver_number: 'Driver #', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', week_total: 'Week Total', will_calls: 'Will Calls', weekly_pay: 'Weekly Pay', week_of: 'Week Of' } },
  'Orders': { table: 'orders', cols: { order_id: 'Order ID', patient_name: 'Name', address: 'Address', city: 'City', zip: 'ZIP', pharmacy: 'Pharmacy', driver_name: 'Driver Name', date_delivered: 'Date Delivered', cold_chain: 'Cold Chain', source: 'Source' } },
  'Log': { table: 'dispatch_logs', cols: { date: 'Date', delivery_day: 'Delivery Day', status: 'Status', orders_processed: 'Orders Processed', cold_chain: 'Cold Chain', unassigned_count: 'Unassigned Count', corrections: 'Corrections', shsp_orders: 'SHSP Orders', aultman_orders: 'Aultman Orders', top_driver: 'Top Driver' } },
  'Unassigned History': { table: 'unassigned_orders', cols: { date: 'Date', delivery_day: 'Delivery Day', zip: 'ZIP', address: 'Address', pharmacy: 'Pharmacy', patient_name: 'Name', resolved: 'Resolved' } },
}

export default function SheetViewer() {
  const [allTabs, setAllTabs] = useState(QUICK_TABS.map((title, i) => ({ title, sheetId: i, index: i })))
  const [activeTab, setActiveTab] = useState('Routing Rules')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState(null)
  const [sortDir, setSortDir] = useState('asc')
  const [columnFilters, setColumnFilters] = useState({})

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
      const mapping = TABLE_MAP[tab]
      if (!mapping) { setData(null); return }

      const limit = tab === 'Orders' ? 200 : 500
      const { data: rows } = await supabase.from(mapping.table).select('*').limit(limit)

      if (!rows || rows.length === 0) {
        setData({ tab, headers: [], data: [], rowCount: 0 })
        return
      }

      const headers = Object.values(mapping.cols)
      const mapped = rows.map(row => {
        const obj = {}
        for (const [dbCol, displayCol] of Object.entries(mapping.cols)) {
          obj[displayCol] = row[dbCol] ?? ''
        }
        return obj
      })

      setData({ tab, headers, data: mapped, rowCount: mapped.length })
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
