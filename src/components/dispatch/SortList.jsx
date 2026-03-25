import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import './SortList.css'

export default function SortList({ deliveryDate }) {
  const [stops, setStops] = useState([])
  const [rules, setRules] = useState([])
  const [drivers, setDrivers] = useState([])
  const [overrides, setOverrides] = useState({})
  const [editKey, setEditKey] = useState(null)
  const [editVal, setEditVal] = useState('')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [deliveryDate])

  async function loadData() {
    setLoading(true)
    const dateStr = deliveryDate || new Date().toISOString().split('T')[0]
    const [stopsRes, rulesRes, driversRes, overridesRes] = await Promise.all([
      supabase.from('daily_stops').select('driver_name, zip, pharmacy, city').eq('delivery_date', dateStr),
      supabase.from('routing_rules').select('zip_code, route, pharmacy'),
      supabase.from('drivers').select('driver_name, pharmacy').eq('active', true),
      supabase.from('sort_list').select('*').eq('delivery_date', dateStr),
    ])
    setStops(stopsRes.data || [])
    setRules(rulesRes.data || [])
    setDrivers(driversRes.data || [])

    const ov = {}
    ;(overridesRes.data || []).forEach(o => { ov[`${o.pharmacy}|${o.driver_name}`] = o })
    setOverrides(ov)
    setLoading(false)
  }

  // Build ZIP → home route lookup
  const zipToRoute = useMemo(() => {
    const map = {}
    rules.forEach(r => { map[r.zip_code] = r.route || '' })
    return map
  }, [rules])

  // Build ZIP → home driver (who normally has this ZIP on majority of days)
  const zipToHomeDriver = useMemo(() => {
    const map = {}
    rules.forEach(r => {
      // Count which driver appears most across days
      const counts = {}
      ;['mon','tue','wed','thu','fri'].forEach(day => {
        // We don't have day columns easily here, so use route as proxy
      })
      map[r.zip_code] = r.route
    })
    return map
  }, [rules])

  // Build sort list for each pharmacy
  const sortData = useMemo(() => {
    const result = { SHSP: [], Aultman: [] }

    // Group stops by driver
    const driverStops = {}
    stops.forEach(s => {
      if (!driverStops[s.driver_name]) driverStops[s.driver_name] = []
      driverStops[s.driver_name].push(s)
    })

    // Get each driver's home route from their most common ZIP route
    const driverHomeRoute = {}
    for (const [name, driverStopList] of Object.entries(driverStops)) {
      const routeCounts = {}
      driverStopList.forEach(s => {
        const route = zipToRoute[s.zip] || ''
        if (route) routeCounts[route] = (routeCounts[route] || 0) + 1
      })
      const topRoute = Object.entries(routeCounts).sort((a, b) => b[1] - a[1])[0]
      driverHomeRoute[name] = topRoute ? topRoute[0] : ''
    }

    // For each active driver with stops, build their sort line
    for (const d of drivers) {
      const name = d.driver_name
      const pharmacy = d.pharmacy || 'SHSP'
      const myStops = driverStops[name] || []
      if (myStops.length === 0) continue

      const homeRoute = driverHomeRoute[name] || ''
      const overrideKey = `${pharmacy}|${name}`

      // Check for override
      if (overrides[overrideKey]) {
        const targetPharmacy = pharmacy === 'Aultman' ? 'Aultman' :
                              pharmacy === 'Both' ? 'SHSP' : 'SHSP'
        if (result[targetPharmacy]) {
          result[targetPharmacy].push({
            name, homeRoute,
            displayText: overrides[overrideKey].display_text,
            isOverride: true,
            stopCount: myStops.length,
            pharmacy: targetPharmacy,
          })
        }
        continue
      }

      // Find out-of-zone ZIPs
      const extraZips = new Set()
      myStops.forEach(s => {
        const route = zipToRoute[s.zip] || ''
        if (route && route !== homeRoute) {
          extraZips.add(s.zip)
        }
      })

      const displayText = homeRoute +
        (extraZips.size > 0 ? ', ' + [...extraZips].sort().join(', ') : '')

      const targetPharmacy = pharmacy === 'Aultman' ? 'Aultman' :
                            pharmacy === 'Both' ? 'SHSP' : 'SHSP'

      if (result[targetPharmacy]) {
        result[targetPharmacy].push({
          name, homeRoute, displayText, isOverride: false,
          stopCount: myStops.length, extraZips: [...extraZips],
          pharmacy: targetPharmacy,
        })
      }

      // If driver serves Both, also add to Aultman if they have Aultman stops
      if (pharmacy === 'Both') {
        const aultmanStops = myStops.filter(s => s.pharmacy === 'Aultman')
        if (aultmanStops.length > 0 && !result.Aultman.find(r => r.name === name)) {
          result.Aultman.push({
            name, homeRoute, displayText, isOverride: false,
            stopCount: aultmanStops.length, extraZips: [...extraZips],
            pharmacy: 'Aultman',
          })
        }
      }
    }

    return result
  }, [stops, rules, drivers, overrides, zipToRoute])

  async function handleSaveOverride(pharmacy, driverName) {
    setSaving(true)
    const dateStr = deliveryDate || new Date().toISOString().split('T')[0]
    try {
      await supabase.from('sort_list').upsert({
        delivery_date: dateStr,
        pharmacy,
        driver_name: driverName,
        display_text: editVal,
      }, { onConflict: 'delivery_date,pharmacy,driver_name' })
      setEditKey(null)
      loadData()
    } catch {}
    setSaving(false)
  }

  function handleCopy(pharmacy) {
    const lines = sortData[pharmacy].map(d =>
      `${d.name.toUpperCase()} — ${d.displayText}`
    ).join('\n')
    navigator.clipboard.writeText(lines)
    setCopied(pharmacy)
    setTimeout(() => setCopied(null), 2000)
  }

  if (loading) return <div className="sl__loading"><div className="dispatch__spinner" />Loading sort list...</div>

  return (
    <div className="sl">
      <div className="sl__columns">
        {['SHSP', 'Aultman'].map(pharmacy => (
          <div key={pharmacy} className="sl__column">
            <div className="sl__col-header">
              <h3 className={`sl__col-title sl__col-title--${pharmacy.toLowerCase()}`}>
                {pharmacy === 'SHSP' ? '💊 SHSP Sort' : '🏥 Aultman Sort'}
              </h3>
              <button
                className={`sl__copy ${copied === pharmacy ? 'sl__copy--done' : ''}`}
                onClick={() => handleCopy(pharmacy)}
              >
                {copied === pharmacy ? 'Copied!' : 'Copy'}
              </button>
            </div>

            {sortData[pharmacy].length === 0 && (
              <div className="sl__empty">No {pharmacy} drivers today</div>
            )}

            {sortData[pharmacy].map(d => {
              const key = `${pharmacy}|${d.name}`
              const isEditing = editKey === key

              return (
                <div key={d.name} className="sl__row">
                  {isEditing ? (
                    <div className="sl__edit">
                      <span className="sl__driver">{d.name.toUpperCase()}</span>
                      <span className="sl__sep">—</span>
                      <input
                        className="sl__edit-input"
                        value={editVal}
                        onChange={e => setEditVal(e.target.value)}
                        autoFocus
                        onKeyDown={e => e.key === 'Enter' && handleSaveOverride(pharmacy, d.name)}
                      />
                      <button className="sl__edit-save" onClick={() => handleSaveOverride(pharmacy, d.name)} disabled={saving}>&#10003;</button>
                      <button className="sl__edit-cancel" onClick={() => setEditKey(null)}>&#10005;</button>
                    </div>
                  ) : (
                    <div className="sl__display" onClick={() => { setEditKey(key); setEditVal(d.displayText) }}>
                      <span className="sl__driver">{d.name.toUpperCase()}</span>
                      <span className="sl__sep">—</span>
                      <span className="sl__route">{d.displayText || 'No route'}</span>
                      {d.extraZips?.length > 0 && (
                        <span className="sl__extra-badge">{d.extraZips.length} extra</span>
                      )}
                      <span className="sl__stops">{d.stopCount}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
