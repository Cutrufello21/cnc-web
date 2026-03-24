import { supabase } from './_lib/supabase.js'

// Map frontend tab names → Supabase table + column renames
const TABLE_MAP = {
  'Routing Rules': {
    table: 'routing_rules',
    columns: {
      zip_code: 'ZIP Code', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri',
      route: 'Route', pharmacy: 'Pharmacy',
    },
  },
  'Drivers': {
    table: 'drivers',
    columns: {
      driver_name: 'Driver Name', driver_number: 'Driver #', email: 'Email',
      pharmacy: 'Pharmacy', rate_mth: 'Rate MTH', rate_wf: 'Rate WF',
      office_fee: 'Office Fee', flat_salary: 'Flat Salary', active: 'Active',
    },
  },
  'Weekly Stops': {
    table: 'payroll',
    columns: {
      driver_name: 'Driver Name', driver_number: 'Driver #',
      mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri',
      week_total: 'Week Total', will_calls: 'Will Calls', weekly_pay: 'Weekly Pay',
      week_of: 'Week Of',
    },
  },
  'Orders': {
    table: 'orders',
    columns: {
      order_id: 'Order ID', patient_name: 'Name', address: 'Address', city: 'City',
      zip: 'ZIP', pharmacy: 'Pharmacy', driver_name: 'Driver Name',
      date_delivered: 'Date Delivered', cold_chain: 'Cold Chain', source: 'Source',
    },
  },
  'Log': {
    table: 'dispatch_logs',
    columns: {
      date: 'Date', delivery_day: 'Delivery Day', status: 'Status',
      orders_processed: 'Orders Processed', cold_chain: 'Cold Chain',
      unassigned_count: 'Unassigned Count', corrections: 'Corrections',
      shsp_orders: 'SHSP Orders', aultman_orders: 'Aultman Orders',
      top_driver: 'Top Driver', notes: 'Notes',
    },
  },
  'Unassigned History': {
    table: 'unassigned_orders',
    columns: {
      date: 'Date', delivery_day: 'Delivery Day', zip: 'ZIP',
      address: 'Address', pharmacy: 'Pharmacy', patient_name: 'Name',
      resolved: 'Resolved',
    },
  },
}

// Computed views from the orders table
const COMPUTED_TABS = {
  'ZIP Analytics': async () => {
    const { data } = await supabase.from('orders').select('zip, pharmacy')
      .not('zip', 'is', null).not('zip', 'eq', '')
    const counts = {}
    ;(data || []).forEach(r => {
      if (!counts[r.zip]) counts[r.zip] = { zip: r.zip, total: 0, pharmacies: {} }
      counts[r.zip].total++
      counts[r.zip].pharmacies[r.pharmacy] = (counts[r.zip].pharmacies[r.pharmacy] || 0) + 1
    })
    const rows = Object.values(counts)
      .sort((a, b) => b.total - a.total).slice(0, 50)
      .map(r => ({
        'ZIP': r.zip,
        'Total Deliveries': r.total,
        'SHSP': r.pharmacies['SHSP'] || 0,
        'Aultman': r.pharmacies['Aultman'] || 0,
      }))
    return { headers: ['ZIP', 'Total Deliveries', 'SHSP', 'Aultman'], data: rows }
  },
  'Patient Analytics': async () => {
    const { data } = await supabase.from('orders').select('patient_name, pharmacy, zip, cold_chain')
      .not('patient_name', 'is', null).not('patient_name', 'eq', '')
    const counts = {}
    ;(data || []).forEach(r => {
      if (!counts[r.patient_name]) counts[r.patient_name] = { name: r.patient_name, total: 0, pharmacy: r.pharmacy, zip: r.zip, cc: 0 }
      counts[r.patient_name].total++
      if (r.cold_chain) counts[r.patient_name].cc++
    })
    const rows = Object.values(counts)
      .sort((a, b) => b.total - a.total).slice(0, 50)
      .map(r => ({
        'Name': r.name, 'Total Deliveries': r.total,
        'Pharmacy': r.pharmacy, 'ZIP': r.zip, 'Cold Chain': r.cc,
      }))
    return { headers: ['Name', 'Total Deliveries', 'Pharmacy', 'ZIP', 'Cold Chain'], data: rows }
  },
  'Location Intelligence': async () => {
    const { data } = await supabase.from('orders').select('address, city, zip, pharmacy')
      .not('address', 'is', null).not('address', 'eq', '')
    const counts = {}
    ;(data || []).forEach(r => {
      const key = `${r.address}|${r.city}|${r.zip}`
      if (!counts[key]) counts[key] = { address: r.address, city: r.city, zip: r.zip, pharmacy: r.pharmacy, total: 0 }
      counts[key].total++
    })
    const rows = Object.values(counts)
      .sort((a, b) => b.total - a.total).slice(0, 30)
      .map(r => ({
        'Address': r.address, 'City': r.city, 'ZIP': r.zip,
        'Pharmacy': r.pharmacy, 'Total Deliveries': r.total,
      }))
    return { headers: ['Address', 'City', 'ZIP', 'Pharmacy', 'Total Deliveries'], data: rows }
  },
}

// GET /api/sheets-view?action=tabs — list all tables
// GET /api/sheets-view?tab=Routing Rules&rows=500 — get table data
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    if (req.query.action === 'tabs') {
      const allTabs = [...Object.keys(TABLE_MAP), ...Object.keys(COMPUTED_TABS)]
      const tabs = allTabs.map((title, index) => ({ title, sheetId: index, index }))
      return res.status(200).json({ tabs })
    }

    const tab = req.query.tab
    if (!tab) return res.status(400).json({ error: 'Missing ?tab= or ?action=tabs' })

    // Computed tabs
    if (COMPUTED_TABS[tab]) {
      const result = await COMPUTED_TABS[tab]()
      return res.status(200).json({ tab, ...result, rowCount: result.data.length })
    }

    // Direct table tabs
    const mapping = TABLE_MAP[tab]
    if (!mapping) return res.status(400).json({ error: `Unknown tab: ${tab}` })

    const maxRows = parseInt(req.query.rows) || 500
    const { data, error } = await supabase.from(mapping.table).select('*').limit(maxRows)
    if (error) throw error

    if (!data || data.length === 0) {
      return res.status(200).json({ tab, headers: [], data: [], rowCount: 0 })
    }

    // Rename columns to match frontend expectations
    const colMap = mapping.columns
    const headers = Object.values(colMap)
    const mapped = data.map(row => {
      const obj = {}
      for (const [dbCol, displayCol] of Object.entries(colMap)) {
        obj[displayCol] = row[dbCol] ?? ''
      }
      return obj
    })

    return res.status(200).json({ tab, headers, data: mapped, rowCount: mapped.length })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
