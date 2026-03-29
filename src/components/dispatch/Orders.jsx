import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import './Orders.css'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function fmtDate(d) {
  if (!d) return ''
  const [y, m, dy] = d.split('-')
  return `${MONTHS[+m - 1]?.slice(0, 3)} ${+dy}, ${y}`
}

export default function Orders() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [driver, setDriver] = useState('')
  const [pharmacy, setPharmacy] = useState('')
  const [zip, setZip] = useState('')
  const [coldchain, setColdchain] = useState('')
  const [source, setSource] = useState('')
  const [year, setYear] = useState('')
  const [month, setMonth] = useState('')
  const [city, setCity] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sortCol, setSortCol] = useState(null)
  const [sortDir, setSortDir] = useState('asc')
  const [filters, setFilters] = useState({ drivers: [], sources: [], years: [], cities: [] })
  const [showAdvanced, setShowAdvanced] = useState(false)
  const searchRef = useRef(null)

  useEffect(() => {
    fetch('/api/order-filters')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setFilters({ ...data, pharmacies: ['SHSP', 'Aultman'] })
      })
      .catch(() => {})
  }, [])

  useEffect(() => { loadOrders() }, [page, search, driver, pharmacy, zip, coldchain, source, year, month, city, dateFrom, dateTo])

  async function loadOrders() {
    setLoading(true)
    try {
      const pageSize = 100
      let query = supabase.from('orders').select('*', { count: 'exact' })

      if (search) {
        query = query.or(`patient_name.ilike.%${search}%,address.ilike.%${search}%,order_id.ilike.%${search}%,zip.ilike.%${search}%,driver_name.ilike.%${search}%,city.ilike.%${search}%`)
      }
      if (driver) query = query.ilike('driver_name', driver)
      if (pharmacy) query = query.eq('pharmacy', pharmacy)
      if (zip) query = query.ilike('zip', `%${zip}%`)
      if (coldchain === 'yes') query = query.eq('cold_chain', true)
      if (coldchain === 'no') query = query.eq('cold_chain', false)
      if (source) query = query.eq('source', source)
      if (city) query = query.ilike('city', city)

      if (dateFrom) query = query.gte('date_delivered', dateFrom)
      if (dateTo) query = query.lte('date_delivered', dateTo)

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

      // Enrich with delivery tracking data from daily_stops
      const orderIds = (orders || []).map(o => o.order_id).filter(Boolean)
      let deliveryMap = {}
      if (orderIds.length > 0) {
        const { data: stops } = await supabase.from('daily_stops')
          .select('order_id, status, delivered_at, photo_url, photo_urls, delivery_note, barcode, signature_url, failure_reason')
          .in('order_id', orderIds)
        if (stops) {
          stops.forEach(s => { deliveryMap[s.order_id] = s })
        }
      }

      const enriched = (orders || []).map(o => ({
        ...o,
        _delivery: deliveryMap[o.order_id] || null,
      }))

      setData({
        orders: enriched,
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
    setZip(''); setColdchain(''); setSource('')
    setYear(''); setMonth(''); setCity('')
    setDateFrom(''); setDateTo(''); setPage(1)
    if (searchRef.current) searchRef.current.focus()
  }

  function setQuickDate(preset) {
    const today = new Date()
    const fmt = d => d.toISOString().split('T')[0]
    if (preset === 'today') {
      setDateFrom(fmt(today)); setDateTo(fmt(today))
    } else if (preset === 'yesterday') {
      const y = new Date(today); y.setDate(y.getDate() - 1)
      setDateFrom(fmt(y)); setDateTo(fmt(y))
    } else if (preset === 'week') {
      const mon = new Date(today); mon.setDate(today.getDate() - ((today.getDay() + 6) % 7))
      setDateFrom(fmt(mon)); setDateTo(fmt(today))
    } else if (preset === 'month') {
      setDateFrom(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`); setDateTo(fmt(today))
    } else if (preset === 'last30') {
      const d = new Date(today); d.setDate(d.getDate() - 30)
      setDateFrom(fmt(d)); setDateTo(fmt(today))
    }
    setYear(''); setMonth(''); setPage(1)
  }

  function handleSort(col) {
    if (sortCol === col) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const activeFilterCount = [search, driver, pharmacy, zip, coldchain, source, year, month, city, dateFrom, dateTo].filter(Boolean).length
  const hasFilters = activeFilterCount > 0

  let orders = data?.orders || []
  if (sortCol) {
    const key = sortCol
    orders = [...orders].sort((a, b) => {
      const av = a[key] || ''
      const bv = b[key] || ''
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }

  const [viewingPhotos, setViewingPhotos] = useState(null)

  const cols = [
    { key: 'order_id', label: 'Order ID', cls: 'ord__cell-id' },
    { key: 'patient_name', label: 'Name', cls: 'ord__cell-name' },
    { key: 'address', label: 'Address', cls: 'ord__cell-addr' },
    { key: 'city', label: 'City' },
    { key: 'zip', label: 'ZIP', cls: 'ord__cell-zip' },
    { key: 'pharmacy', label: 'Pharmacy' },
    { key: 'driver_name', label: 'Driver', cls: 'ord__cell-driver' },
    { key: 'date_delivered', label: 'Date', cls: 'ord__cell-date' },
    { key: 'cold_chain', label: 'CC' },
    { key: 'source', label: 'Source' },
  ]

  const deliveryCols = [
    { key: '_status', label: 'Status' },
    { key: '_time', label: 'Time' },
    { key: '_proof', label: 'Proof' },
    { key: '_note', label: 'Note' },
  ]

  return (
    <div className="ord">
      <div className="ord__header">
        <div className="ord__header-left">
          <h2 className="ord__title">Orders</h2>
          {data && <span className="ord__total">{data.total.toLocaleString()} {hasFilters ? 'matching' : 'total'}</span>}
        </div>
        {hasFilters && (
          <button className="ord__clear" onClick={clearFilters}>
            Clear {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
          </button>
        )}
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="ord__search-form">
        <input
          ref={searchRef}
          className="ord__search"
          type="text"
          placeholder="Search by name, address, order ID, ZIP, city, driver..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <button type="submit" className="ord__search-btn">Search</button>
      </form>

      {/* Quick date buttons */}
      <div className="ord__quick-dates">
        <span className="ord__quick-label">Quick:</span>
        {[['today','Today'],['yesterday','Yesterday'],['week','This Week'],['month','This Month'],['last30','Last 30 Days']].map(([k, label]) => (
          <button key={k} className="ord__quick-btn" onClick={() => setQuickDate(k)}>{label}</button>
        ))}
      </div>

      {/* Primary filters */}
      <div className="ord__filter-row">
        <select className="ord__filter" value={year} onChange={(e) => { setYear(e.target.value); setDateFrom(''); setDateTo(''); setPage(1) }}>
          <option value="">All Years</option>
          {filters.years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        <select className="ord__filter" value={month} onChange={(e) => { setMonth(e.target.value); setDateFrom(''); setDateTo(''); setPage(1) }}>
          <option value="">All Months</option>
          {MONTHS.map((m, i) => (
            <option key={i} value={String(i + 1).padStart(2, '0')}>{m}</option>
          ))}
        </select>

        <select className="ord__filter" value={driver} onChange={(e) => { setDriver(e.target.value); setPage(1) }}>
          <option value="">All Drivers</option>
          {filters.drivers.map(d => <option key={d} value={d}>{d}</option>)}
        </select>

        <select className="ord__filter" value={pharmacy} onChange={(e) => { setPharmacy(e.target.value); setPage(1) }}>
          <option value="">All Pharmacies</option>
          <option value="SHSP">SHSP</option>
          <option value="Aultman">Aultman</option>
        </select>

        <select className="ord__filter" value={coldchain} onChange={(e) => { setColdchain(e.target.value); setPage(1) }}>
          <option value="">Cold Chain: All</option>
          <option value="yes">Cold Chain Only</option>
          <option value="no">Non-Cold Chain</option>
        </select>

        <select className="ord__filter" value={source} onChange={(e) => { setSource(e.target.value); setPage(1) }}>
          <option value="">All Sources</option>
          {filters.sources.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <button className="ord__advanced-toggle" onClick={() => setShowAdvanced(!showAdvanced)}>
          {showAdvanced ? 'Less' : 'More Filters'}
        </button>
      </div>

      {/* Advanced filters */}
      {showAdvanced && (
        <div className="ord__filter-row ord__filter-row--advanced">
          <input className="ord__filter ord__filter--input" type="text" placeholder="ZIP..." value={zip} onChange={(e) => { setZip(e.target.value); setPage(1) }} />
          <select className="ord__filter" value={city} onChange={(e) => { setCity(e.target.value); setPage(1) }}>
            <option value="">All Cities</option>
            {filters.cities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="ord__date-range">
            <label className="ord__date-label">From</label>
            <input className="ord__filter ord__filter--date" type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setYear(''); setMonth(''); setPage(1) }} />
            <label className="ord__date-label">To</label>
            <input className="ord__filter ord__filter--date" type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setYear(''); setMonth(''); setPage(1) }} />
          </div>
        </div>
      )}

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
                  {cols.map(c => (
                    <th key={c.key} className="ord__th" onClick={() => handleSort(c.key)}>
                      {c.label}
                      {sortCol === c.key && <span className="ord__sort">{sortDir === 'asc' ? ' ↑' : ' ↓'}</span>}
                    </th>
                  ))}
                  {deliveryCols.map(c => (
                    <th key={c.key} className="ord__th ord__th--delivery">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((o, i) => {
                  const cc = o.cold_chain
                  return (
                    <tr key={i} className={cc ? 'ord__row--cold' : ''}>
                      <td className="ord__cell-id">{o.order_id}</td>
                      <td className="ord__cell-name">{o.patient_name}</td>
                      <td className="ord__cell-addr">{o.address}</td>
                      <td>{o.city}</td>
                      <td className="ord__cell-zip">{o.zip}</td>
                      <td>
                        {o.pharmacy && <span className={`ord__pharma-badge ${o.pharmacy === 'SHSP' ? 'ord__pharma-badge--shsp' : 'ord__pharma-badge--aultman'}`}>{o.pharmacy}</span>}
                      </td>
                      <td className="ord__cell-driver">{o.driver_name}</td>
                      <td className="ord__cell-date">{fmtDate(o.date_delivered)}</td>
                      <td>{cc ? '❄️' : ''}</td>
                      <td>
                        <span className={`ord__source ${o.source === 'Live' ? 'ord__source--live' : 'ord__source--hist'}`}>{o.source}</span>
                      </td>
                      <td className="ord__cell-status">
                        {o._delivery ? (
                          <span className={`ord__status-dot ${o._delivery.status === 'delivered' ? 'ord__status-dot--done' : o._delivery.status === 'failed' ? 'ord__status-dot--failed' : ''}`} />
                        ) : null}
                      </td>
                      <td className="ord__cell-time">
                        {o._delivery?.delivered_at ? new Date(o._delivery.delivered_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''}
                      </td>
                      <td className="ord__cell-proof">
                        {(() => {
                          const urls = o._delivery?.photo_urls || (o._delivery?.photo_url ? [o._delivery.photo_url] : [])
                          if (urls.length === 0) return null
                          return (
                            <button className="ord__photo-btn" onClick={() => setViewingPhotos({ urls, orderId: o.order_id })}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                                <circle cx="12" cy="13" r="4"/>
                              </svg>
                              {urls.length}
                            </button>
                          )
                        })()}
                      </td>
                      <td className="ord__cell-note">
                        {o._delivery?.delivery_note && (
                          <span className="ord__note-text" title={o._delivery.delivery_note}>{o._delivery.delivery_note}</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {orders.length === 0 && (
                  <tr><td colSpan={cols.length + deliveryCols.length} className="ord__empty">No orders found</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="ord__pager">
            <button className="ord__pager-btn" disabled={page <= 1} onClick={() => setPage(1)}>First</button>
            <button className="ord__pager-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
            <span className="ord__pager-info">
              Page {data.page} of {data.pages.toLocaleString()} — showing {((data.page - 1) * data.pageSize + 1).toLocaleString()}-{Math.min(data.page * data.pageSize, data.total).toLocaleString()} of {data.total.toLocaleString()}
            </span>
            <button className="ord__pager-btn" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next</button>
            <button className="ord__pager-btn" disabled={page >= data.pages} onClick={() => setPage(data.pages)}>Last</button>
          </div>
        </>
      )}
      {/* Photo lightbox */}
      {viewingPhotos && (
        <div className="ord__lightbox" onClick={() => setViewingPhotos(null)}>
          <div className="ord__lightbox-content" onClick={(e) => e.stopPropagation()}>
            <div className="ord__lightbox-header">
              <span>Order #{viewingPhotos.orderId} — {viewingPhotos.urls.length} photo{viewingPhotos.urls.length !== 1 ? 's' : ''}</span>
              <button className="ord__lightbox-close" onClick={() => setViewingPhotos(null)}>&times;</button>
            </div>
            <div className="ord__lightbox-gallery">
              {viewingPhotos.urls.map((url, i) => (
                <img key={i} src={url} alt={`Delivery photo ${i + 1}`} className="ord__lightbox-img" />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
