import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { dbUpdate, dbInsert } from '../../lib/db'
import './Drivers.css'

export default function Drivers() {
  const [drivers, setDrivers] = useState([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState(null)
  const [editData, setEditData] = useState({})
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(null)
  const [rulesSaving, setRulesSaving] = useState(false)
  const [newDriver, setNewDriver] = useState({
    driver_name: '', driver_number: '', email: '', pharmacy: 'SHSP',
    rate_mon: '', rate_tue: '', rate_wed: '', rate_thu: '', rate_fri: '', office_fee: '', flat_salary: '', password: '',
  })

  useEffect(() => { loadDrivers() }, [])

  async function loadDrivers() {
    setLoading(true)
    const { data } = await supabase.from('drivers').select('*').order('driver_name')
    setDrivers(data || [])
    setLoading(false)
  }

  function startEdit(d) {
    setEditId(d.id)
    setEditData({
      driver_name: d.driver_name, driver_number: d.driver_number,
      email: d.email || '', pharmacy: d.pharmacy || 'SHSP',
      rate_mon: d.rate_mon || 0, rate_tue: d.rate_tue || 0, rate_wed: d.rate_wed || 0, rate_thu: d.rate_thu || 0, rate_fri: d.rate_fri || 0,
      office_fee: d.office_fee || 0, flat_salary: d.flat_salary || '',
      active: d.active,
    })
  }

  async function saveEdit() {
    setSaving(true)
    try {
      const update = { ...editData }
      update.flat_salary = update.flat_salary === '' ? null : parseFloat(update.flat_salary)
      update.rate_mon = parseFloat(update.rate_mon) || 0
      update.rate_tue = parseFloat(update.rate_tue) || 0
      update.rate_wed = parseFloat(update.rate_wed) || 0
      update.rate_thu = parseFloat(update.rate_thu) || 0
      update.rate_fri = parseFloat(update.rate_fri) || 0
      update.office_fee = parseFloat(update.office_fee) || 0

      await dbUpdate('drivers', update, { id: editId })

      setToast(`${editData.driver_name} updated`)
      setTimeout(() => setToast(null), 3000)
      setEditId(null)
      loadDrivers()
    } catch (err) {
      setToast(`Error: ${err.message}`)
      setTimeout(() => setToast(null), 4000)
    } finally {
      setSaving(false)
    }
  }

  async function handleAddDriver() {
    if (!newDriver.driver_name || !newDriver.driver_number) {
      setToast('Name and ID are required')
      setTimeout(() => setToast(null), 3000)
      return
    }
    setSaving(true)
    try {
      // 1. Add to drivers table
      await dbInsert('drivers', {
        driver_name: newDriver.driver_name,
        driver_number: newDriver.driver_number,
        email: newDriver.email || null,
        pharmacy: newDriver.pharmacy,
        rate_mon: parseFloat(newDriver.rate_mon) || 0,
        rate_tue: parseFloat(newDriver.rate_tue) || 0,
        rate_wed: parseFloat(newDriver.rate_wed) || 0,
        rate_thu: parseFloat(newDriver.rate_thu) || 0,
        rate_fri: parseFloat(newDriver.rate_fri) || 0,
        office_fee: parseFloat(newDriver.office_fee) || 0,
        flat_salary: newDriver.flat_salary ? parseFloat(newDriver.flat_salary) : null,
        active: true,
      })

      // 2. Create auth account if email + password provided
      if (newDriver.email && newDriver.password) {
        const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
        const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

        // Create user via admin API through Apps Script or direct signup
        const signupRes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
          method: 'POST',
          headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: newDriver.email,
            password: newDriver.password,
            data: { full_name: newDriver.driver_name, role: 'driver' },
          }),
        })
        const signupData = await signupRes.json()

        if (signupRes.ok && signupData.id) {
          // Update profile
          const { data: session } = await supabase.auth.getSession()
          if (session?.session?.access_token) {
            await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${signupData.id}`, {
              method: 'PATCH',
              headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${session.session.access_token}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal',
              },
              body: JSON.stringify({
                role: 'driver',
                full_name: newDriver.driver_name,
                driver_id: newDriver.driver_number,
                driver_number: newDriver.driver_number,
              }),
            })
          }
        }
      }

      setToast(`${newDriver.driver_name} added${newDriver.email ? ' — login account created' : ''}`)
      setTimeout(() => setToast(null), 4000)
      setNewDriver({ driver_name: '', driver_number: '', email: '', pharmacy: 'SHSP', rate_mon: '', rate_tue: '', rate_wed: '', rate_thu: '', rate_fri: '', office_fee: '', flat_salary: '', password: '' })
      setShowAdd(false)
      loadDrivers()
    } catch (err) {
      setToast(`Error: ${err.message}`)
      setTimeout(() => setToast(null), 4000)
    } finally {
      setSaving(false)
    }
  }

  async function saveRules(driverId, updates) {
    setRulesSaving(true)
    try {
      await dbUpdate('drivers', updates, { id: driverId })
      setToast('Rules updated')
      setTimeout(() => setToast(null), 3000)
      loadDrivers()
    } catch (err) {
      setToast(`Error: ${err.message}`)
      setTimeout(() => setToast(null), 4000)
    } finally {
      setRulesSaving(false)
    }
  }

  if (loading) return <div className="drv__loading"><div className="dispatch__spinner" />Loading drivers...</div>

  return (
    <div className="drv">
      {toast && <div className={`drv__toast ${toast.startsWith('Error') ? 'drv__toast--err' : ''}`}>{toast}</div>}

      <div className="drv__header">
        <h2 className="drv__title">Drivers</h2>
        <span className="drv__count">{drivers.filter(d => d.active).length} active / {drivers.length} total</span>
        <button className="drv__add-btn" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Cancel' : '+ New Driver'}
        </button>
      </div>

      {showAdd && (
        <div className="drv__add-form">
          <h4 className="drv__add-title">New Driver</h4>
          <div className="drv__add-row">
            <div className="drv__add-field">
              <label>Name *</label>
              <input value={newDriver.driver_name} onChange={e => setNewDriver({ ...newDriver, driver_name: e.target.value })} placeholder="Bobby" />
            </div>
            <div className="drv__add-field">
              <label>Driver ID *</label>
              <input value={newDriver.driver_number} onChange={e => setNewDriver({ ...newDriver, driver_number: e.target.value })} placeholder="55493" />
            </div>
          </div>
          <div className="drv__add-row">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(day => (
              <div className="drv__add-field" key={day}>
                <label>Rate {day}</label>
                <input type="number" step="0.01" value={newDriver[`rate_${day.toLowerCase()}`]} onChange={e => setNewDriver({ ...newDriver, [`rate_${day.toLowerCase()}`]: e.target.value })} placeholder="7.00" />
              </div>
            ))}
          </div>
          <div className="drv__add-row">
            <div className="drv__add-field">
              <label>Office Fee</label>
              <input type="number" value={newDriver.office_fee} onChange={e => setNewDriver({ ...newDriver, office_fee: e.target.value })} placeholder="-35" />
            </div>
            <div className="drv__add-field">
              <label>Flat Salary</label>
              <input type="number" value={newDriver.flat_salary} onChange={e => setNewDriver({ ...newDriver, flat_salary: e.target.value })} placeholder="Leave blank if per-stop" />
            </div>
          </div>
          <div className="drv__add-row">
            <div className="drv__add-field drv__add-field--wide">
              <label>Email (for login)</label>
              <input type="email" value={newDriver.email} onChange={e => setNewDriver({ ...newDriver, email: e.target.value })} placeholder="driver@gmail.com" />
            </div>
            <div className="drv__add-field">
              <label>Password</label>
              <input type="text" value={newDriver.password} onChange={e => setNewDriver({ ...newDriver, password: e.target.value })} placeholder="Initial password" />
            </div>
          </div>
          <div className="drv__add-actions">
            <button className="drv__add-submit" onClick={handleAddDriver} disabled={saving}>
              {saving ? 'Creating...' : 'Create Driver'}
            </button>
            <span className="drv__add-note">Driver logs in with cc.{(newDriver.driver_name || 'name').toLowerCase()}</span>
          </div>
        </div>
      )}

      <div className="drv__table-wrap">
        <table className="drv__table">
          <thead>
            <tr>
              <th>Name</th>
              <th>ID</th>
              <th>Email</th>
              <th>Mon</th>
              <th>Tue</th>
              <th>Wed</th>
              <th>Thu</th>
              <th>Fri</th>
              <th>Office Fee</th>
              <th>Flat Salary</th>
              <th>Active</th>
              <th>PRO</th>
              <th>Admin</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {drivers.map(d => {
              if (editId === d.id) {
                return (
                  <tr key={d.id} className="drv__row--editing">
                    <td><input className="drv__input" value={editData.driver_name} onChange={e => setEditData({ ...editData, driver_name: e.target.value })} /></td>
                    <td><input className="drv__input drv__input--sm" value={editData.driver_number} onChange={e => setEditData({ ...editData, driver_number: e.target.value })} /></td>
                    <td><input className="drv__input" value={editData.email} onChange={e => setEditData({ ...editData, email: e.target.value })} /></td>
                    {['mon', 'tue', 'wed', 'thu', 'fri'].map(day => (
                      <td key={day}><input className="drv__input drv__input--sm" type="number" step="0.01" value={editData[`rate_${day}`]} onChange={e => setEditData({ ...editData, [`rate_${day}`]: e.target.value })} /></td>
                    ))}
                    <td><input className="drv__input drv__input--sm" type="number" value={editData.office_fee} onChange={e => setEditData({ ...editData, office_fee: e.target.value })} /></td>
                    <td><input className="drv__input drv__input--sm" type="number" value={editData.flat_salary} onChange={e => setEditData({ ...editData, flat_salary: e.target.value })} placeholder="—" /></td>
                    <td>
                      <select className="drv__select" value={editData.active ? 'true' : 'false'} onChange={e => setEditData({ ...editData, active: e.target.value === 'true' })}>
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    </td>
                    <td className="drv__actions">
                      <button className="drv__btn drv__btn--save" onClick={saveEdit} disabled={saving}>{saving ? '...' : '&#10003;'}</button>
                      <button className="drv__btn drv__btn--cancel" onClick={() => setEditId(null)}>&#10005;</button>
                    </td>
                  </tr>
                )
              }

              const isRulesOpen = rulesOpen === d.id
              const hasRules = d.max_stops || d.is_floating || d.zip_only?.length || d.zip_never?.length || d.coverage_area || d.notes
              return (
                <>
                  <tr key={d.id} className={`${!d.active ? 'drv__row--inactive' : ''} ${isRulesOpen ? 'drv__row--rules-open' : ''}`}>
                    <td className="drv__cell-name">
                      {d.driver_name}
                      {hasRules && <span className="drv__rules-dot" title="Has dispatch rules">●</span>}
                    </td>
                    <td className="drv__cell-id">{d.driver_number}</td>
                    <td className="drv__cell-email">{d.email || '—'}</td>
                    {['rate_mon', 'rate_tue', 'rate_wed', 'rate_thu', 'rate_fri'].map(col => (
                      <td key={col} className="drv__cell-num">${parseFloat(d[col] || 0).toFixed(2)}</td>
                    ))}
                    <td className="drv__cell-num">{d.office_fee ? `$${d.office_fee}` : '—'}</td>
                    <td className="drv__cell-num">{d.flat_salary ? `$${parseFloat(d.flat_salary).toLocaleString()}` : '—'}</td>
                    <td>{d.active ? '✓' : '—'}</td>
                    <td>
                      <button
                        className={`drv__pod-toggle ${d.pod_enabled ? 'drv__pod-toggle--on' : ''}`}
                        onClick={async () => {
                          await dbUpdate('drivers', { pod_enabled: !d.pod_enabled }, { id: d.id })
                          loadDrivers()
                        }}
                        title={d.pod_enabled ? 'POD enabled — click to disable' : 'POD disabled — click to enable'}
                      >
                        {d.pod_enabled ? 'ON' : 'OFF'}
                      </button>
                    </td>
                    <td>
                      <button
                        className={`drv__pod-toggle ${d.is_admin ? 'drv__pod-toggle--admin' : ''}`}
                        onClick={async () => {
                          await dbUpdate('drivers', { is_admin: !d.is_admin }, { id: d.id })
                          loadDrivers()
                        }}
                        title={d.is_admin ? 'Admin (lead) — click to demote' : 'Standard driver — click to make admin'}
                      >
                        {d.is_admin ? 'ON' : 'OFF'}
                      </button>
                    </td>
                    <td className="drv__actions">
                      <button className="drv__btn drv__btn--rules" onClick={() => setRulesOpen(isRulesOpen ? null : d.id)} title="Dispatch rules">
                        ⚙
                      </button>
                      <button className="drv__btn drv__btn--edit" onClick={() => startEdit(d)} title="Edit">&#9998;</button>
                    </td>
                  </tr>
                  {isRulesOpen && (
                    <tr key={`${d.id}-rules`} className="drv__rules-row">
                      <td colSpan={14}>
                        <DriverRules driver={d} onSave={async (updates) => {
                          setRulesSaving(true)
                          try {
                            await dbUpdate('drivers', updates, { id: d.id })
                            setToast(`${d.driver_name} rules updated`)
                            setTimeout(() => setToast(null), 3000)
                            loadDrivers()
                          } catch (err) {
                            setToast(`Error: ${err.message}`)
                            setTimeout(() => setToast(null), 4000)
                          } finally {
                            setRulesSaving(false)
                          }
                        }} saving={rulesSaving} />
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DriverRules({ driver, onSave, saving }) {
  const [maxStops, setMaxStops] = useState(driver.max_stops || '')
  const [isFloating, setIsFloating] = useState(!!driver.is_floating)
  const [zipOnly, setZipOnly] = useState((driver.zip_only || []).join(', '))
  const [zipNever, setZipNever] = useState((driver.zip_never || []).join(', '))
  const [coverage, setCoverage] = useState(driver.coverage_area || '')
  const [notes, setNotes] = useState(driver.notes || '')

  function handleSave() {
    onSave({
      max_stops: maxStops === '' ? null : parseInt(maxStops),
      is_floating: isFloating,
      zip_only: zipOnly.trim() ? zipOnly.split(',').map(z => z.trim()).filter(Boolean) : null,
      zip_never: zipNever.trim() ? zipNever.split(',').map(z => z.trim()).filter(Boolean) : null,
      coverage_area: coverage.trim() || null,
      notes: notes.trim() || null,
    })
  }

  return (
    <div className="drv__rules">
      <h4 className="drv__rules-title">Dispatch Rules — {driver.driver_name}</h4>
      <div className="drv__rules-grid">
        <div className="drv__rules-field">
          <label>Max Stops</label>
          <input type="number" value={maxStops} onChange={e => setMaxStops(e.target.value)} placeholder="No limit" />
          <span className="drv__rules-hint">Leave blank for no cap</span>
        </div>
        <div className="drv__rules-field">
          <label>Floating Driver</label>
          <select value={isFloating ? 'yes' : 'no'} onChange={e => setIsFloating(e.target.value === 'yes')}>
            <option value="no">No — regular route</option>
            <option value="yes">Yes — fills in where needed</option>
          </select>
          <span className="drv__rules-hint">Floaters pick up overflow and cover offs</span>
        </div>
        <div className="drv__rules-field drv__rules-field--wide">
          <label>Only These ZIPs</label>
          <input value={zipOnly} onChange={e => setZipOnly(e.target.value)} placeholder="44310, 44305, 44278" />
          <span className="drv__rules-hint">Comma-separated. Driver will ONLY get orders in these ZIPs. Leave blank for no restriction.</span>
        </div>
        <div className="drv__rules-field drv__rules-field--wide">
          <label>Never These ZIPs</label>
          <input value={zipNever} onChange={e => setZipNever(e.target.value)} placeholder="44691, 44681" />
          <span className="drv__rules-hint">Comma-separated. Driver will NEVER get orders in these ZIPs.</span>
        </div>
        <div className="drv__rules-field drv__rules-field--wide">
          <label>Coverage Area</label>
          <input value={coverage} onChange={e => setCoverage(e.target.value)} placeholder="West side, Canton, Uniontown" />
          <span className="drv__rules-hint">General description for reference</span>
        </div>
        <div className="drv__rules-field drv__rules-field--wide">
          <label>Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any special rules, quirks, or preferences..." rows={3} />
          <span className="drv__rules-hint">Free text — anything the optimizer should know</span>
        </div>
      </div>
      <div className="drv__rules-actions">
        <button className="drv__rules-save" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Rules'}
        </button>
      </div>
    </div>
  )
}
