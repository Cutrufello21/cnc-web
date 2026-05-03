import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import Revenue from './Revenue'
import PLTab from './PLTab'
import PayrollTable from './PayrollTable'
import PayrollRecon from './PayrollRecon'
import PayrollInsights from './PayrollInsights'
import usePayrollData from '../../hooks/usePayrollData'
import './Payroll.css'

export default function Payroll() {
  const [weekOffset, setWeekOffset] = useState(0)
  const [paySubTab, setPaySubTab] = useState('payroll')
  const [settlements, setSettlements] = useState([])
  const [allPayroll, setAllPayroll] = useState([])

  async function loadSettlements() {
    const [settRes, payRes, drvRes] = await Promise.all([
      supabase.from('settlements').select('*').order('week_of', { ascending: false }).limit(1000),
      supabase.from('payroll').select('driver_name, week_of, mon, tue, wed, thu, fri, will_calls').order('week_of', { ascending: false }).limit(1000),
      supabase.from('drivers').select('driver_name, rate_mon, rate_tue, rate_wed, rate_thu, rate_fri, office_fee, flat_salary, will_call_rate'),
    ])
    setSettlements(settRes.data || [])
    const drvMap = {}
    ;(drvRes.data || []).forEach(d => { drvMap[d.driver_name] = d })
    const payRows = (payRes.data || []).map(p => {
      const d = drvMap[p.driver_name] || {}
      const mon = p.mon || 0, tue = p.tue || 0, wed = p.wed || 0, thu = p.thu || 0, fri = p.fri || 0
      const wc = p.will_calls || 0
      const flat = d.flat_salary ? parseFloat(d.flat_salary) : null
      const r = { mon: parseFloat(d.rate_mon) || 0, tue: parseFloat(d.rate_tue) || 0, wed: parseFloat(d.rate_wed) || 0, thu: parseFloat(d.rate_thu) || 0, fri: parseFloat(d.rate_fri) || 0 }
      const hasR = Object.values(r).some(v => v > 0)
      const of_ = parseFloat(d.office_fee) || 0
      let pay = 0
      if (flat) { pay = flat }
      else if (hasR) { const wcr = parseFloat(d.will_call_rate) || 9; pay = mon * r.mon + tue * r.tue + wed * r.wed + thu * r.thu + fri * r.fri + wc * wcr; if (mon + tue + wed + thu + fri > 0 || wc > 0) pay += of_ }
      return { driver_name: p.driver_name, week_of: p.week_of, pay: Math.round(pay * 100) / 100 }
    })
    setAllPayroll(payRows)
  }

  useEffect(() => { loadSettlements() }, [])

  const {
    data, loading, reconApproved, edits, saving, approved, approving,
    toast, insights, loadingInsights, expandedDriver, setExpandedDriver,
    loadPayroll, loadInsights, showToast, handleEdit, getEditedValue,
    hasEdits, saveEdit, buildPayrollHtml, handleApprove,
    getDayValue, getAdjustedTotal, getAdjustedPay, getPerStopShadow,
  } = usePayrollData({ weekOffset, loadSettlements })

  if (loading) return <div className="pay__loading"><div className="dispatch__spinner" />Loading payroll...</div>
  if (!data) return <div className="pay__loading">Failed to load payroll</div>

  const adjustedTotal = data.drivers.reduce((sum, d) => sum + getAdjustedPay(d), 0)

  return (
    <div className="pay">
      {toast && <div className={`pay__toast ${toast.isErr ? 'pay__toast--err' : ''}`}>{toast.msg}</div>}

      {/* Header */}
      <div className="pay__header">
        <div>
          <div className="pay__week-nav">
            <button className="pay__week-btn" onClick={() => setWeekOffset(w => w - 1)} title="Previous week">‹</button>
            <h3 className="pay__title">Weekly Payroll</h3>
            <button className="pay__week-btn" onClick={() => setWeekOffset(w => w + 1)} title="Next week">›</button>
            {weekOffset !== 0 && <button className="pay__week-today" onClick={() => setWeekOffset(0)}>Today</button>}
          </div>
          <p className="pay__sub">
            {data.weekEnding ? `Week Ending ${data.weekEnding}` : 'Review and adjust before sending to accountant'}
            {' — '}accumulated Mon-Fri, clears after approval
          </p>
        </div>
        <div className="pay__header-right">
          <div className="pay__grand-total">
            <span className="pay__grand-label">Total Payroll</span>
            <span className="pay__grand-value">${adjustedTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
          </div>
          <button className={`pay__approve ${approved ? 'pay__approve--done' : ''}`} onClick={handleApprove} disabled={approving || approved}>
            {approved ? 'Approved' : approving ? 'Approving...' : 'Approve & Send'}
          </button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 2, background: '#F0F2F7', padding: 3, borderRadius: 12, marginBottom: 20, width: 'fit-content' }}>
        {[['payroll', 'Payroll'], ['revenue', 'Revenue'], ['pl', 'P&L']].map(([key, label]) => (
          <button key={key} onClick={() => setPaySubTab(key)} style={{
            padding: '8px 20px', fontSize: 13, fontWeight: paySubTab === key ? 600 : 500,
            color: paySubTab === key ? '#0B1E3D' : '#9BA5B4', background: paySubTab === key ? '#fff' : 'transparent',
            borderRadius: 10, border: 'none', cursor: 'pointer', transition: 'all 0.15s',
            boxShadow: paySubTab === key ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
          }}>{label}</button>
        ))}
      </div>

      {paySubTab === 'payroll' && <>
        <PayrollTable data={data} getAdjustedPay={getAdjustedPay} getAdjustedTotal={getAdjustedTotal} getPerStopShadow={getPerStopShadow} getEditedValue={getEditedValue} hasEdits={hasEdits} handleEdit={handleEdit} saveEdit={saveEdit} saving={saving} adjustedTotal={adjustedTotal} />
        <PayrollRecon drivers={data.drivers} reconApproved={reconApproved} setReconApproved={() => loadPayroll()} loadPayroll={loadPayroll} />
      </>}

      {paySubTab === 'revenue' && (
        <div style={{ background: '#fff', border: '1px solid #F0F2F7', borderRadius: 16, padding: 24 }}>
          <Revenue weekOf={(() => {
            const now = new Date(); const dow = now.getDay(); const off = dow === 0 ? -6 : 1 - dow; const mon = new Date(now); mon.setDate(mon.getDate() + off)
            return `${mon.getFullYear()}-${String(mon.getMonth()+1).padStart(2,'0')}-${String(mon.getDate()).padStart(2,'0')}`
          })()} driverPayroll={adjustedTotal} />
        </div>
      )}

      {paySubTab === 'payroll' && <PayrollInsights insights={insights} loadingInsights={loadingInsights} loadInsights={loadInsights} />}

      {paySubTab === 'pl' && <PLTab payrollData={data} />}
    </div>
  )
}
