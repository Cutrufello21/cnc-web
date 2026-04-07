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

  async function loadData() {
    setLoading(true)
    const [sortRes, stopsRes] = await Promise.all([
      supabase.from('sort_list').select('*').eq('delivery_date', dateStr).order('sort_order', { ascending: true }),
      supabase.from('daily_stops').select('driver_name, pharmacy, city').eq('delivery_date', dateStr),
    ])

    const existing = sortRes.data || []
    const result = { SHSP: [], Aultman: [] }
    existing.forEach(r => { if (result[r.pharmacy]) result[r.pharmacy].push(r) })

    const allStops = stopsRes.data || []
    const aultmanExists = existing.some(r => r.pharmacy === 'Aultman')
    const shspExists = existing.some(r => r.pharmacy === 'SHSP')

    // Build current city maps from daily_stops for both pharmacies
    function buildCityMap(pharmacy) {
      const map = {}
      allStops.forEach(s => {
        if (s.pharmacy !== pharmacy) return
        if (!map[s.driver_name]) map[s.driver_name] = new Set()
        if (s.city) map[s.driver_name].add(s.city.toUpperCase().trim())
      })
      return map
    }

    for (const pharmacy of ['Aultman', 'SHSP']) {
      const exists = pharmacy === 'Aultman' ? aultmanExists : shspExists
      const cityMap = buildCityMap(pharmacy)

      if (!exists && allStops.length > 0) {
        // First time — insert all rows
        const rows = []
        let order = 0
        for (const [name, cities] of Object.entries(cityMap).sort((a, b) => a[0].localeCompare(b[0]))) {
          const cityList = [...cities].sort().join(', ')
          const displayText = pharmacy === 'Aultman' ? `${name.toUpperCase()} — ${cityList}` : name.toUpperCase()
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

        // Update display_text for existing drivers with fresh cities
        for (const row of currentRows) {
          const cities = cityMap[row.driver_name]
          if (!cities) continue
          const cityList = [...cities].sort().join(', ')
          const newText = pharmacy === 'Aultman' ? `${row.driver_name.toUpperCase()} — ${cityList}` : row.driver_name.toUpperCase()
          if (row.display_text !== newText) {
            await apiPost({ action: 'update', id: row.id, display_text: newText })
            row.display_text = newText
          }
        }

        // Add rows for new drivers not yet in the sort list
        const maxOrder = currentRows.reduce((m, l) => Math.max(m, l.sort_order || 0), 0)
        const newRows = []
        let order = maxOrder + 1
        for (const [name, cities] of Object.entries(cityMap).sort((a, b) => a[0].localeCompare(b[0]))) {
          if (existingDrivers.has(name)) continue
          const cityList = [...cities].sort().join(', ')
          const displayText = pharmacy === 'Aultman' ? `${name.toUpperCase()} — ${cityList}` : name.toUpperCase()
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
    await apiPost({ action: 'update', id, display_text: editVal })
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
                        onKeyDown={e => { if (e.key === 'Enter') handleSave(line.id); if (e.key === 'Escape') setEditKey(null) }} />
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
