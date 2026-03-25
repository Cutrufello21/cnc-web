import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'

export default function DriverSortList({ driverName, pharmacy }) {
  const [stops, setStops] = useState([])
  const [rules, setRules] = useState([])
  const [drivers, setDrivers] = useState([])
  const [overrides, setOverrides] = useState({})
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  const myPharmacy = pharmacy === 'Aultman' ? 'Aultman' : 'SHSP'

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    // Get most recent delivery date
    const { data: latest } = await supabase.from('daily_stops').select('delivery_date')
      .order('delivery_date', { ascending: false }).limit(1)
    const dateStr = latest?.[0]?.delivery_date || new Date().toISOString().split('T')[0]

    const [stopsRes, rulesRes, driversRes, overridesRes] = await Promise.all([
      supabase.from('daily_stops').select('driver_name, zip, pharmacy, city').eq('delivery_date', dateStr),
      supabase.from('routing_rules').select('zip_code, route'),
      supabase.from('drivers').select('driver_name, pharmacy').eq('active', true),
      supabase.from('sort_list').select('*').eq('delivery_date', dateStr).eq('pharmacy', myPharmacy),
    ])
    setStops(stopsRes.data || [])
    setRules(rulesRes.data || [])
    setDrivers(driversRes.data || [])
    const ov = {}
    ;(overridesRes.data || []).forEach(o => { ov[o.driver_name] = o })
    setOverrides(ov)
    setLoading(false)
  }

  const sortLines = useMemo(() => {
    const zipToRoute = {}
    rules.forEach(r => { zipToRoute[r.zip_code] = r.route || '' })

    const driverStops = {}
    stops.forEach(s => {
      if (!driverStops[s.driver_name]) driverStops[s.driver_name] = []
      driverStops[s.driver_name].push(s)
    })

    const lines = []
    const pharmacyDrivers = drivers.filter(d =>
      d.pharmacy === myPharmacy || d.pharmacy === 'Both'
    )

    for (const d of pharmacyDrivers) {
      const myStops = driverStops[d.driver_name] || []
      if (myStops.length === 0) continue

      if (overrides[d.driver_name]) {
        lines.push({ name: d.driver_name, text: overrides[d.driver_name].display_text, stops: myStops.length })
        continue
      }

      const routeCounts = {}
      myStops.forEach(s => {
        const route = zipToRoute[s.zip] || ''
        if (route) routeCounts[route] = (routeCounts[route] || 0) + 1
      })
      const homeRoute = Object.entries(routeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || ''

      const extraZips = new Set()
      myStops.forEach(s => {
        const route = zipToRoute[s.zip] || ''
        if (route && route !== homeRoute) extraZips.add(s.zip)
      })

      const text = homeRoute + (extraZips.size > 0 ? ', ' + [...extraZips].sort().join(', ') : '')
      lines.push({ name: d.driver_name, text, stops: myStops.length })
    }

    return lines
  }, [stops, rules, drivers, overrides, myPharmacy])

  function handleCopy() {
    const text = sortLines.map(l => `${l.name.toUpperCase()} — ${l.text}`).join('\n')
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>Loading sort list...</div>

  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--gray-200)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-200)' }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: myPharmacy === 'Aultman' ? '#16a34a' : '#3b82f6' }}>
          {myPharmacy === 'SHSP' ? '💊' : '🏥'} {myPharmacy} Sort List
        </h3>
        <button onClick={handleCopy} style={{
          padding: '4px 12px', fontSize: 11, fontWeight: 600, border: '1px solid var(--gray-200)',
          borderRadius: 4, background: copied ? '#dcfce7' : 'white', color: copied ? '#16a34a' : '#6b7280', cursor: 'pointer',
        }}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      {sortLines.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>No sort data for today</div>
      )}
      {sortLines.map(l => (
        <div key={l.name} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px',
          borderBottom: '1px solid var(--gray-100)',
          fontWeight: l.name === driverName ? 700 : 400,
          background: l.name === driverName ? '#eef4ff' : 'transparent',
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-900)', minWidth: 80 }}>{l.name.toUpperCase()}</span>
          <span style={{ color: 'var(--gray-300)' }}>—</span>
          <span style={{ fontSize: 13, color: 'var(--gray-600)', flex: 1 }}>{l.text || 'No route'}</span>
          <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>{l.stops}</span>
        </div>
      ))}
    </div>
  )
}
