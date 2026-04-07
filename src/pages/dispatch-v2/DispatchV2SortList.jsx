import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import DispatchV2Shell from '../../components/dispatch-v2/DispatchV2Shell'

export default function DispatchV2SortList() {
  const [activeTab, setActiveTab] = useState('SHSP')
  const [drivers, setDrivers] = useState([])
  const [sortData, setSortData] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [driversRes, sortRes] = await Promise.all([
      supabase.from('drivers').select('*').order('driver_name'),
      supabase.from('sort_lists').select('*'),
    ])
    setDrivers(driversRes.data || [])

    // Build sort data map: { pharmacy: { driverName: { cities: '', notes: '' } } }
    const map = { SHSP: {}, Aultman: {} }
    for (const row of (sortRes.data || [])) {
      const pharmacy = row.pharmacy || 'SHSP'
      if (!map[pharmacy]) map[pharmacy] = {}
      map[pharmacy][row.driver_name] = {
        id: row.id,
        cities: row.cities || '',
        notes: row.notes || '',
      }
    }
    setSortData(map)
    setLoading(false)
  }

  function getPharmacyDrivers() {
    return drivers.filter(d => {
      const pharmacy = d.pharmacy || d.origin_pharmacy || ''
      if (activeTab === 'Aultman') return pharmacy.toLowerCase().includes('aultman') || pharmacy === 'BOTH'
      return !pharmacy.toLowerCase().includes('aultman') || pharmacy === 'BOTH'
    })
  }

  function updateField(driverName, field, value) {
    setSortData(prev => ({
      ...prev,
      [activeTab]: {
        ...prev[activeTab],
        [driverName]: {
          ...(prev[activeTab]?.[driverName] || {}),
          [field]: value,
        },
      },
    }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const pharmacyData = sortData[activeTab] || {}
      for (const [driverName, data] of Object.entries(pharmacyData)) {
        if (data.id) {
          await fetch('/api/db', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              table: 'sort_lists',
              operation: 'update',
              data: { cities: data.cities || '', notes: data.notes || '' },
              match: { id: data.id },
            }),
          })
        } else {
          await fetch('/api/db', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              table: 'sort_lists',
              operation: 'upsert',
              data: {
                pharmacy: activeTab,
                driver_name: driverName,
                cities: data.cities || '',
                notes: data.notes || '',
              },
              onConflict: 'pharmacy,driver_name',
            }),
          })
        }
      }
      await loadData()
    } catch (err) {
      console.error('Save failed:', err)
    } finally {
      setSaving(false)
    }
  }

  const pharmacyDrivers = getPharmacyDrivers()

  return (
    <DispatchV2Shell title="Sort List">
      {/* Pharmacy tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['SHSP', 'Aultman'].map(tab => (
          <button
            key={tab}
            className={`dv2-btn dv2-btn-sm ${activeTab === tab ? 'dv2-btn-navy' : 'dv2-btn-ghost'}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'SHSP' ? 'SHSP Pharmacy' : 'Aultman Pharmacy'}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          className="dv2-btn dv2-btn-emerald dv2-btn-sm"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.4)' }}>Loading...</div>
      ) : (
        <div className="dv2-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="dv2-table">
            <thead>
              <tr>
                <th style={{ width: 160 }}>Driver</th>
                {activeTab === 'Aultman' ? (
                  <>
                    <th>Cities</th>
                    <th style={{ width: 200 }}>Notes</th>
                  </>
                ) : (
                  <>
                    <th>Sort Details</th>
                    <th style={{ width: 200 }}>Notes</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {pharmacyDrivers.map(d => {
                const data = sortData[activeTab]?.[d.driver_name] || {}
                return (
                  <tr key={d.driver_name}>
                    <td style={{ fontWeight: 600, color: '#fff' }}>{d.driver_name}</td>
                    <td>
                      {activeTab === 'Aultman' ? (
                        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
                          {data.cities || <span style={{ color: 'rgba(255,255,255,0.2)' }}>No cities assigned</span>}
                        </span>
                      ) : (
                        <input
                          className="dv2-input"
                          style={{ width: '100%', fontSize: 12, padding: '6px 10px' }}
                          value={data.cities || ''}
                          onChange={e => updateField(d.driver_name, 'cities', e.target.value)}
                          placeholder="Enter sort details..."
                        />
                      )}
                    </td>
                    <td>
                      <input
                        className="dv2-input"
                        style={{ width: '100%', fontSize: 12, padding: '6px 10px' }}
                        value={data.notes || ''}
                        onChange={e => updateField(d.driver_name, 'notes', e.target.value)}
                        placeholder="Notes..."
                      />
                    </td>
                  </tr>
                )
              })}
              {pharmacyDrivers.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ textAlign: 'center', padding: 24, color: 'rgba(255,255,255,0.3)' }}>
                    No drivers for this pharmacy
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
