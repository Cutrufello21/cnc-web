import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import './SortList.css'

async function apiPost(body) {
  return fetch('/api/sort-list', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function logDecision(data) {
  fetch('/api/dispatch-log-decision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).catch(() => {})
}

export default function SortList({ deliveryDate }) {
  const [lines, setLines] = useState({ SHSP: [], Aultman: [] })
  const [loading, setLoading] = useState(true)
  const [editKey, setEditKey] = useState(null)
  const [editVal, setEditVal] = useState('')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(null)
  const [adding, setAdding] = useState(null)
  const [newLine, setNewLine] = useState('')

  const dateStr = deliveryDate || new Date().toISOString().split('T')[0]

  useEffect(() => { loadData() }, [dateStr])

  // Build SHSP sort description from routing rules
  // dayCol = 'mon','tue','wed','thu','fri' — used to determine zone ownership
  function buildShspDescription(driverName, stopZips, routingRules, allDriverZips, dayCol, driverNumber) {
    if (!stopZips || stopZips.size === 0) return driverName.toUpperCase()

    // Determine which zone this driver owns based on routing_rules day assignment
    // Count how many ZIPs in each zone are assigned to this driver for this day
    const zoneOwnership = {}
    const driverRef = driverNumber ? `${driverName}/${driverNumber}` : driverName
    for (const rule of routingRules) {
      const assigned = rule[dayCol] || ''
      const zone = rule.route
      if (!zone || zone === 'Local' || zone === 'Overflow') continue
      if (!zoneOwnership[zone]) zoneOwnership[zone] = 0
      if (assigned.includes(driverName)) zoneOwnership[zone]++
    }
    // Driver's base zone = zone where they're assigned the most ZIPs
    let baseZone = null
    let baseCount = 0
    for (const [zone, count] of Object.entries(zoneOwnership)) {
      if (count > baseCount) { baseZone = zone; baseCount = count }
    }

    // Map each stop ZIP to its zone
    const zoneStops = {}
    const unmappedZips = new Set()
    for (const zip of stopZips) {
      const rule = routingRules.find(r => r.zip_code === zip)
      if (rule) {
        const zone = rule.route || 'Unknown'
        if (!zoneStops[zone]) zoneStops[zone] = []
        zoneStops[zone].push({ zip, city: rule.city || '' })
      } else {
        unmappedZips.add(zip)
      }
    }

    // Collect route names, city names, and ZIP codes separately
    const routeParts = [] // base zone + other zone names
    const cityParts = new Set() // city names (sorted alpha)
    const zipParts = new Set() // ZIP codes (sorted ascending)

    // Base route name
    if (baseZone) routeParts.push(baseZone)

    // Check for exclusions from base zone (deduplicated by city name)
    const exclusionSet = new Set()
    if (baseZone) {
      const allBaseZips = routingRules.filter(r => r.route === baseZone).map(r => r.zip_code)
      for (const bz of allBaseZips) {
        if (!stopZips.has(bz)) {
          const otherHasIt = Object.entries(allDriverZips || {}).some(([other, zips]) => other !== driverName && zips.has(bz))
          if (otherHasIt) {
            const rule = routingRules.find(r => r.zip_code === bz)
            const label = rule?.city && rule.city.toLowerCase() !== 'akron' ? rule.city : bz
            exclusionSet.add(label)
          }
        }
      }
    }

    // Other named zones — collect city names
    for (const zone of Object.keys(zoneStops).sort()) {
      if (zone === baseZone || zone === 'Local' || zone === 'Overflow') continue
      for (const s of zoneStops[zone]) {
        if (!s.city || s.city.toLowerCase() === 'akron') zipParts.add(s.zip)
        else cityParts.add(s.city)
      }
    }

    // Overflow → city names (never "Akron", show ZIP instead)
    if (zoneStops['Overflow']) {
      for (const s of zoneStops['Overflow']) {
        if (!s.city || s.city.toLowerCase() === 'akron') zipParts.add(s.zip)
        else cityParts.add(s.city)
      }
    }

    // Local → ZIP codes
    if (zoneStops['Local']) {
      for (const s of zoneStops['Local']) zipParts.add(s.zip)
    }

    // Unmapped → ZIP codes
    for (const zip of unmappedZips) zipParts.add(zip)

    // Build final: route names → cities (alpha) → ZIPs (ascending)
    const allParts = [
      ...routeParts,
      ...[...cityParts].sort((a, b) => a.localeCompare(b)),
      ...[...zipParts].sort((a, b) => a.localeCompare(b)),
    ]

    if (allParts.length === 0) return driverName.toUpperCase()

    let desc = `${driverName.toUpperCase()} — ${allParts.join(', ')}`
    if (exclusionSet.size > 0) {
      desc += ` (no ${[...exclusionSet].sort().join(', ')})`
    }
    return desc
  }

  async function loadData() {
    setLoading(true)
    const [sortRes, stopsRes, rulesRes] = await Promise.all([
      supabase.from('sort_list').select('*').eq('delivery_date', dateStr).order('sort_order', { ascending: true }),
      supabase.from('daily_stops').select('driver_name, pharmacy, city, zip').eq('delivery_date', dateStr),
      supabase.from('routing_rules').select('zip_code, route, city, pharmacy, mon, tue, wed, thu, fri').eq('pharmacy', 'SHSP'),
    ])

    const existing = sortRes.data || []
    const routingRules = rulesRes.data || []
    const result = { SHSP: [], Aultman: [] }
    existing.forEach(r => { if (result[r.pharmacy]) result[r.pharmacy].push(r) })

    const allStops = stopsRes.data || []
    const aultmanExists = existing.some(r => r.pharmacy === 'Aultman')
    const shspExists = existing.some(r => r.pharmacy === 'SHSP')

    // Determine day column for routing rules lookup
    const dayOfWeek = new Date(dateStr + 'T12:00:00').getDay()
    const dayCol = ['sun','mon','tue','wed','thu','fri','sat'][dayOfWeek] || 'mon'

    // Build current city maps from daily_stops for Aultman
    function buildCityMap(pharmacy) {
      const map = {}
      allStops.forEach(s => {
        if (s.pharmacy !== pharmacy) return
        if (!map[s.driver_name]) map[s.driver_name] = new Set()
        if (s.city) map[s.driver_name].add(s.city.toUpperCase().trim())
      })
      return map
    }

    // Build ZIP maps from daily_stops for SHSP
    function buildZipMap() {
      const map = {}
      allStops.forEach(s => {
        if (s.pharmacy !== 'SHSP') return
        if (!map[s.driver_name]) map[s.driver_name] = new Set()
        if (s.zip) map[s.driver_name].add(s.zip.trim())
      })
      return map
    }

    for (const pharmacy of ['Aultman', 'SHSP']) {
      const exists = pharmacy === 'Aultman' ? aultmanExists : shspExists
      const cityMap = buildCityMap(pharmacy)
      const zipMap = pharmacy === 'SHSP' ? buildZipMap() : {}

      if (!exists && allStops.length > 0) {
        // First time — insert all rows
        const rows = []
        let order = 0
        const driverNames = pharmacy === 'SHSP' ? Object.keys(zipMap) : Object.keys(cityMap)
        for (const name of driverNames.sort((a, b) => a.localeCompare(b))) {
          let displayText
          if (pharmacy === 'Aultman') {
            const cityList = [...(cityMap[name] || [])].sort().join(', ')
            displayText = `${name.toUpperCase()} — ${cityList}`
          } else {
            displayText = buildShspDescription(name, zipMap[name], routingRules, zipMap, dayCol)
          }
          rows.push({
            delivery_date: dateStr, pharmacy, driver_name: name,
            display_text: displayText, sort_order: order++,
            checked: false, late_start: false,
          })
        }
        if (rows.length > 0) {
          await apiPost({ action: 'insert', rows })
          const { data: fresh } = await supabase.from('sort_list').select('*').eq('delivery_date', dateStr).eq('pharmacy', pharmacy).order('sort_order', { ascending: true })
          result[pharmacy] = fresh || []
        }
      } else if (exists && Object.keys(cityMap).length > 0) {
        // Rows exist — sync cities on existing rows + add new drivers
        const currentRows = result[pharmacy]
        const existingDrivers = new Set(currentRows.map(r => r.driver_name))

        // Update display_text for existing drivers
        // Rows with manual_override=true are never auto-updated
        for (const row of currentRows) {
          if (row.manual_override) continue
          let newText
          if (pharmacy === 'Aultman') {
            const cities = cityMap[row.driver_name]
            if (!cities) continue
            const cityList = [...cities].sort().join(', ')
            newText = `${row.driver_name.toUpperCase()} — ${cityList}`
          } else {
            const zips = zipMap[row.driver_name]
            if (!zips) continue
            newText = buildShspDescription(row.driver_name, zips, routingRules, zipMap, dayCol)
          }
          if (row.display_text !== newText) {
            await apiPost({ action: 'update', id: row.id, display_text: newText })
            row.display_text = newText
          }
        }

        // Add rows for new drivers not yet in the sort list
        const maxOrder = currentRows.reduce((m, l) => Math.max(m, l.sort_order || 0), 0)
        const newRows = []
        let order = maxOrder + 1
        const newDriverSource = pharmacy === 'SHSP' ? Object.entries(zipMap) : Object.entries(cityMap)
        for (const [name, data] of newDriverSource.sort((a, b) => a[0].localeCompare(b[0]))) {
          if (existingDrivers.has(name)) continue
          let displayText
          if (pharmacy === 'Aultman') {
            const cityList = [...data].sort().join(', ')
            displayText = `${name.toUpperCase()} — ${cityList}`
          } else {
            displayText = buildShspDescription(name, data, routingRules, zipMap, dayCol)
          }
          newRows.push({
            delivery_date: dateStr, pharmacy, driver_name: name,
            display_text: displayText, sort_order: order++,
            checked: false, late_start: false,
          })
        }
        if (newRows.length > 0) {
          await apiPost({ action: 'insert', rows: newRows })
        }

        // Reload fresh data for this pharmacy
        if (newRows.length > 0 || currentRows.some((r, i) => r.display_text !== (existing.find(e => e.id === r.id) || {}).display_text)) {
          const { data: fresh } = await supabase.from('sort_list').select('*').eq('delivery_date', dateStr).eq('pharmacy', pharmacy).order('sort_order', { ascending: true })
          result[pharmacy] = fresh || []
        }
      }
    }

    setLines(result)
    setLoading(false)
  }

  async function handleAdd(pharmacy) {
    if (!newLine.trim()) return
    setSaving(true)
    const maxOrder = lines[pharmacy].reduce((m, l) => Math.max(m, l.sort_order || 0), 0)
    await apiPost({
      action: 'insert',
      rows: [{
        delivery_date: dateStr, pharmacy, driver_name: newLine.trim(),
        display_text: newLine.trim(), sort_order: maxOrder + 1,
        checked: false, late_start: false,
      }],
    })
    logDecision({ action: 'log_sort_list', deliveryDate: dateStr, pharmacy, driverName: newLine.trim(), sortAction: 'add', detail: newLine.trim() })
    setNewLine('')
    setAdding(null)
    setSaving(false)
    loadData()
  }

  async function handleSave(id) {
    setSaving(true)
    const line = [...lines.SHSP, ...lines.Aultman].find(l => l.id === id)
    await apiPost({ action: 'update', id, display_text: editVal, manual_override: true })
    logDecision({ action: 'log_sort_list', deliveryDate: dateStr, pharmacy: line?.pharmacy, driverName: line?.driver_name, sortAction: 'edit', detail: editVal })
    setEditKey(null)
    setSaving(false)
    loadData()
  }

  async function handleToggleCheck(id, current) {
    const line = [...lines.SHSP, ...lines.Aultman].find(l => l.id === id)
    await apiPost({ action: 'update', id, checked: !current })
    logDecision({ action: 'log_sort_list', deliveryDate: dateStr, pharmacy: line?.pharmacy, driverName: line?.driver_name, sortAction: 'check', detail: !current ? 'checked' : 'unchecked' })
    setLines(prev => {
      const next = { ...prev }
      for (const p of ['SHSP', 'Aultman']) {
        next[p] = prev[p].map(l => l.id === id ? { ...l, checked: !current } : l)
      }
      return next
    })
  }

  async function handleToggleLate(id, current) {
    const line = [...lines.SHSP, ...lines.Aultman].find(l => l.id === id)
    await apiPost({ action: 'update', id, late_start: !current })
    logDecision({ action: 'log_sort_list', deliveryDate: dateStr, pharmacy: line?.pharmacy, driverName: line?.driver_name, sortAction: 'late_start', detail: !current ? '9AM' : 'normal' })
    setLines(prev => {
      const next = { ...prev }
      for (const p of ['SHSP', 'Aultman']) {
        next[p] = prev[p].map(l => l.id === id ? { ...l, late_start: !current } : l)
      }
      return next
    })
  }

  async function handleDelete(id) {
    const line = [...lines.SHSP, ...lines.Aultman].find(l => l.id === id)
    await apiPost({ action: 'delete', id })
    logDecision({ action: 'log_sort_list', deliveryDate: dateStr, pharmacy: line?.pharmacy, driverName: line?.driver_name, sortAction: 'delete', detail: line?.display_text })
    loadData()
  }

  function handleCopy(pharmacy) {
    const text = lines[pharmacy].map(l => {
      let line = l.display_text
      if (l.late_start) line += ' [9 AM]'
      return line
    }).join('\n')
    navigator.clipboard.writeText(text)
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
              <div className="sl__col-actions">
                <button className={`sl__copy ${copied === pharmacy ? 'sl__copy--done' : ''}`}
                  onClick={() => handleCopy(pharmacy)}>
                  {copied === pharmacy ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            {lines[pharmacy].length === 0 && !adding && (
              <div className="sl__empty">No entries — click + to add</div>
            )}

            {lines[pharmacy].map(line => {
              const isEditing = editKey === line.id
              return (
                <div key={line.id} className={`sl__row ${line.checked ? 'sl__row--checked' : ''} ${line.late_start ? 'sl__row--late' : ''}`}>
                  {isEditing ? (
                    <div className="sl__edit">
                      <input className="sl__edit-input" value={editVal}
                        onChange={e => setEditVal(e.target.value)} autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') handleSave(line.id); if (e.key === 'Escape') setEditKey(null) }}
                        onBlur={() => { if (editVal !== line.display_text) handleSave(line.id); else setEditKey(null) }} />
                      <button className="sl__edit-save" onClick={() => handleSave(line.id)} disabled={saving}>&#10003;</button>
                      <button className="sl__edit-cancel" onClick={() => setEditKey(null)}>&#10005;</button>
                    </div>
                  ) : (
                    <div className="sl__display">
                      <input
                        type="checkbox"
                        className="sl__check"
                        checked={!!line.checked}
                        onChange={() => handleToggleCheck(line.id, line.checked)}
                      />
                      <span
                        className={`sl__text ${line.checked ? 'sl__text--checked' : ''}`}
                        onClick={() => { setEditKey(line.id); setEditVal(line.display_text) }}
                      >
                        {line.display_text}
                      </span>
                      <button
                        className={`sl__late-btn ${line.late_start ? 'sl__late-btn--active' : ''}`}
                        onClick={() => handleToggleLate(line.id, line.late_start)}
                        title="Toggle 9 AM start"
                      >
                        9AM
                      </button>
                      <button className="sl__delete" onClick={() => handleDelete(line.id)}>&times;</button>
                    </div>
                  )}
                </div>
              )
            })}

            {adding === pharmacy ? (
              <div className="sl__add-form">
                <input className="sl__add-input" value={newLine} onChange={e => setNewLine(e.target.value)}
                  placeholder="BOBBY — West" autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleAdd(pharmacy); if (e.key === 'Escape') { setAdding(null); setNewLine('') } }} />
                <button className="sl__add-save" onClick={() => handleAdd(pharmacy)} disabled={saving || !newLine.trim()}>Add</button>
                <button className="sl__add-cancel" onClick={() => { setAdding(null); setNewLine('') }}>Cancel</button>
              </div>
            ) : (
              <button className="sl__add-btn" onClick={() => setAdding(pharmacy)}>+ Add Line</button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
