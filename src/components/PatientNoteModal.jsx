import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { savePatientNote } from '../lib/patientNotes'

// Persistent note attached to a patient name (shared across drivers).
// onSaved(noteRow | null) — null means deletion (empty body).
export default function PatientNoteModal({ patientName, initialNote, lastEditedBy, lastEditedAt, onClose, onSaved }) {
  const { user, profile } = useAuth()
  const [text, setText] = useState(initialNote || '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => { setText(initialNote || '') }, [initialNote])

  const editorEmail = user?.email || profile?.email || ''

  async function handleSave() {
    setSaving(true)
    setErr('')
    try {
      const row = await savePatientNote(patientName, text, editorEmail)
      if (onSaved) onSaved(row)
      onClose()
    } catch (e) {
      setErr(e?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Remove the note for ${patientName}?`)) return
    setSaving(true)
    setErr('')
    try {
      await savePatientNote(patientName, '', editorEmail)
      if (onSaved) onSaved(null)
      onClose()
    } catch (e) {
      setErr(e?.message || 'Delete failed')
    } finally {
      setSaving(false)
    }
  }

  const lastEditedDisplay = lastEditedAt
    ? new Date(lastEditedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999, padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 12, width: '100%', maxWidth: 520,
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden',
          fontFamily: 'inherit',
        }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>Patient Note</div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0A2463', marginTop: 2 }}>{patientName}</div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 22, color: '#6b7280', cursor: 'pointer', lineHeight: 1 }}
            aria-label="Close"
          >&times;</button>
        </div>

        <div style={{ padding: 20 }}>
          <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
            Note for future drivers
          </label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="e.g. Leave at side door. Call upon arrival. Dog in yard."
            rows={5}
            autoFocus
            style={{
              width: '100%', boxSizing: 'border-box', padding: '10px 12px',
              border: '1px solid #d1d5db', borderRadius: 8, fontSize: '0.9rem',
              fontFamily: 'inherit', resize: 'vertical', minHeight: 100,
            }}
          />
          {lastEditedDisplay && (
            <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: 8 }}>
              Last edited {lastEditedDisplay}{lastEditedBy ? ` by ${lastEditedBy}` : ''}
            </div>
          )}
          {err && (
            <div style={{ fontSize: '0.8rem', color: '#dc2626', marginTop: 10 }}>{err}</div>
          )}
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <div>
            {initialNote && (
              <button
                onClick={handleDelete}
                disabled={saving}
                style={{
                  padding: '8px 14px', background: 'none', border: '1px solid #fecaca',
                  color: '#dc2626', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
                  cursor: saving ? 'not-allowed' : 'pointer',
                }}
              >Delete</button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              disabled={saving}
              style={{
                padding: '8px 14px', background: '#fff', border: '1px solid #d1d5db',
                color: '#374151', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >Cancel</button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '8px 16px', background: '#0A2463', border: 'none',
                color: '#fff', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
