import { useState, useEffect } from 'react'
import './Orders.css'

export default function Orders() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [driver, setDriver] = useState('')
  const [pharmacy, setPharmacy] = useState('')
  const [zip, setZip] = useState('')
  const [date, setDate] = useState('')
  const [coldchain, setColdchain] = useState('')
  const [source, setSource] = useState('')
  const [sortCol, setSortCol] = useState(null)
  const [sortDir, setSortDir] = useState('asc')

  useEffect(() => { loadOrders() }, [page, search, driver, pharmacy, zip, date, coldchain, source])

  async function loadOrders() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, pageSize: 100 })
      if (search) params.set('search', search)
      if (driver) params.set('driver', driver)
      if (pharmacy) params.set('pharmacy', pharmacy)
      if (zip) params.set('zip', zip)
      if (date) params.set('date', date)
      if (coldchain) params.set('coldchain', coldchain)
      if (source) params.set('source', source)

      const res = await fetch(`/api/orders?${params}`)
      setData(await res.json())
    } catch { setData(null) }
    finally { setLoading(false) }
  }

  function handleSearch(e) {
    e.preventDefault()
    setSearch(searchInput)
    setPage(1)
  }

  function clearFilters() {
    setSearch(''); setSearchInput(''); setDriver(''); setPharmacy('')
    setZip(''); setDate(''); setColdchain(''); setSource(''); setPage(1)
  }

  function handleSort(col) {
    if (sortCol === col) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const hasFilters = search || driver || pharmacy || zip || date || coldchain || source

  // Client-side sort on current page
  let orders = data?.orders || []
  if (sortCol) {
    orders = [...orders].sort((a, b) => {
      const av = a[sortCol] || ''
      const bv = b[sortCol] || ''
      const an = parseFloat(av.replace(/[,$%]/g, ''))
      const bn = parseFloat(bv.replace(/[,$%]/g, ''))
      if (!isNaN(an) && !isNaN(bn)) return sortDir === 'asc' ? an - bn : bn - an
      const cmp = av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }

  return (
    <div className="ord">
      <div className="ord__header">
        <div>
          <h2 className="ord__title">Orders</h2>
          {data && <span className="ord__total">{data.total.toLocaleString()} total orders</span>}
        </div>
      </div>

      {/* Filters */}
      <div className="ord__filters">
        <form onSubmit={handleSearch} className="ord__search-form">
          <input
            className="ord__search"
            type="text"
            placeholder="Search name, address, order ID..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <button type="submit" className="ord__search-btn">Search</button>
        </form>

        <div className="ord__filter-row">
          <select className="ord__filter" value={driver} onChange={(e) => { setDriver(e.target.value); setPage(1) }}>
            <option value="">All Drivers</option>
            {data?.filters?.drivers?.map(d => <option key={d} value={d}>{d}</option>)}
          </select>

          <select className="ord__filter" value={pharmacy} onChange={(e) => { setPharmacy(e.target.value); setPage(1) }}>
            <option value="">All Pharmacies</option>
            {data?.filters?.pharmacies?.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          <input
            className="ord__filter ord__filter--input"
            type="text"
            placeholder="ZIP..."
            value={zip}
            onChange={(e) => { setZip(e.target.value); setPage(1) }}
          />

          <input
            className="ord__filter ord__filter--input"
            type="text"
            placeholder="Date (MM/DD/YYYY)..."
            value={date}
            onChange={(e) => { setDate(e.target.value); setPage(1) }}
          />

          <select className="ord__filter" value={coldchain} onChange={(e) => { setColdchain(e.target.value); setPage(1) }}>
            <option value="">Cold Chain: All</option>
            <option value="yes">Cold Chain Only</option>
          </select>

          <select className="ord__filter" value={source} onChange={(e) => { setSource(e.target.value); setPage(1) }}>
            <option value="">All Sources</option>
            {data?.filters?.sources?.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          {hasFilters && (
            <button className="ord__clear" onClick={clearFilters}>Clear All</button>
          )}
        </div>
      </div>

      {/* Table */}
      {loading && (
        <div className="ord__loading"><div className="dispatch__spinner" />Loading orders...</div>
      )}

      {!loading && data && (
        <>
          <div className="ord__table-wrap">
            <table className="ord__table">
              <thead>
                <tr>
                  {(data.headers || []).map((h) => (
                    <th key={h} className="ord__th" onClick={() => handleSort(h)}>
                      {h}
                      {sortCol === h && <span className="ord__sort">{sortDir === 'asc' ? ' ↑' : ' ↓'}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((order, i) => {
                  const cc = (order['Cold Chain'] || '').trim()
                  const hasCc = cc && cc.toLowerCase() !== 'no' && cc.toLowerCase() !== 'n'
                  return (
                    <tr key={i} className={hasCc ? 'ord__row--cold' : ''}>
                      <td className="ord__cell-id">{order['Order ID']}</td>
                      <td className="ord__cell-name">{order['Name']}</td>
                      <td className="ord__cell-addr">{order['Address']}</td>
                      <td>{order['City']}</td>
                      <td className="ord__cell-zip">{order['ZIP']}</td>
                      <td>{hasCc ? '❄️' : ''}</td>
                      <td>
                        <span className={`ord__pharma-badge ${order['Pharmacy'] === 'SHSP' ? 'ord__pharma-badge--shsp' : 'ord__pharma-badge--aultman'}`}>
                          {order['Pharmacy']}
                        </span>
                      </td>
                      <td className="ord__cell-driver-id">{order['Assigned Driver #']}</td>
                      <td className="ord__cell-driver">{order['Driver Name']}</td>
                      <td className="ord__cell-date">{order['Date Delivered']}</td>
                      <td>
                        <span className={`ord__source ${order['Source'] === 'Live' ? 'ord__source--live' : 'ord__source--hist'}`}>
                          {order['Source']}
                        </span>
                      </td>
                    </tr>
                  )
                })}
                {orders.length === 0 && (
                  <tr><td colSpan={11} className="ord__empty">No orders found</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="ord__pager">
            <button
              className="ord__pager-btn"
              disabled={page <= 1}
              onClick={() => setPage(1)}
            >
              First
            </button>
            <button
              className="ord__pager-btn"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Prev
            </button>
            <span className="ord__pager-info">
              Page {data.page} of {data.pages}
            </span>
            <button
              className="ord__pager-btn"
              disabled={page >= data.pages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
            <button
              className="ord__pager-btn"
              disabled={page >= data.pages}
              onClick={() => setPage(data.pages)}
            >
              Last
            </button>
          </div>
        </>
      )}
    </div>
  )
}
