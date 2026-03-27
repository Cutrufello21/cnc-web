import { supabase } from './_lib/supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const [driversRes, sourcesRes, citiesRes, datesRes] = await Promise.all([
      supabase.from('drivers').select('driver_name').eq('active', true).order('driver_name'),
      supabase.from('orders').select('source').not('source', 'is', null).not('source', 'eq', '').limit(1000),
      supabase.from('orders').select('city').not('city', 'is', null).not('city', 'eq', '').limit(10000),
      supabase.from('dispatch_logs').select('date').order('date', { ascending: false }),
    ])

    const drivers = (driversRes.data || []).map(r => r.driver_name).filter(Boolean).sort()
    const sources = [...new Set((sourcesRes.data || []).map(r => r.source))].sort()
    const cities = [...new Set((citiesRes.data || []).map(r => r.city))].sort()
    const years = [...new Set((datesRes.data || []).map(r => r.date?.slice(0, 4)).filter(Boolean))].sort().reverse()

    return res.status(200).json({ drivers, sources, cities, years })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
