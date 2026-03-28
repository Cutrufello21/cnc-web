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
  const [newDriver, setNewDriver] = useState({
    driver_name: '', driver_number: '', email: '', pharmacy: 'SHSP',
    rate_mth: '', rate_wf: '', office_fee: '', flat_salary: '', password: '',
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
      rate_mth: d.rate_mth || 0, rate_wf: d.rate_wf || 0,
      office_fee: d.office_fee || 0, flat_salary: d.flat_salary || '',
      active: d.active,
    })
  }

  async function saveEdit() {
    setSaving(true)
    try {
      const update = { ...editData }
      update.flat_salary = update.flat_salary === '' ? null : parseFloat(update.flat_salary)
      update.rate_mth = parseFloat(update.rate_mth) || 0
      update.rate_wf = parseFloat(update.rate_wf) || 0
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
        rate_mth: parseFloat(newDriver.rate_mth) || 0,
        rate_wf: parseFloat(newDriver.rate_wf) || 0,
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
      setNewDriver({ driver_name: '', driver_number: '', email: '', pharmacy: 'SHSP', rate_mth: '', rate_wf: '', office_fee: '', flat_salary: '', password: '' })
      setShowAdd(false)
      loadDrivers()
    } catch (err) {
      setToast(`Error: ${err.message}`)
      setTimeout(() => setToast(null), 4000)
    } finally {
      setSaving(false)
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
            <div className="drv__add-field">
              <label>Pharmacy</label>
              <select value={newDriver.pharmacy} onChange={e => setNewDriver({ ...newDriver, pharmacy: e.target.value })}>
                <option value="SHSP">SHSP</option>
                <option value="Aultman">Aultman</option>
                <option value="Both">Both</option>
              </select>
            </div>
          </div>
          <div className="drv__add-row">
            <div className="drv__add-field">
              <label>Rate M/T/Th</label>
              <input type="number" step="0.01" value={newDriver.rate_mth} onChange={e => setNewDriver({ ...newDriver, rate_mth: e.target.value })} placeholder="7.00" />
            </div>
            <div className="drv__add-field">
              <label>Rate W/F</label>
              <input type="number" step="0.01" value={newDriver.rate_wf} onChange={e => setNewDriver({ ...newDriver, rate_wf: e.target.value })} placeholder="7.00" />
            </div>
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
              <th>Pharmacy</th>
              <th>Email</th>
              <th>Rate M/T/Th</th>
              <th>Rate W/F</th>
              <th>Office Fee</th>
              <th>Flat Salary</th>
              <th>Active</th>
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
                    <td>
                      <select className="drv__select" value={editData.pharmacy} onChange={e => setEditData({ ...editData, pharmacy: e.target.value })}>
                        <option value="SHSP">SHSP</option>
                        <option value="Aultman">Aultman</option>
                        <option value="Both">Both</option>
                      </select>
                    </td>
                    <td><input className="drv__input" value={editData.email} onChange={e => setEditData({ ...editData, email: e.target.value })} /></td>
                    <td><input className="drv__input drv__input--sm" type="number" step="0.01" value={editData.rate_mth} onChange={e => setEditData({ ...editData, rate_mth: e.target.value })} /></td>
                    <td><input className="drv__input drv__input--sm" type="number" step="0.01" value={editData.rate_wf} onChange={e => setEditData({ ...editData, rate_wf: e.target.value })} /></td>
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

              return (
                <tr key={d.id} className={!d.active ? 'drv__row--inactive' : ''}>
                  <td className="drv__cell-name">{d.driver_name}</td>
                  <td className="drv__cell-id">{d.driver_number}</td>
                  <td>
                    <span className={`drv__pharma ${d.pharmacy === 'Aultman' ? 'drv__pharma--aultman' : d.pharmacy === 'Both' ? 'drv__pharma--both' : 'drv__pharma--shsp'}`}>
                      {d.pharmacy || '—'}
                    </span>
                  </td>
                  <td className="drv__cell-email">{d.email || '—'}</td>
                  <td className="drv__cell-num">${parseFloat(d.rate_mth || 0).toFixed(2)}</td>
                  <td className="drv__cell-num">${parseFloat(d.rate_wf || 0).toFixed(2)}</td>
                  <td className="drv__cell-num">{d.office_fee ? `$${d.office_fee}` : '—'}</td>
                  <td className="drv__cell-num">{d.flat_salary ? `$${parseFloat(d.flat_salary).toLocaleString()}` : '—'}</td>
                  <td>{d.active ? '✓' : '—'}</td>
                  <td className="drv__actions">
                    <button className="drv__btn drv__btn--edit" onClick={() => startEdit(d)} title="Edit">&#9998;</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
