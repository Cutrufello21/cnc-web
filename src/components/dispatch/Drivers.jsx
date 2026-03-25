import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import './Drivers.css'

export default function Drivers() {
  const [drivers, setDrivers] = useState([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState(null)
  const [editData, setEditData] = useState({})
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

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

      const { error } = await supabase.from('drivers').update(update).eq('id', editId)
      if (error) throw new Error(error.message)

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

  if (loading) return <div className="drv__loading"><div className="dispatch__spinner" />Loading drivers...</div>

  return (
    <div className="drv">
      {toast && <div className={`drv__toast ${toast.startsWith('Error') ? 'drv__toast--err' : ''}`}>{toast}</div>}

      <div className="drv__header">
        <h2 className="drv__title">Drivers</h2>
        <span className="drv__count">{drivers.filter(d => d.active).length} active / {drivers.length} total</span>
      </div>

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
