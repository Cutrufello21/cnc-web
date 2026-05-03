import { supabase } from './_lib/supabase.js'

// GET /api/orders?page=1&pageSize=100&search=&driver=&pharmacy=&zip=&date=

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { search, driver, pharmacy, zip, date, coldchain, source } = req.query
    const pageSize = Math.min(parseInt(req.query.pageSize) || 100, 500)
    const page = Math.max(1, parseInt(req.query.page) || 1)

    let query = supabase.from('daily_stops').select('*', { count: 'exact' })

    if (search) {
      query = query.or(`patient_name.ilike.%${search}%,address.ilike.%${search}%,order_id.ilike.%${search}%,zip.ilike.%${search}%,driver_name.ilike.%${search}%`)
    }
    if (driver) query = query.ilike('driver_name', driver)
    if (pharmacy) query = query.eq('pharmacy', pharmacy)
    if (zip) query = query.ilike('zip', `%${zip}%`)
    if (date) query = query.eq('delivery_date', date)
    if (coldchain === 'yes') query = query.eq('cold_chain', true)

    query = query.order('delivery_date', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1)

    const { data: orders, count, error } = await query
    if (error) throw error

    const total = count || 0
    const pages = Math.ceil(total / pageSize)

    // Get unique values for filter dropdowns
    const [driversRes, pharmaciesRes] = await Promise.all([
      supabase.from('daily_stops').select('driver_name').not('driver_name', 'is', null).limit(10000),
      supabase.from('daily_stops').select('pharmacy').not('pharmacy', 'is', null).limit(10000),
    ])

    const uniqueDrivers = [...new Set((driversRes.data || []).map(r => r.driver_name).filter(Boolean))].sort()
    const uniquePharmacies = [...new Set((pharmaciesRes.data || []).map(r => r.pharmacy).filter(Boolean))].sort()

    // Map to match existing frontend expectations
    const headers = ['Order ID', 'Name', 'Address', 'City', 'ZIP', 'Pharmacy', 'Driver Name', 'Date Delivered', 'Cold Chain']
    const mappedOrders = (orders || []).map(o => ({
      'Order ID': o.order_id,
      'Name': o.patient_name,
      'Address': o.address,
      'City': o.city,
      'ZIP': o.zip,
      'Pharmacy': o.pharmacy,
      'Driver Name': o.driver_name,
      'Date Delivered': o.delivery_date,
      'Cold Chain': o.cold_chain ? 'Yes' : '',
    }))

    return res.status(200).json({
      headers,
      orders: mappedOrders,
      total,
      page,
      pages,
      pageSize,
      filters: {
        drivers: uniqueDrivers,
        pharmacies: uniquePharmacies,
      },
    })
  } catch (err) {
    console.error('[orders API]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
