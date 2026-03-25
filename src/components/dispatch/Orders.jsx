import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
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
  const [year, setYear] = useState('')
  const [month, setMonth] = useState('')
  const [sortCol, setSortCol] = useState(null)
  const [sortDir, setSortDir] = useState('asc')
  const [filters, setFilters] = useState({ drivers: [], pharmacies: [], sources: [], years: [] })

  // Load filter options once
  useEffect(() => {
    async function loadFilters() {
      const [driversRes, datesRes, sourcesRes] = await Promise.all([
        supabase.from('orders').select('driver_name').not('driver_name', 'is', null).not('driver_name', 'eq', ''),
        supabase.from('orders').select('date_delivered').not('date_delivered', 'is', null),
        supabase.from('orders').select('source').not('source', 'is', null).not('source', 'eq', ''),
      ])
      const years = [...new Set((datesRes.data || []).map(r => r.date_delivered?.slice(0, 4)).filter(Boolean))].sort().reverse()
      setFilters({
        drivers: [...new Set((driversRes.data || []).map(r => r.driver_name))].sort(),
        pharmacies: ['SHSP', 'Aultman'],
        sources: [...new Set((sourcesRes.data || []).map(r => r.source))].sort(),
        years,
      })
    }
    loadFilters()
  }, [])

  useEffect(() => { loadOrders() }, [page, search, driver, pharmacy, zip, date, coldchain, source, year, month])

  async function loadOrders() {
    setLoading(true)
    try {
      const pageSize = 100
      let query = supabase.from('orders').select('*', { count: 'exact' })

      if (search) {
        query = query.or(`patient_name.ilike.%${search}%,address.ilike.%${search}%,order_id.ilike.%${search}%,zip.ilike.%${search}%,driver_name.ilike.%${search}%`)
      }
      if (driver) query = query.ilike('driver_name', driver)
      if (pharmacy) query = query.eq('pharmacy', pharmacy)
      if (zip) query = query.ilike('zip', `%${zip}%`)
      if (date) query = query.eq('date_delivered', date)
      if (coldchain === 'yes') query = query.eq('cold_chain', true)
      if (source) query = query.eq('source', source)
      if (year && month) {
        const startDate = `${year}-${month}-01`
        const endMonth = parseInt(month) === 12 ? '01' : String(parseInt(month) + 1).padStart(2, '0')
        const endYear = parseInt(month) === 12 ? String(parseInt(year) + 1) : year
        query = query.gte('date_delivered', startDate).lt('date_delivered', `${endYear}-${endMonth}-01`)
      } else if (year) {
        query = query.gte('date_delivered', `${year}-01-01`).lt('date_delivered', `${parseInt(year) + 1}-01-01`)
      }

      query = query.order('date_delivered', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1)

      const { data: orders, count, error } = await query
      if (error) throw error

      const total = count || 0
      const pages = Math.ceil(total / pageSize)

      // Map to display format
      const mappedOrders = (orders || []).map(o => ({
        'Order ID': o.order_id,
        'Name': o.patient_name,
        'Address': o.address,
        'City': o.city,
        'ZIP': o.zip,
        'Pharmacy': o.pharmacy,
        'Driver Name': o.driver_name,
        'Date Delivered': o.date_delivered,
        'Cold Chain': o.cold_chain ? 'Yes' : '',
        'Source': o.source,
      }))

      setData({
        headers: ['Order ID', 'Name', 'Address', 'City', 'ZIP', 'Pharmacy', 'Driver Name', 'Date Delivered', 'Cold Chain', 'Source'],
        orders: mappedOrders,
        total, page, pages, pageSize,
      })
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
    setZip(''); setDate(''); setColdchain(''); setSource('')
    setYear(''); setMonth(''); setPage(1)
  }

  function handleSort(col) {
    if (sortCol === col) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const hasFilters = search || driver || pharmacy || zip || date || coldchain || source || year || month

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
          <select className="ord__filter" value={year} onChange={(e) => { setYear(e.target.value); setPage(1) }}>
            <option value="">All Years</option>
            {filters.years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>

          <select className="ord__filter" value={month} onChange={(e) => { setMonth(e.target.value); setPage(1) }}>
            <option value="">All Months</option>
            {['01','02','03','04','05','06','07','08','09','10','11','12'].map(m => (
              <option key={m} value={m}>{new Date(2026, parseInt(m)-1).toLocaleString('en-US', { month: 'long' })}</option>
            ))}
          </select>

          <select className="ord__filter" value={driver} onChange={(e) => { setDriver(e.target.value); setPage(1) }}>
            <option value="">All Drivers</option>
            {filters.drivers.map(d => <option key={d} value={d}>{d}</option>)}
          </select>

          <select className="ord__filter" value={pharmacy} onChange={(e) => { setPharmacy(e.target.value); setPage(1) }}>
            <option value="">All Pharmacies</option>
            {filters.pharmacies.map(p => <option key={p} value={p}>{p}</option>)}
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
            placeholder="Date (YYYY-MM-DD)..."
            value={date}
            onChange={(e) => { setDate(e.target.value); setPage(1) }}
          />

          <select className="ord__filter" value={coldchain} onChange={(e) => { setColdchain(e.target.value); setPage(1) }}>
            <option value="">Cold Chain: All</option>
            <option value="yes">Cold Chain Only</option>
          </select>

          <select className="ord__filter" value={source} onChange={(e) => { setSource(e.target.value); setPage(1) }}>
            <option value="">All Sources</option>
            {filters.sources.map(s => <option key={s} value={s}>{s}</option>)}
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
                      <td>
                        <span className={`ord__pharma-badge ${order['Pharmacy'] === 'SHSP' ? 'ord__pharma-badge--shsp' : 'ord__pharma-badge--aultman'}`}>
                          {order['Pharmacy']}
                        </span>
                      </td>
                      <td className="ord__cell-driver">{order['Driver Name']}</td>
                      <td className="ord__cell-date">{order['Date Delivered']}</td>
                      <td>{hasCc ? '❄️' : ''}</td>
                      <td>
                        <span className={`ord__source ${order['Source'] === 'Live' ? 'ord__source--live' : 'ord__source--hist'}`}>
                          {order['Source']}
                        </span>
                      </td>
                    </tr>
                  )
                })}
                {orders.length === 0 && (
                  <tr><td colSpan={10} className="ord__empty">No orders found</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="ord__pager">
            <button className="ord__pager-btn" disabled={page <= 1} onClick={() => setPage(1)}>First</button>
            <button className="ord__pager-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
            <span className="ord__pager-info">Page {data.page} of {data.pages}</span>
            <button className="ord__pager-btn" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next</button>
            <button className="ord__pager-btn" disabled={page >= data.pages} onClick={() => setPage(data.pages)}>Last</button>
          </div>
        </>
      )}
    </div>
  )
}
