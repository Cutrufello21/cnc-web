import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import './SortList.css'

export default function SortList({ deliveryDate }) {
  const [lines, setLines] = useState({ SHSP: [], Aultman: [] })
  const [loading, setLoading] = useState(true)
  const [editKey, setEditKey] = useState(null)
  const [editVal, setEditVal] = useState('')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(null)
  const [adding, setAdding] = useState(null) // 'SHSP' or 'Aultman'
  const [newLine, setNewLine] = useState('')

  const dateStr = deliveryDate || new Date().toISOString().split('T')[0]

  useEffect(() => { loadData() }, [dateStr])

  async function loadData() {
    setLoading(true)
    const { data } = await supabase.from('sort_list')
      .select('*').eq('delivery_date', dateStr)
      .order('sort_order', { ascending: true })

    const result = { SHSP: [], Aultman: [] }
    ;(data || []).forEach(r => {
      if (result[r.pharmacy]) result[r.pharmacy].push(r)
    })
    setLines(result)
    setLoading(false)
  }

  async function handleAdd(pharmacy) {
    if (!newLine.trim()) return
    setSaving(true)
    const maxOrder = lines[pharmacy].reduce((m, l) => Math.max(m, l.sort_order || 0), 0)
    await supabase.from('sort_list').insert({
      delivery_date: dateStr,
      pharmacy,
      driver_name: newLine.trim(),
      display_text: newLine.trim(),
      sort_order: maxOrder + 1,
    })
    setNewLine('')
    setAdding(null)
    setSaving(false)
    loadData()
  }

  async function handleSave(id) {
    setSaving(true)
    await supabase.from('sort_list').update({ display_text: editVal }).eq('id', id)
    setEditKey(null)
    setSaving(false)
    loadData()
  }

  async function handleDelete(id) {
    await supabase.from('sort_list').delete().eq('id', id)
    loadData()
  }

  function handleCopy(pharmacy) {
    const text = lines[pharmacy].map(l => l.display_text).join('\n')
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
                <button
                  className={`sl__copy ${copied === pharmacy ? 'sl__copy--done' : ''}`}
                  onClick={() => handleCopy(pharmacy)}
                >
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
                <div key={line.id} className="sl__row">
                  {isEditing ? (
                    <div className="sl__edit">
                      <input
                        className="sl__edit-input"
                        value={editVal}
                        onChange={e => setEditVal(e.target.value)}
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleSave(line.id)
                          if (e.key === 'Escape') setEditKey(null)
                        }}
                      />
                      <button className="sl__edit-save" onClick={() => handleSave(line.id)} disabled={saving}>&#10003;</button>
                      <button className="sl__edit-cancel" onClick={() => setEditKey(null)}>&#10005;</button>
                    </div>
                  ) : (
                    <div className="sl__display">
                      <span className="sl__text" onClick={() => { setEditKey(line.id); setEditVal(line.display_text) }}>
                        {line.display_text}
                      </span>
                      <button className="sl__delete" onClick={() => handleDelete(line.id)}>&times;</button>
                    </div>
                  )}
                </div>
              )
            })}

            {adding === pharmacy ? (
              <div className="sl__add-form">
                <input
                  className="sl__add-input"
                  value={newLine}
                  onChange={e => setNewLine(e.target.value)}
                  placeholder="BOBBY — West"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleAdd(pharmacy)
                    if (e.key === 'Escape') { setAdding(null); setNewLine('') }
                  }}
                />
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
