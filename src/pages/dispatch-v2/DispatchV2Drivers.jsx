import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import DispatchV2Shell from '../../components/dispatch-v2/DispatchV2Shell'

export default function DispatchV2Drivers() {
  const [drivers, setDrivers] = useState([])
  const [todayStops, setTodayStops] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDrivers()
  }, [])

  async function loadDrivers() {
    setLoading(true)
    const today = new Date().toLocaleDateString('en-CA')

    const [driversRes, stopsRes] = await Promise.all([
      supabase.from('drivers').select('*').order('driver_name'),
      supabase.from('daily_stops').select('driver_name, status, cold_chain').eq('delivery_date', today),
    ])

    setDrivers(driversRes.data || [])

    // Group stops by driver
    const grouped = {}
    for (const s of (stopsRes.data || [])) {
      if (!s.driver_name) continue
      if (!grouped[s.driver_name]) {
        grouped[s.driver_name] = { total: 0, delivered: 0, pending: 0, cold: 0 }
      }
      grouped[s.driver_name].total++
      if (s.cold_chain) grouped[s.driver_name].cold++
      if (s.status === 'delivered') {
        grouped[s.driver_name].delivered++
      } else {
        grouped[s.driver_name].pending++
      }
    }
    setTodayStops(grouped)
    setLoading(false)
  }

  return (
    <DispatchV2Shell title="Drivers">
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.4)' }}>
          Loading drivers...
        </div>
      ) : (
        <div className="dv2-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="dv2-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Today's Stops</th>
                <th>Delivered</th>
                <th>Pending</th>
                <th>Phone</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map(d => {
                const stats = todayStops[d.driver_name] || { total: 0, delivered: 0, pending: 0 }
                return (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 600, color: '#fff' }}>{d.driver_name}</td>
                    <td>{stats.total}{stats.cold > 0 && <span style={{ color: '#60a5fa', fontSize: 12, marginLeft: 4 }}>({stats.cold})</span>}</td>
                    <td>{stats.delivered}</td>
                    <td>{stats.pending}</td>
                    <td>{d.phone || '-'}</td>
                    <td>
                      <span className={`dv2-badge ${d.active !== false ? 'dv2-badge-emerald' : 'dv2-badge-amber'}`}>
                        {d.active !== false ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {drivers.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'rgba(255,255,255,0.3)' }}>
                    No drivers found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </DispatchV2Shell>
  )
}
