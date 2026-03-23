import { fetchRange, MASTER_SHEET_ID } from './sheets.js'

// GET /api/orders?page=1&pageSize=100&search=&driver=&pharmacy=&zip=&date=
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    // Fetch all orders (cached after first call per server lifecycle)
    const rows = await fetchRange(MASTER_SHEET_ID, 'Orders!A1:K25000')
    if (rows.length < 2) return res.status(200).json({ headers: [], orders: [], total: 0, page: 1, pages: 1 })

    const headers = rows[0].map(h => h.trim())
    let allOrders = rows.slice(1)
      .filter(r => r.length > 0 && r[0])
      .map((row, idx) => {
        const obj = { _row: idx }
        headers.forEach((h, i) => { obj[h] = row[i] || '' })
        return obj
      })

    // Reverse so newest first
    allOrders.reverse()

    // Apply filters
    const { search, driver, pharmacy, zip, date, coldchain, source } = req.query

    if (search) {
      const q = search.toLowerCase()
      allOrders = allOrders.filter(o =>
        Object.values(o).some(v => typeof v === 'string' && v.toLowerCase().includes(q))
      )
    }
    if (driver) {
      allOrders = allOrders.filter(o => (o['Driver Name'] || '').toLowerCase() === driver.toLowerCase())
    }
    if (pharmacy) {
      allOrders = allOrders.filter(o => (o['Pharmacy'] || '') === pharmacy)
    }
    if (zip) {
      allOrders = allOrders.filter(o => (o['ZIP'] || '').includes(zip))
    }
    if (date) {
      allOrders = allOrders.filter(o => (o['Date Delivered'] || '').includes(date))
    }
    if (coldchain === 'yes') {
      allOrders = allOrders.filter(o => {
        const cc = (o['Cold Chain'] || '').trim().toLowerCase()
        return cc && cc !== 'no' && cc !== 'n'
      })
    }
    if (source) {
      allOrders = allOrders.filter(o => (o['Source'] || '') === source)
    }

    const total = allOrders.length
    const pageSize = Math.min(parseInt(req.query.pageSize) || 100, 500)
    const pages = Math.ceil(total / pageSize)
    const page = Math.max(1, Math.min(parseInt(req.query.page) || 1, pages))
    const start = (page - 1) * pageSize
    const orders = allOrders.slice(start, start + pageSize)

    // Get unique values for filter dropdowns
    const uniqueDrivers = [...new Set(rows.slice(1).map(r => r[headers.indexOf('Driver Name')] || '').filter(Boolean))].sort()
    const uniquePharmacies = [...new Set(rows.slice(1).map(r => r[headers.indexOf('Pharmacy')] || '').filter(Boolean))].sort()
    const uniqueSources = [...new Set(rows.slice(1).map(r => r[headers.indexOf('Source')] || '').filter(Boolean))].sort()

    return res.status(200).json({
      headers,
      orders,
      total,
      page,
      pages,
      pageSize,
      filters: {
        drivers: uniqueDrivers,
        pharmacies: uniquePharmacies,
        sources: uniqueSources,
      },
    })
  } catch (err) {
    console.error('[orders API]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
