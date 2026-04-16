import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export default function PLTab({ payrollData }) {
  const [ledger, setLedger] = useState([])
  const [ledgerForm, setLedgerForm] = useState({ type: 'income', description: '', amount: '' })
  const [addingLedger, setAddingLedger] = useState(false)
  const [hoveredWeek, setHoveredWeek] = useState(null)

  useEffect(() => { loadLedger() }, [])

  async function loadLedger() {
    const { data } = await supabase.from('company_ledger').select('*').order('date', { ascending: false }).order('created_at', { ascending: false }).limit(100)
    setLedger(data || [])
  }

  async function addLedgerEntry() {
    if (!ledgerForm.amount || !ledgerForm.description) return
    setAddingLedger(true)
    const amount = parseFloat(ledgerForm.amount)
    if (isNaN(amount) || amount <= 0) { setAddingLedger(false); return }
    const lastBalance = ledger.length > 0 ? parseFloat(ledger[0].running_balance) : 0
    const newBalance = ledgerForm.type === 'income' ? lastBalance + amount : lastBalance - amount
    await supabase.from('company_ledger').insert({
      date: new Date().toISOString().split('T')[0],
      type: ledgerForm.type,
      description: ledgerForm.description,
      amount,
      running_balance: newBalance,
    })
    setLedgerForm({ type: 'income', description: '', amount: '' })
    setAddingLedger(false)
    loadLedger()
  }

  const data = payrollData

  return <>

      {/* ── Company Balance ──────────────────────────── */}
      <div style={{ background: '#0B1E3D', borderRadius: 16, padding: 20, marginBottom: 24, color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>Company Balance</div>
            <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: -1 }}>
              ${ledger.length > 0 ? parseFloat(ledger[0].running_balance).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'}
            </div>
            {ledger.length > 0 && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>as of {new Date(ledger[0].date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <label style={{ padding: '8px 16px', fontSize: 12, fontWeight: 600, color: '#0B1E3D', background: '#F0F2F7', borderRadius: 10, cursor: 'pointer' }}>
              {uploading ? 'Uploading...' : '↑ Upload Settlement'}
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleUpload} style={{ display: 'none' }} disabled={uploading} />
            </label>
          </div>
        </div>

        {/* Add transaction form */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12 }}>
          <select value={ledgerForm.type} onChange={e => setLedgerForm(f => ({ ...f, type: e.target.value }))}
            style={{ padding: '8px 10px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600, background: ledgerForm.type === 'income' ? '#27AE60' : '#E74C3C', color: '#fff', cursor: 'pointer' }}>
            <option value="income">+ Income</option>
            <option value="expense">- Expense</option>
          </select>
          <input type="text" placeholder="Description" value={ledgerForm.description} onChange={e => setLedgerForm(f => ({ ...f, description: e.target.value }))}
            style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 13, outline: 'none' }} />
          <input type="number" placeholder="Amount" value={ledgerForm.amount} onChange={e => setLedgerForm(f => ({ ...f, amount: e.target.value }))}
            style={{ width: 100, padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 13, outline: 'none', textAlign: 'right' }}
            onKeyDown={e => e.key === 'Enter' && addLedgerEntry()} />
          <button onClick={addLedgerEntry} disabled={addingLedger || !ledgerForm.amount || !ledgerForm.description}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#4A9EFF', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: (!ledgerForm.amount || !ledgerForm.description) ? 0.4 : 1 }}>
            Add
          </button>
        </div>

        {/* Recent transactions */}
        {ledger.length > 1 && (
          <div style={{ maxHeight: 160, overflowY: 'auto', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 8 }}>
            {ledger.filter(l => l.type !== 'balance').slice(0, 10).map(l => (
              <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 12 }}>
                <div>
                  <span style={{ color: 'rgba(255,255,255,0.4)', marginRight: 8 }}>{new Date(l.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}</span>
                  <span style={{ color: 'rgba(255,255,255,0.8)' }}>{l.description}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontWeight: 700, fontFamily: 'ui-monospace, monospace', color: parseFloat(l.amount) >= 0 ? '#4ade80' : '#f87171' }}>
                    {parseFloat(l.amount) >= 0 ? '+' : ''}${parseFloat(l.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'ui-monospace, monospace' }}>${parseFloat(l.running_balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pay__recon" style={{ marginTop: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h3 className="pay__recon-title">Profit & Loss</h3>
            <p className="pay__recon-sub">Revenue (OpenForce) vs Cost (Driver Pay)</p>
          </div>
        </div>

        {uploadResult && (
          <div style={{ padding: 12, borderRadius: 10, marginBottom: 16, fontSize: 13, background: uploadResult.error ? '#FDE8E8' : '#E6F5EE', color: uploadResult.error ? '#E74C3C' : '#27AE60', fontWeight: 500 }}>
            {uploadResult.error
              ? `Error: ${uploadResult.error}`
              : `Uploaded ${uploadResult.recordCount} records across ${uploadResult.weeks?.length} weeks — $${uploadResult.totalRevenue?.toLocaleString()} total revenue`
            }
          </div>
        )}

        {settlements.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9BA5B4' }}>
            <p style={{ fontSize: 14, marginBottom: 8 }}>No settlement data yet</p>
            <p style={{ fontSize: 12 }}>Upload your OpenForce monthly Excel to start tracking profitability</p>
          </div>
        ) : (() => {
          // Group settlements by week — now includes both revenue and cost
          const weekMap = {} // weekMap[week][driver] = { revenue, cost }
          settlements.forEach(s => {
            if (!weekMap[s.week_of]) weekMap[s.week_of] = {}
            if (!weekMap[s.week_of][s.driver_name]) weekMap[s.week_of][s.driver_name] = { revenue: 0, cost: 0 }
            weekMap[s.week_of][s.driver_name].revenue += parseFloat(s.revenue) || 0
            weekMap[s.week_of][s.driver_name].cost += parseFloat(s.cost) || 0
          })
          const weeks = Object.keys(weekMap).sort()
          const allDrivers = [...new Set(settlements.map(s => s.driver_name))].sort()

          // Summary KPIs
          const totalRevenue = settlements.reduce((s, r) => s + (parseFloat(r.revenue) || 0), 0)
          const totalCost = settlements.reduce((s, r) => s + (parseFloat(r.cost) || 0), 0)
          const totalProfit = totalRevenue - totalCost
          const overallMargin = totalRevenue ? Math.round((totalProfit / totalRevenue) * 100) : 0
          const weeklyAvgRevenue = weeks.length ? totalRevenue / weeks.length : 0
          const weeklyAvgCost = weeks.length ? totalCost / weeks.length : 0

          // Per-driver profitability
          const driverTotals = {}
          settlements.forEach(s => {
            if (!driverTotals[s.driver_name]) driverTotals[s.driver_name] = { revenue: 0, cost: 0 }
            driverTotals[s.driver_name].revenue += parseFloat(s.revenue) || 0
            driverTotals[s.driver_name].cost += parseFloat(s.cost) || 0
          })
          const driverProfit = allDrivers.map(name => {
            const d = driverTotals[name] || { revenue: 0, cost: 0 }
            const profit = d.revenue - d.cost
            return { name, revenue: d.revenue, cost: d.cost, profit, margin: d.revenue ? Math.round((profit / d.revenue) * 100) : 0 }
          }).sort((a, b) => b.revenue - a.revenue)

          // Weekly chart data
          const maxWeeklyVal = Math.max(...weeks.map(w => {
            const rev = allDrivers.reduce((s, n) => s + (weekMap[w]?.[n]?.revenue || 0), 0)
            const cost = allDrivers.reduce((s, n) => s + (weekMap[w]?.[n]?.cost || 0), 0)
            return Math.max(rev, cost)
          }), 1)

          return (
            <>
              {/* ── KPI Cards ──────────────────────────────── */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
                <div style={{ background: '#fff', border: '1px solid #F0F2F7', borderRadius: 16, padding: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#9BA5B4', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Total Revenue</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#4A9EFF' }}>${Math.round(totalRevenue).toLocaleString()}</div>
                  <div style={{ fontSize: 11, color: '#9BA5B4', marginTop: 4 }}>{weeks.length} weeks · OpenForce</div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #F0F2F7', borderRadius: 16, padding: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#9BA5B4', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Total Cost</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#E74C3C' }}>${Math.round(totalCost).toLocaleString()}</div>
                  <div style={{ fontSize: 11, color: '#9BA5B4', marginTop: 4 }}>driver payroll</div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #F0F2F7', borderRadius: 16, padding: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#9BA5B4', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Net Profit</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: totalProfit >= 0 ? '#27AE60' : '#E74C3C' }}>${totalProfit >= 0 ? '+' : ''}${Math.round(totalProfit).toLocaleString()}</div>
                  <div style={{ fontSize: 11, color: totalProfit >= 0 ? '#27AE60' : '#E74C3C', marginTop: 4 }}>{overallMargin}% margin</div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #F0F2F7', borderRadius: 16, padding: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#9BA5B4', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Weekly Avg</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#0B1E3D' }}>${Math.round(weeklyAvgRevenue - weeklyAvgCost).toLocaleString()}</div>
                  <div style={{ fontSize: 11, color: '#9BA5B4', marginTop: 4 }}>profit / week</div>
                </div>
              </div>

              {/* ── Weekly Revenue Chart ────────────────────── */}
              <div style={{ background: '#fff', border: '1px solid #F0F2F7', borderRadius: 16, padding: 20, marginBottom: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0B1E3D' }}>Weekly Revenue vs Cost</div>
                  <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#9BA5B4', alignItems: 'center' }}>
                    <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#4A9EFF', marginRight: 4 }} />Revenue</span>
                    <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#E74C3C', opacity: 0.7, marginRight: 4 }} />Cost</span>
                    <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#27AE60', marginRight: 4 }} />Profit</span>
                  </div>
                </div>
                {/* Tooltip */}
                {hoveredWeek && (() => {
                  const wRev = allDrivers.reduce((s, n) => s + (weekMap[hoveredWeek]?.[n]?.revenue || 0), 0)
                  const wCost = allDrivers.reduce((s, n) => s + (weekMap[hoveredWeek]?.[n]?.cost || 0), 0)
                  const wProfit = wRev - wCost
                  return (
                    <div style={{ display: 'flex', gap: 16, padding: '8px 14px', background: '#F7F8FB', borderRadius: 10, marginBottom: 12, fontSize: 12, border: '1px solid #F0F2F7', transition: 'all 0.15s' }}>
                      <span style={{ fontWeight: 700, color: '#0B1E3D' }}>{new Date(hoveredWeek + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      <span>Revenue: <strong style={{ color: '#4A9EFF' }}>${Math.round(wRev).toLocaleString()}</strong></span>
                      <span>Cost: <strong style={{ color: '#E74C3C' }}>${Math.round(wCost).toLocaleString()}</strong></span>
                      <span>Profit: <strong style={{ color: wProfit >= 0 ? '#27AE60' : '#E74C3C' }}>{wProfit >= 0 ? '+' : ''}${Math.round(wProfit).toLocaleString()}</strong></span>
                    </div>
                  )
                })()}
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 180 }}>
                  {weeks.map(w => {
                    const weekRev = allDrivers.reduce((s, n) => s + (weekMap[w]?.[n]?.revenue || 0), 0)
                    const weekCost = allDrivers.reduce((s, n) => s + (weekMap[w]?.[n]?.cost || 0), 0)
                    const weekProfit = weekRev - weekCost
                    const revH = (weekRev / maxWeeklyVal) * 100
                    const costH = (weekCost / maxWeeklyVal) * 100
                    const isHovered = hoveredWeek === w
                    return (
                      <div key={w} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', cursor: 'pointer', opacity: hoveredWeek && !isHovered ? 0.4 : 1, transition: 'opacity 0.15s' }}
                        onMouseEnter={() => setHoveredWeek(w)} onMouseLeave={() => setHoveredWeek(null)}>
                        <div style={{ fontSize: 9, fontWeight: 600, color: '#0B1E3D', marginBottom: 3 }}>${(weekRev / 1000).toFixed(1)}k</div>
                        <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', width: '80%', height: `${Math.max(revH, costH)}%` }}>
                          <div style={{ flex: 1, height: `${revH / Math.max(revH, costH) * 100}%`, background: '#4A9EFF', borderRadius: '4px 4px 0 0', minHeight: 2, transition: 'height 0.3s' }} />
                          <div style={{ flex: 1, height: `${costH / Math.max(revH, costH) * 100}%`, background: '#E74C3C', borderRadius: '4px 4px 0 0', minHeight: weekCost > 0 ? 2 : 0, opacity: 0.7, transition: 'height 0.3s' }} />
                        </div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: weekProfit >= 0 ? '#27AE60' : '#E74C3C', marginTop: 4 }}>+${(weekProfit / 1000).toFixed(1)}k</div>
                        <div style={{ fontSize: 9, color: isHovered ? '#0B1E3D' : '#9BA5B4', fontWeight: isHovered ? 600 : 400, marginTop: 2, transition: 'all 0.15s' }}>{new Date(w + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* ── Driver Revenue vs Cost ──────────────────── */}
              {(() => {
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12, marginBottom: 24 }}>
                    {allDrivers.map(name => {
                      const driverWeeks = weeks.filter(w => weekMap[w]?.[name])
                      if (driverWeeks.length === 0) return null
                      const totalRev = driverWeeks.reduce((s, w) => s + (weekMap[w]?.[name]?.revenue || 0), 0)
                      const totalCostD = driverWeeks.reduce((s, w) => s + (weekMap[w]?.[name]?.cost || 0), 0)
                      const profit = totalRev - totalCostD
                      const margin = totalRev ? Math.round((profit / totalRev) * 100) : 0
                      const maxVal = Math.max(...driverWeeks.map(w => Math.max(weekMap[w]?.[name]?.revenue || 0, weekMap[w]?.[name]?.cost || 0)), 1)

                      const isExpanded = expandedDriver === name

                      return (
                        <div key={name} style={{ background: '#fff', border: isExpanded ? '1.5px solid #4A9EFF' : '1px solid #F0F2F7', borderRadius: 16, padding: 16, cursor: 'pointer', transition: 'all 0.15s' }}
                          onClick={() => setExpandedDriver(isExpanded ? null : name)}>
                          {/* Header */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ width: 36, height: 36, borderRadius: 10, background: profit >= 0 ? '#E6F5EE' : '#FDE8E8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: profit >= 0 ? '#27AE60' : '#E74C3C' }}>
                                {name.charAt(0)}
                              </div>
                              <div>
                                <div style={{ fontSize: 15, fontWeight: 700, color: '#0B1E3D' }}>{name}</div>
                                <div style={{ fontSize: 11, color: '#9BA5B4', marginTop: 1 }}>{driverWeeks.length} weeks · ${Math.round(totalRev / driverWeeks.length)}/wk avg</div>
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: 16, fontWeight: 700, color: profit >= 0 ? '#27AE60' : '#E74C3C' }}>
                                {profit >= 0 ? '+' : ''}${Math.round(profit).toLocaleString()}
                              </div>
                              <div style={{ fontSize: 11, color: profit >= 0 ? '#27AE60' : '#E74C3C' }}>{margin}% margin</div>
                            </div>
                          </div>

                          {/* Weekly bars — side by side */}
                          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: isExpanded ? 100 : 70, marginBottom: 8, transition: 'height 0.2s' }}>
                            {driverWeeks.map(w => {
                              const rev = weekMap[w]?.[name]?.revenue || 0
                              const cost = weekMap[w]?.[name]?.cost || 0
                              const revH = (rev / maxVal) * 100
                              const costH = (cost / maxVal) * 100
                              return (
                                <div key={w} style={{ flex: 1, display: 'flex', gap: 1, alignItems: 'flex-end', height: '100%' }}>
                                  <div style={{ flex: 1, height: `${revH}%`, background: '#4A9EFF', borderRadius: '4px 4px 0 0', minHeight: 2, transition: 'height 0.3s' }} />
                                  <div style={{ flex: 1, height: `${costH}%`, background: '#E74C3C', borderRadius: '4px 4px 0 0', minHeight: cost > 0 ? 2 : 0, opacity: 0.7, transition: 'height 0.3s' }} />
                                </div>
                              )
                            })}
                          </div>
                          <div style={{ display: 'flex', gap: 3, marginBottom: 8 }}>
                            {driverWeeks.map(w => (
                              <div key={w} style={{ flex: 1, textAlign: 'center', fontSize: 8, color: '#9BA5B4' }}>
                                {new Date(w + 'T12:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}
                              </div>
                            ))}
                          </div>

                          {/* Summary row */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #F0F2F7', paddingTop: 8, fontSize: 12 }}>
                            <div><span style={{ color: '#9BA5B4' }}>Revenue </span><span style={{ fontWeight: 700, color: '#4A9EFF' }}>${Math.round(totalRev).toLocaleString()}</span></div>
                            <div><span style={{ color: '#9BA5B4' }}>Cost </span><span style={{ fontWeight: 700, color: '#E74C3C' }}>${Math.round(totalCostD).toLocaleString()}</span></div>
                          </div>

                          {/* Expanded detail table */}
                          {isExpanded && (
                            <div style={{ marginTop: 12, borderTop: '1px solid #F0F2F7', paddingTop: 12 }} onClick={e => e.stopPropagation()}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                <thead>
                                  <tr>
                                    <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10, color: '#9BA5B4', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Week</th>
                                    <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10, color: '#4A9EFF', fontWeight: 600 }}>Revenue</th>
                                    <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10, color: '#E74C3C', fontWeight: 600 }}>Cost</th>
                                    <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10, color: '#27AE60', fontWeight: 600 }}>Profit</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {driverWeeks.map(w => {
                                    const r = weekMap[w]?.[name]?.revenue || 0
                                    const c = weekMap[w]?.[name]?.cost || 0
                                    const p = r - c
                                    return (
                                      <tr key={w} style={{ borderTop: '1px solid #F0F2F7' }}>
                                        <td style={{ padding: '6px', fontWeight: 500, color: '#0B1E3D' }}>{new Date(w + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                                        <td style={{ padding: '6px', textAlign: 'right', fontFamily: 'ui-monospace, monospace', color: r > 0 ? '#0B1E3D' : '#E0E4ED' }}>{r > 0 ? '$' + r.toLocaleString() : '—'}</td>
                                        <td style={{ padding: '6px', textAlign: 'right', fontFamily: 'ui-monospace, monospace', color: c > 0 ? '#0B1E3D' : '#E0E4ED' }}>{c > 0 ? '$' + c.toLocaleString() : '—'}</td>
                                        <td style={{ padding: '6px', textAlign: 'right', fontFamily: 'ui-monospace, monospace', fontWeight: 600, color: p >= 0 ? '#27AE60' : '#E74C3C' }}>{p >= 0 ? '+' : ''}${Math.round(p).toLocaleString()}</td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })()}

              {/* ── Revenue Table ───────────────────────────── */}
              <div style={{ background: '#fff', border: '1px solid #F0F2F7', borderRadius: 16, overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #F0F2F7', fontSize: 14, fontWeight: 700, color: '#0B1E3D' }}>Settlement Detail</div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="pay__table" style={{ fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', position: 'sticky', left: 0, background: '#F7F8FB', zIndex: 2 }}>Driver</th>
                        {weeks.map(w => <th key={w} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{new Date(w + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</th>)}
                        <th style={{ textAlign: 'right' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allDrivers.map(name => {
                        const totalRev = weeks.reduce((s, w) => s + (weekMap[w]?.[name]?.revenue || 0), 0)
                        const totalCst = weeks.reduce((s, w) => s + (weekMap[w]?.[name]?.cost || 0), 0)
                        return (
                          <tr key={name}>
                            <td style={{ fontWeight: 600, position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>{name}</td>
                            {weeks.map(w => {
                              const d = weekMap[w]?.[name]
                              const rev = d?.revenue || 0
                              const cst = d?.cost || 0
                              return <td key={w} style={{ textAlign: 'right', fontFamily: 'ui-monospace, monospace', fontVariantNumeric: 'tabular-nums', color: rev ? '#0B1E3D' : '#E0E4ED', lineHeight: 1.4 }}>
                                {rev ? <><span style={{ color: '#4A9EFF' }}>${rev.toLocaleString()}</span>{cst > 0 && <><br/><span style={{ color: '#E74C3C', fontSize: 11 }}>${cst.toLocaleString()}</span></>}</> : '—'}
                              </td>
                            })}
                            <td style={{ textAlign: 'right', fontFamily: 'ui-monospace, monospace', lineHeight: 1.4 }}>
                              <span style={{ fontWeight: 700, color: '#4A9EFF' }}>${Math.round(totalRev).toLocaleString()}</span>
                              {totalCst > 0 && <><br/><span style={{ fontWeight: 600, color: '#E74C3C', fontSize: 11 }}>${Math.round(totalCst).toLocaleString()}</span></>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '2px solid #F0F2F7' }}>
                        <td style={{ fontWeight: 700, position: 'sticky', left: 0, background: '#F7F8FB', zIndex: 1 }}>Weekly Total</td>
                        {weeks.map(w => {
                          const wRev = allDrivers.reduce((s, n) => s + (weekMap[w]?.[n]?.revenue || 0), 0)
                          const wCst = allDrivers.reduce((s, n) => s + (weekMap[w]?.[n]?.cost || 0), 0)
                          return <td key={w} style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'ui-monospace, monospace', lineHeight: 1.4 }}>
                            <span style={{ color: '#4A9EFF' }}>${Math.round(wRev).toLocaleString()}</span>
                            {wCst > 0 && <><br/><span style={{ color: '#E74C3C', fontSize: 11 }}>${Math.round(wCst).toLocaleString()}</span></>}
                          </td>
                        })}
                        <td style={{ textAlign: 'right', fontFamily: 'ui-monospace, monospace', lineHeight: 1.4 }}>
                          <span style={{ fontWeight: 700, fontSize: 15, color: '#4A9EFF' }}>${Math.round(totalRevenue).toLocaleString()}</span>
                          <br/><span style={{ fontWeight: 600, color: '#E74C3C', fontSize: 12 }}>${Math.round(totalCost).toLocaleString()}</span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </>
          )
        })()}
      </div>
  </>
}
