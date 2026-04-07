import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import DispatchV2Shell from '../../components/dispatch-v2/DispatchV2Shell'

export default function DispatchV2RoutingRules() {
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterDriver, setFilterDriver] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newRule, setNewRule] = useState({ zip: '', city: '', driver_name: '', pharmacy: 'SHSP', priority: 1 })
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadRules() }, [])

  async function loadRules() {
    setLoading(true)
    const { data } = await supabase
      .from('routing_rules')
      .select('*')
      .order('zip', { ascending: true })
    setRules(data || [])
    setLoading(false)
  }

  const driverNames = [...new Set(rules.map(r => r.driver_name).filter(Boolean))].sort()

  const filtered = rules.filter(r => {
    if (filterDriver && r.driver_name !== filterDriver) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        (r.zip || '').toLowerCase().includes(q) ||
        (r.city || '').toLowerCase().includes(q) ||
        (r.driver_name || '').toLowerCase().includes(q)
      )
    }
    return true
  })

  async function handleAddRule() {
    if (!newRule.zip && !newRule.city) return
    setSaving(true)
    try {
      await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: 'routing_rules',
          operation: 'insert',
          data: {
            zip: newRule.zip || null,
            city: newRule.city || null,
            driver_name: newRule.driver_name || null,
            pharmacy: newRule.pharmacy || 'SHSP',
            priority: parseInt(newRule.priority) || 1,
          },
        }),
      })
      setNewRule({ zip: '', city: '', driver_name: '', pharmacy: 'SHSP', priority: 1 })
      setShowAdd(false)
      await loadRules()
    } catch (err) {
      console.error('Add rule failed:', err)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteRule(id) {
    if (!confirm('Delete this routing rule?')) return
    await fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: 'routing_rules',
        operation: 'delete',
        match: { id },
      }),
    })
    await loadRules()
  }

  return (
    <DispatchV2Shell title="Routing Rules">
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          className="dv2-input"
          placeholder="Search ZIP, city, or driver..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: 220 }}
        />
        <select
          className="dv2-select"
          value={filterDriver}
          onChange={e => setFilterDriver(e.target.value)}
        >
          <option value="">All Drivers</option>
          {driverNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
          {filtered.length} rules{search || filterDriver ? ' (filtered)' : ''}
        </span>
        <button
          className="dv2-btn dv2-btn-navy dv2-btn-sm"
          onClick={() => setShowAdd(!showAdd)}
        >
          {showAdd ? 'Cancel' : '+ Add Rule'}
        </button>
      </div>

      {showAdd && (
        <div className="dv2-card" style={{ marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4, textTransform: 'uppercase' }}>ZIP</label>
            <input className="dv2-input" style={{ width: 100, fontSize: 12, padding: '6px 10px' }} value={newRule.zip} onChange={e => setNewRule({ ...newRule, zip: e.target.value })} placeholder="44301" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4, textTransform: 'uppercase' }}>City</label>
            <input className="dv2-input" style={{ width: 140, fontSize: 12, padding: '6px 10px' }} value={newRule.city} onChange={e => setNewRule({ ...newRule, city: e.target.value })} placeholder="Akron" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4, textTransform: 'uppercase' }}>Driver</label>
            <input className="dv2-input" style={{ width: 120, fontSize: 12, padding: '6px 10px' }} value={newRule.driver_name} onChange={e => setNewRule({ ...newRule, driver_name: e.target.value })} placeholder="Adam" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4, textTransform: 'uppercase' }}>Pharmacy</label>
            <select className="dv2-select" style={{ fontSize: 12, padding: '6px 10px' }} value={newRule.pharmacy} onChange={e => setNewRule({ ...newRule, pharmacy: e.target.value })}>
              <option value="SHSP">SHSP</option>
              <option value="Aultman">Aultman</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4, textTransform: 'uppercase' }}>Priority</label>
            <input className="dv2-input" type="number" style={{ width: 60, fontSize: 12, padding: '6px 10px' }} value={newRule.priority} onChange={e => setNewRule({ ...newRule, priority: e.target.value })} />
          </div>
          <button className="dv2-btn dv2-btn-emerald dv2-btn-sm" onClick={handleAddRule} disabled={saving}>
            {saving ? 'Adding...' : 'Add'}
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.4)' }}>Loading rules...</div>
      ) : (
        <div className="dv2-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="dv2-table">
            <thead>
              <tr>
                <th>ZIP</th>
                <th>City</th>
                <th>Driver</th>
                <th>Pharmacy</th>
                <th>Priority</th>
                <th style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600, color: '#fff', fontFamily: 'monospace' }}>{r.zip || '-'}</td>
                  <td>{r.city || '-'}</td>
                  <td style={{ color: '#fff', fontWeight: 500 }}>{r.driver_name || '-'}</td>
                  <td>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                      background: r.pharmacy === 'Aultman' ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)',
                      color: r.pharmacy === 'Aultman' ? '#f87171' : '#60a5fa',
                    }}>
                      {r.pharmacy || 'SHSP'}
                    </span>
                  </td>
                  <td>{r.priority || 1}</td>
                  <td>
                    <button
                      onClick={() => handleDeleteRule(r.id)}
                      style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 14 }}
                      title="Delete rule"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'rgba(255,255,255,0.3)' }}>
                    No routing rules found
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
