import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { dbDelete } from '../../lib/db'

export default function UnassignedZips() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadUnassigned()
  }, [])

  async function loadUnassigned() {
    setLoading(true)
    try {
      const [stopsRes, rulesRes] = await Promise.all([
        supabase.from('daily_stops').select('zip, pharmacy, city, patient_name, order_id, address').order('delivery_date', { ascending: false }).limit(5000),
        supabase.from('routing_rules').select('zip_code, pharmacy'),
      ])

      const ruleSet = new Set((rulesRes.data || []).map(r => `${r.zip_code}|${r.pharmacy}`))

      const unmatched = {}
      ;(stopsRes.data || []).forEach(s => {
        const key = `${s.zip}|${s.pharmacy}`
        if (ruleSet.has(key)) return
        if (!unmatched[key]) unmatched[key] = { zip: s.zip, pharmacy: s.pharmacy, city: s.city || '', count: 0, orders: [] }
        unmatched[key].count++
        if (unmatched[key].orders.length < 5) unmatched[key].orders.push(s)
      })

      setData(Object.values(unmatched).sort((a, b) => b.count - a.count))
    } catch {
      setData([])
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="dispatch__loading"><div className="dispatch__spinner" />Loading unassigned...</div>

  return (
    <div style={{ padding: '0 0 24px' }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Unassigned ZIPs</h2>
      <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 16 }}>ZIPs from recent orders that don't have routing rules. Add them in Routing Rules to auto-assign.</p>

      {(!data || data.length === 0) ? (
        <p style={{ color: '#6b7280', fontSize: 14 }}>All ZIPs have routing rules.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ textAlign: 'left', padding: '8px 10px', color: '#6b7280', fontWeight: 600 }}>ZIP</th>
              <th style={{ textAlign: 'left', padding: '8px 10px', color: '#6b7280', fontWeight: 600 }}>Pharmacy</th>
              <th style={{ textAlign: 'left', padding: '8px 10px', color: '#6b7280', fontWeight: 600 }}>City</th>
              <th style={{ textAlign: 'right', padding: '8px 10px', color: '#6b7280', fontWeight: 600 }}>Orders</th>
              <th style={{ padding: '8px 10px' }}></th>
            </tr>
          </thead>
          <tbody>
            {data.map(d => (
              <tr key={`${d.zip}|${d.pharmacy}`} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '8px 10px', fontWeight: 600 }}>{d.zip}</td>
                <td style={{ padding: '8px 10px' }}><span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: d.pharmacy === 'Aultman' ? '#dbeafe' : '#f3f4f6', color: d.pharmacy === 'Aultman' ? '#2563eb' : '#374151' }}>{d.pharmacy}</span></td>
                <td style={{ padding: '8px 10px', color: '#6b7280' }}>{d.city}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: '#dc2626' }}>{d.count}</td>
                <td style={{ padding: '8px 10px' }}>
                  <button
                    style={{ background: 'none', border: '1px solid #fca5a5', borderRadius: 4, color: '#dc2626', fontSize: 11, fontWeight: 600, padding: '3px 10px', cursor: 'pointer' }}
                    onClick={async () => {
                      if (!confirm(`Delete ${d.count} orders for ZIP ${d.zip} (${d.pharmacy})?`)) return
                      const ids = d.orders.map(o => o.order_id)
                      for (const id of ids) {
                        await dbDelete('daily_stops', { order_id: id, zip: d.zip })
                      }
                      await dbDelete('daily_stops', { zip: d.zip, pharmacy: d.pharmacy })
                      setData(prev => prev.filter(x => !(x.zip === d.zip && x.pharmacy === d.pharmacy)))
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
