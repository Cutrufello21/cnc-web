import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { dbInsert, dbUpdate, dbDelete } from '../../lib/db'
import './Communications.css'

const TYPES = ['announcement', 'meeting', 'note', 'poll']
const TYPE_LABELS = { announcement: 'Announcement', meeting: 'Meeting', note: 'Note', poll: 'Poll' }
const TYPE_COLORS = { announcement: '#0A2463', meeting: '#2563eb', note: '#6B7280', poll: '#7c3aed' }

const EMPTY_FORM = { type: 'announcement', title: '', body: '', priority: 'normal', pharmacy: 'all', expires_at: '', poll_options: ['', ''] }

export default function Communications() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [pollResults, setPollResults] = useState({})
  const [viewingPoll, setViewingPoll] = useState(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('announcements').select('*').order('created_at', { ascending: false })
    setItems(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function loadPollResults(id) {
    const { data } = await supabase.from('poll_responses').select('response')
      .eq('announcement_id', id)
    const counts = {}
    ;(data || []).forEach(r => { counts[r.response] = (counts[r.response] || 0) + 1 })
    setPollResults(prev => ({ ...prev, [id]: { counts, total: (data || []).length } }))
  }

  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY_FORM })
    setShowForm(true)
  }

  function openEdit(item) {
    setEditing(item)
    setForm({
      type: item.type,
      title: item.title || '',
      body: item.body || '',
      priority: item.priority || 'normal',
      pharmacy: item.pharmacy || 'all',
      expires_at: item.expires_at ? item.expires_at.slice(0, 16) : '',
      poll_options: item.poll_options || ['', ''],
    })
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.title.trim()) return
    setSaving(true)
    const payload = {
      type: form.type,
      title: form.title.trim(),
      body: form.body.trim() || null,
      priority: form.priority,
      pharmacy: form.pharmacy,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      poll_options: form.type === 'poll' ? form.poll_options.filter(o => o.trim()) : null,
    }
    try {
      if (editing) {
        await dbUpdate('announcements', payload, { id: editing.id })
      } else {
        payload.active = true
        await dbInsert('announcements', payload)
      }
      setShowForm(false)
      setEditing(null)
      setForm({ ...EMPTY_FORM })
      await load()
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setSaving(false)
  }

  async function toggleActive(item) {
    await dbUpdate('announcements', { active: !item.active }, { id: item.id })
    setItems(prev => prev.map(a => a.id === item.id ? { ...a, active: !a.active } : a))
  }

  async function handleDelete(item) {
    if (!confirm(`Delete "${item.title}"?`)) return
    await dbDelete('announcements', { id: item.id })
    setItems(prev => prev.filter(a => a.id !== item.id))
  }

  function addPollOption() {
    setForm(prev => ({ ...prev, poll_options: [...prev.poll_options, ''] }))
  }

  function removePollOption(idx) {
    setForm(prev => ({ ...prev, poll_options: prev.poll_options.filter((_, i) => i !== idx) }))
  }

  function updatePollOption(idx, val) {
    setForm(prev => ({ ...prev, poll_options: prev.poll_options.map((o, i) => i === idx ? val : o) }))
  }

  const isExpired = (a) => a.expires_at && new Date(a.expires_at) < new Date()

  return (
    <div className="comms">
      <div className="comms-header">
        <div>
          <h2 className="comms-title">Communications</h2>
          <p className="comms-sub">Announcements, polls, meetings, and notes for your drivers</p>
        </div>
        <button className="comms-create-btn" onClick={openCreate}>
          + New
        </button>
      </div>

      {/* Create / Edit Form */}
      {showForm && (
        <div className="comms-form-card">
          <div className="comms-form-row">
            <label>Type</label>
            <div className="comms-type-pills">
              {TYPES.map(t => (
                <button key={t} className={`comms-type-pill ${form.type === t ? 'active' : ''}`}
                  style={form.type === t ? { backgroundColor: TYPE_COLORS[t], color: '#fff' } : {}}
                  onClick={() => setForm(prev => ({ ...prev, type: t }))}
                >{TYPE_LABELS[t]}</button>
              ))}
            </div>
          </div>

          <div className="comms-form-row">
            <label>Title</label>
            <input value={form.title} onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))} placeholder="Enter title..." />
          </div>

          <div className="comms-form-row">
            <label>Body</label>
            <textarea rows={3} value={form.body} onChange={e => setForm(prev => ({ ...prev, body: e.target.value }))} placeholder="Details (optional)..." />
          </div>

          <div className="comms-form-grid">
            <div className="comms-form-row">
              <label>Priority</label>
              <select value={form.priority} onChange={e => setForm(prev => ({ ...prev, priority: e.target.value }))}>
                <option value="normal">Normal</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div className="comms-form-row">
              <label>Pharmacy</label>
              <select value={form.pharmacy} onChange={e => setForm(prev => ({ ...prev, pharmacy: e.target.value }))}>
                <option value="all">All</option>
                <option value="SHSP">SHSP</option>
                <option value="Aultman">Aultman</option>
              </select>
            </div>
            <div className="comms-form-row">
              <label>Expires</label>
              <input type="datetime-local" value={form.expires_at} onChange={e => setForm(prev => ({ ...prev, expires_at: e.target.value }))} />
            </div>
          </div>

          {form.type === 'poll' && (
            <div className="comms-form-row">
              <label>Poll Options</label>
              {form.poll_options.map((opt, i) => (
                <div key={i} className="comms-poll-option-row">
                  <input value={opt} onChange={e => updatePollOption(i, e.target.value)} placeholder={`Option ${i + 1}`} />
                  {form.poll_options.length > 2 && (
                    <button className="comms-poll-remove" onClick={() => removePollOption(i)}>&times;</button>
                  )}
                </div>
              ))}
              <button className="comms-poll-add" onClick={addPollOption}>+ Add Option</button>
            </div>
          )}

          <div className="comms-form-actions">
            <button className="comms-btn-cancel" onClick={() => { setShowForm(false); setEditing(null) }}>Cancel</button>
            <button className="comms-btn-save" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="comms-loading">Loading...</div>
      ) : items.length === 0 ? (
        <div className="comms-empty">No announcements yet. Create one to get started.</div>
      ) : (
        <div className="comms-list">
          {items.map(item => (
            <div key={item.id} className={`comms-item ${!item.active ? 'inactive' : ''} ${isExpired(item) ? 'expired' : ''}`}>
              <div className="comms-item-left">
                <span className="comms-badge" style={{ backgroundColor: TYPE_COLORS[item.type] || '#6B7280' }}>
                  {TYPE_LABELS[item.type] || item.type}
                </span>
                {item.priority === 'urgent' && <span className="comms-badge comms-badge-urgent">Urgent</span>}
                {item.pharmacy !== 'all' && <span className="comms-badge comms-badge-pharm">{item.pharmacy}</span>}
                {isExpired(item) && <span className="comms-badge comms-badge-expired">Expired</span>}
              </div>
              <div className="comms-item-content">
                <div className="comms-item-title">{item.title}</div>
                {item.body && <div className="comms-item-body">{item.body}</div>}
                <div className="comms-item-meta">
                  {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {item.expires_at && ` · Expires ${new Date(item.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                </div>
              </div>
              <div className="comms-item-actions">
                <button className={`comms-toggle ${item.active ? 'on' : 'off'}`} onClick={() => toggleActive(item)} title={item.active ? 'Deactivate' : 'Activate'}>
                  {item.active ? 'Active' : 'Off'}
                </button>
                {item.type === 'poll' && (
                  <button className="comms-action-btn" onClick={() => { setViewingPoll(viewingPoll === item.id ? null : item.id); if (!pollResults[item.id]) loadPollResults(item.id) }}>
                    Results
                  </button>
                )}
                <button className="comms-action-btn" onClick={() => openEdit(item)}>Edit</button>
                <button className="comms-action-btn comms-action-delete" onClick={() => handleDelete(item)}>Delete</button>
              </div>

              {/* Poll Results Inline */}
              {viewingPoll === item.id && item.type === 'poll' && (
                <div className="comms-poll-results">
                  {pollResults[item.id] ? (
                    <>
                      <div className="comms-poll-total">{pollResults[item.id].total} vote{pollResults[item.id].total !== 1 ? 's' : ''}</div>
                      {(item.poll_options || []).map(opt => {
                        const count = pollResults[item.id].counts[opt] || 0
                        const pct = pollResults[item.id].total > 0 ? Math.round(count / pollResults[item.id].total * 100) : 0
                        return (
                          <div key={opt} className="comms-poll-row">
                            <div className="comms-poll-label">
                              <span>{opt}</span>
                              <span>{count} ({pct}%)</span>
                            </div>
                            <div className="comms-poll-bar-bg">
                              <div className="comms-poll-bar" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        )
                      })}
                    </>
                  ) : (
                    <div>Loading results...</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
