import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { dbInsert, dbUpdate, dbDelete } from '../../lib/db'
import './Communications.css'

const TYPES = ['announcement', 'meeting', 'note', 'poll', 'signup', 'update']
const TYPE_LABELS = { announcement: 'Announcement', meeting: 'Meeting', note: 'Note', poll: 'Poll', signup: 'Sign-Up', update: 'App Update' }
const TYPE_COLORS = { announcement: '#0A2463', meeting: '#2563eb', note: '#6B7280', poll: '#7c3aed', signup: '#059669', update: '#60A5FA' }

const EMPTY_FORM = { type: 'announcement', title: '', body: '', priority: 'normal', pharmacy: 'all', expires_at: '', poll_options: ['', ''], pinned: false, scheduled_for: '', target_drivers: [] }

export default function Communications() {
  const [items, setItems] = useState([])
  const [drivers, setDrivers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [pollResults, setPollResults] = useState({})
  const [viewingPoll, setViewingPoll] = useState(null)
  const [viewingReads, setViewingReads] = useState(null)
  const [readDetails, setReadDetails] = useState({})

  async function load() {
    setLoading(true)
    const [annRes, drvRes] = await Promise.all([
      supabase.from('announcements').select('*').order('created_at', { ascending: false }),
      supabase.from('drivers').select('id,driver_name,pharmacy,active').eq('active', true).order('driver_name')
    ])
    setItems(annRes.data || [])
    setDrivers(drvRes.data || [])

    // Load read counts for all announcements
    const ids = (annRes.data || []).map(a => a.id)
    if (ids.length > 0) {
      const { data: reads } = await supabase.from('announcement_reads').select('announcement_id,driver_id').in('announcement_id', ids)
      const countMap = {}
      for (const r of (reads || [])) {
        countMap[r.announcement_id] = countMap[r.announcement_id] || []
        countMap[r.announcement_id].push(r.driver_id)
      }
      setReadDetails(countMap)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function loadPollResults(id, isSignup) {
    const { data } = await supabase.from('poll_responses').select('response,driver_id').eq('announcement_id', id)
    const counts = {}
    const bySlot = {}
    ;(data || []).forEach(r => {
      counts[r.response] = (counts[r.response] || 0) + 1
      if (isSignup) {
        if (!bySlot[r.response]) bySlot[r.response] = []
        const drv = drivers.find(d => d.id === r.driver_id)
        bySlot[r.response].push(drv?.driver_name || `Driver #${r.driver_id}`)
      }
    })
    setPollResults(prev => ({ ...prev, [id]: { counts, total: (data || []).length, bySlot } }))
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
      pinned: item.pinned || false,
      scheduled_for: item.scheduled_for ? item.scheduled_for.slice(0, 16) : '',
      target_drivers: item.target_drivers || [],
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
      poll_options: (form.type === 'poll' || form.type === 'signup') ? form.poll_options.filter(o => o.trim()) : null,
      pinned: form.pinned,
      scheduled_for: form.scheduled_for ? new Date(form.scheduled_for).toISOString() : null,
      target_drivers: form.target_drivers.length > 0 ? form.target_drivers : null,
    }
    try {
      if (editing) {
        await dbUpdate('announcements', payload, { id: editing.id })
      } else {
        payload.active = true
        await dbInsert('announcements', payload)
        // Send push notifications (skip if scheduled for later)
        if (!payload.scheduled_for || new Date(payload.scheduled_for) <= new Date()) {
          await fetch('/api/actions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'announce',
              title: payload.title,
              body: payload.body || '',
              pharmacy: payload.pharmacy,
              priority: payload.priority,
              targetDrivers: payload.target_drivers,
            })
          }).catch(() => {})
        }
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

  function addPollOption() { setForm(prev => ({ ...prev, poll_options: [...prev.poll_options, ''] })) }
  function removePollOption(idx) { setForm(prev => ({ ...prev, poll_options: prev.poll_options.filter((_, i) => i !== idx) })) }
  function updatePollOption(idx, val) { setForm(prev => ({ ...prev, poll_options: prev.poll_options.map((o, i) => i === idx ? val : o) })) }
  function toggleTargetDriver(id) { setForm(prev => ({ ...prev, target_drivers: prev.target_drivers.includes(id) ? prev.target_drivers.filter(d => d !== id) : [...prev.target_drivers, id] })) }

  const isExpired = (a) => a.expires_at && new Date(a.expires_at) < new Date()
  const totalDrivers = drivers.length

  return (
    <div className="comms">
      <div className="comms-header">
        <div>
          <h2 className="comms-title">Communications</h2>
          <p className="comms-sub">Announcements, polls, meetings, and notes for your drivers</p>
        </div>
        <button className="comms-create-btn" onClick={openCreate}>+ New</button>
      </div>

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

          <div className="comms-form-grid">
            <div className="comms-form-row">
              <label>Schedule Send</label>
              <input type="datetime-local" value={form.scheduled_for} onChange={e => setForm(prev => ({ ...prev, scheduled_for: e.target.value }))} />
            </div>
            <div className="comms-form-row comms-checkbox-row">
              <label>
                <input type="checkbox" checked={form.pinned} onChange={e => setForm(prev => ({ ...prev, pinned: e.target.checked }))} />
                Pinned (can't dismiss)
              </label>
            </div>
          </div>

          {/* Target specific drivers */}
          <div className="comms-form-row">
            <label>Target Drivers <span className="comms-label-hint">(leave empty for all)</span></label>
            <div className="comms-driver-chips">
              {drivers.map(d => (
                <button key={d.id} className={`comms-driver-chip ${form.target_drivers.includes(d.id) ? 'selected' : ''}`}
                  onClick={() => toggleTargetDriver(d.id)}
                >{d.driver_name}</button>
              ))}
            </div>
          </div>

          {(form.type === 'poll' || form.type === 'signup') && (
            <div className="comms-form-row">
              <label>{form.type === 'signup' ? 'Time Slots' : 'Poll Options'}</label>
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
              {saving ? 'Saving...' : editing ? 'Update' : 'Create & Send'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="comms-loading">Loading...</div>
      ) : items.length === 0 ? (
        <div className="comms-empty">No announcements yet. Create one to get started.</div>
      ) : (
        <div className="comms-list">
          {items.map(item => {
            const reads = readDetails[item.id] || []
            const readCount = reads.length
            const readDriverNames = drivers.filter(d => reads.includes(d.id)).map(d => d.driver_name)
            const unreadDriverNames = drivers.filter(d => !reads.includes(d.id)).map(d => d.driver_name)

            return (
            <div key={item.id} className={`comms-item ${!item.active ? 'inactive' : ''} ${isExpired(item) ? 'expired' : ''}`}>
              <div className="comms-item-left">
                <span className="comms-badge" style={{ backgroundColor: TYPE_COLORS[item.type] || '#6B7280' }}>
                  {TYPE_LABELS[item.type] || item.type}
                </span>
                {item.priority === 'urgent' && <span className="comms-badge comms-badge-urgent">Urgent</span>}
                {item.pinned && <span className="comms-badge comms-badge-pinned">Pinned</span>}
                {item.pharmacy !== 'all' && <span className="comms-badge comms-badge-pharm">{item.pharmacy}</span>}
                {item.target_drivers?.length > 0 && <span className="comms-badge comms-badge-targeted">{item.target_drivers.length} drivers</span>}
                {isExpired(item) && <span className="comms-badge comms-badge-expired">Expired</span>}
                {item.scheduled_for && new Date(item.scheduled_for) > new Date() && <span className="comms-badge comms-badge-scheduled">Scheduled</span>}
              </div>
              <div className="comms-item-content">
                <div className="comms-item-title">{item.title}</div>
                {item.body && <div className="comms-item-body">{item.body}</div>}
                <div className="comms-item-meta">
                  {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {item.expires_at && ` · Expires ${new Date(item.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                  {item.scheduled_for && ` · Sends ${new Date(item.scheduled_for).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`}
                </div>
                {/* Read receipts */}
                <div className="comms-reads">
                  <button className="comms-reads-btn" onClick={() => setViewingReads(viewingReads === item.id ? null : item.id)}>
                    {readCount}/{totalDrivers} read
                  </button>
                </div>
                {viewingReads === item.id && (
                  <div className="comms-reads-detail">
                    {readDriverNames.length > 0 && <div className="comms-reads-group">
                      <span className="comms-reads-label comms-reads-yes">Read ({readDriverNames.length})</span>
                      <span className="comms-reads-names">{readDriverNames.join(', ')}</span>
                    </div>}
                    {unreadDriverNames.length > 0 && <div className="comms-reads-group">
                      <span className="comms-reads-label comms-reads-no">Unread ({unreadDriverNames.length})</span>
                      <span className="comms-reads-names">{unreadDriverNames.join(', ')}</span>
                    </div>}
                  </div>
                )}
              </div>
              <div className="comms-item-actions">
                <button className={`comms-toggle ${item.active ? 'on' : 'off'}`} onClick={() => toggleActive(item)} title={item.active ? 'Deactivate' : 'Activate'}>
                  {item.active ? 'Active' : 'Off'}
                </button>
                {(item.type === 'poll' || item.type === 'signup') && (
                  <button className="comms-action-btn" onClick={() => { setViewingPoll(viewingPoll === item.id ? null : item.id); if (!pollResults[item.id]) loadPollResults(item.id, item.type === 'signup') }}>
                    Results
                  </button>
                )}
                <button className="comms-action-btn" onClick={() => openEdit(item)}>Edit</button>
                <button className="comms-action-btn comms-action-delete" onClick={() => handleDelete(item)}>Delete</button>
              </div>

              {viewingPoll === item.id && (item.type === 'poll' || item.type === 'signup') && (
                <div className="comms-poll-results">
                  {pollResults[item.id] ? (
                    <>
                      <div className="comms-poll-total">{pollResults[item.id].total} vote{pollResults[item.id].total !== 1 ? 's' : ''}</div>
                      {(item.poll_options || []).map(opt => {
                        const count = pollResults[item.id].counts[opt] || 0
                        const pct = pollResults[item.id].total > 0 ? Math.round(count / pollResults[item.id].total * 100) : 0
                        return (
                          <div key={opt} className="comms-poll-row">
                            <div className="comms-poll-label"><span>{opt}</span><span>{count} ({pct}%)</span></div>
                            <div className="comms-poll-bar-bg"><div className="comms-poll-bar" style={{ width: `${pct}%`, backgroundColor: item.type === 'signup' ? '#059669' : '#0A2463' }} /></div>
                            {item.type === 'signup' && pollResults[item.id]?.bySlot?.[opt]?.length > 0 && (
                              <div className="comms-signup-names">{pollResults[item.id].bySlot[opt].join(', ')}</div>
                            )}
                          </div>
                        )
                      })}
                    </>
                  ) : <div>Loading results...</div>}
                </div>
              )}
            </div>
          )})}
        </div>
      )}
    </div>
  )
}
