import React, { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { dbDelete, dbInsert } from '../../lib/db'

export default function UnassignedZips() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [drivers, setDrivers] = useState([])
  const [assigning, setAssigning] = useState(null) // zip|pharmacy key being assigned
  const [expanded, setExpanded] = useState(null) // zip|pharmacy key expanded
  const [toast, setToast] = useState(null)

  useEffect(() => {
    loadUnassigned()
  }, [])

  async function loadUnassigned() {
    setLoading(true)
    try {
      // Only look at recent stops (last 30 days), exclude manual stops and deleted
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 30)
      const cutoffStr = cutoff.toISOString().split('T')[0]
      const [stopsRes, rulesRes, driversRes] = await Promise.all([
        supabase.from('daily_stops').select('zip, pharmacy, city, patient_name, order_id, address').gte('delivery_date', cutoffStr).not('status', 'eq', 'DELETED').not('order_id', 'like', 'M%').order('delivery_date', { ascending: false }),
        supabase.from('routing_rules').select('zip_code, pharmacy'),
        supabase.from('drivers').select('driver_name, driver_number, pharmacy').eq('active', true).order('driver_name'),
      ])

      setDrivers(driversRes.data || [])

      const ruleSet = new Set((rulesRes.data || []).map(r => `${r.zip_code}|${r.pharmacy}`))

      const unmatched = {}
      ;(stopsRes.data || []).forEach(s => {
        const key = `${s.zip}|${s.pharmacy}`
        if (ruleSet.has(key)) return
        if (!unmatched[key]) unmatched[key] = { zip: s.zip, pharmacy: s.pharmacy, city: s.city || '', count: 0, orders: [] }
        unmatched[key].count++
        unmatched[key].orders.push(s)
      })

      setData(Object.values(unmatched).sort((a, b) => b.count - a.count))
    } catch {
      setData([])
    } finally {
      setLoading(false)
    }
  }

  async function handleAssign(row, driverName) {
    if (!driverName) return
    const key = `${row.zip}|${row.pharmacy}`
    setAssigning(key)
    try {
      const driver = drivers.find(d => d.driver_name === driverName)
      // 1. Create routing rule
      await dbInsert('routing_rules', [{
        zip_code: row.zip,
        pharmacy: row.pharmacy,
        driver_name: driverName,
        driver_number: driver?.driver_number || '',
        city: row.city,
      }])

      // 2. Assign all current stops with this ZIP to this driver
      const today = new Date().toISOString().split('T')[0]
      await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: 'daily_stops',
          operation: 'update',
          data: { driver_name: driverName, driver_number: driver?.driver_number || '' },
          match: { zip: row.zip, driver_name: 'Unassigned' },
        }),
      })

      setData(prev => prev.filter(x => !(x.zip === row.zip && x.pharmacy === row.pharmacy)))
      setToast(`${row.zip} → ${driverName} (rule created + ${row.count} orders assigned)`)
      setTimeout(() => setToast(null), 3000)
    } catch (e) {
      setToast(`Error: ${e.message}`)
      setTimeout(() => setToast(null), 3000)
    } finally {
      setAssigning(null)
    }
  }

  if (loading) return <div className="dispatch__loading"><div className="dispatch__spinner" />Loading unassigned...</div>

  return (
    <div style={{ padding: '0 0 24px' }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Unassigned ZIPs</h2>
      <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 16 }}>Pick a driver to create a routing rule and assign all orders for that ZIP.</p>

      {toast && <div style={{ background: '#0A2463', color: '#fff', padding: '10px 16px', borderRadius: 10, marginBottom: 12, fontSize: 13, fontWeight: 600 }}>{toast}</div>}

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
              <th style={{ textAlign: 'left', padding: '8px 10px', color: '#6b7280', fontWeight: 600 }}>Assign To</th>
              <th style={{ padding: '8px 10px' }}></th>
            </tr>
          </thead>
          <tbody>
            {data.map(d => {
              const key = `${d.zip}|${d.pharmacy}`
              const isAssigning = assigning === key
              return (<React.Fragment key={key}>
                <tr style={{ borderBottom: '1px solid #f3f4f6', opacity: isAssigning ? 0.5 : 1 }}>
                  <td style={{ padding: '8px 10px', fontWeight: 600 }}>{d.zip}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: d.pharmacy === 'Aultman' ? '#dbeafe' : '#f3f4f6', color: d.pharmacy === 'Aultman' ? '#2563eb' : '#374151' }}>{d.pharmacy}</span>
                  </td>
                  <td style={{ padding: '8px 10px', color: '#6b7280' }}>{d.city}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                    <button onClick={() => setExpanded(expanded === key ? null : key)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, color: '#dc2626', fontSize: 13 }}>
                      {d.count} {expanded === key ? '▲' : '▼'}
                    </button>
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <select
                      style={{ padding: '4px 8px', fontSize: 12, borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', minWidth: 120 }}
                      defaultValue=""
                      disabled={isAssigning}
                      onChange={(e) => handleAssign(d, e.target.value)}
                    >
                      <option value="" disabled>Select driver...</option>
                      {drivers.map(drv => (
                        <option key={drv.driver_name} value={drv.driver_name}>{drv.driver_name}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <button
                      style={{ background: 'none', border: '1px solid #fca5a5', borderRadius: 4, color: '#dc2626', fontSize: 11, fontWeight: 600, padding: '3px 10px', cursor: 'pointer' }}
                      onClick={async () => {
                        if (!confirm(`Delete ${d.count} orders for ZIP ${d.zip} (${d.pharmacy})?`)) return
                        for (const o of d.orders) {
                          await fetch('/api/db', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ table: 'daily_stops', operation: 'update', data: { status: 'DELETED' }, match: { order_id: o.order_id } }),
                          })
                        }
                        setData(prev => prev.filter(x => !(x.zip === d.zip && x.pharmacy === d.pharmacy)))
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
                {expanded === key && (
                  <tr>
                    <td colSpan={6} style={{ padding: '0 10px 12px', background: '#f9fafb' }}>
                      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginTop: 4 }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                            <th style={{ textAlign: 'left', padding: '4px 8px', color: '#9ca3af', fontWeight: 500 }}>Order #</th>
                            <th style={{ textAlign: 'left', padding: '4px 8px', color: '#9ca3af', fontWeight: 500 }}>Patient</th>
                            <th style={{ textAlign: 'left', padding: '4px 8px', color: '#9ca3af', fontWeight: 500 }}>Address</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.orders.map((o, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                              <td style={{ padding: '4px 8px', color: '#6b7280' }}>{o.order_id}</td>
                              <td style={{ padding: '4px 8px' }}>{o.patient_name}</td>
                              <td style={{ padding: '4px 8px', color: '#6b7280' }}>{o.address}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </React.Fragment>)
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
