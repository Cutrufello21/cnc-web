export default function ScheduleAudit({ audit, auditLoading, selectedRecs, setSelectedRecs, applying, onApply }) {
  return (
    <div className="ops__audit">
      <div className="ops__audit-header">
        <h3>Routing Rules Audit</h3>
        {auditLoading && <span className="ops__audit-loading">Analyzing 90 days of dispatch data...</span>}
      </div>

      {audit && !auditLoading && <>
        {/* Summary cards */}
        <div className="ops__audit-summary">
          <div className="ops__audit-stat">
            <span className="ops__audit-stat-val">{audit.summary.totalRuleEntries}</span>
            <span className="ops__audit-stat-label">Total Rules</span>
          </div>
          <div className="ops__audit-stat">
            <span className="ops__audit-stat-val" style={{ color: '#16a34a' }}>{audit.summary.correct}</span>
            <span className="ops__audit-stat-label">Correct</span>
          </div>
          <div className="ops__audit-stat">
            <span className="ops__audit-stat-val" style={{ color: '#dc2626' }}>{audit.summary.critical}</span>
            <span className="ops__audit-stat-label">Critical</span>
          </div>
          <div className="ops__audit-stat">
            <span className="ops__audit-stat-val" style={{ color: '#d97706' }}>{audit.summary.high}</span>
            <span className="ops__audit-stat-label">High</span>
          </div>
          <div className="ops__audit-stat">
            <span className="ops__audit-stat-val">{audit.summary.recommendations}</span>
            <span className="ops__audit-stat-label">Fixes Available</span>
          </div>
        </div>

        {/* Recommendations */}
        {audit.recommendations?.length > 0 && <>
          <div className="ops__audit-recs-header">
            <h4>Recommended Changes ({audit.recommendations.length})</h4>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="ops__audit-select-all" onClick={() => setSelectedRecs(new Set(audit.recommendations.map((_, i) => i)))}>Select All</button>
              <button className="ops__audit-select-all" onClick={() => setSelectedRecs(new Set())}>Clear</button>
              <button className="ops__audit-apply" onClick={onApply} disabled={applying || selectedRecs.size === 0}>
                {applying ? 'Applying...' : `Apply ${selectedRecs.size} Selected`}
              </button>
            </div>
          </div>
          <div className="ops__audit-table-wrap">
            <table className="ops__audit-table">
              <thead><tr>
                <th></th>
                <th>ZIP</th>
                <th>Day</th>
                <th>Current Rule</th>
                <th></th>
                <th>Should Be</th>
                <th>Confidence</th>
                <th>Reason</th>
              </tr></thead>
              <tbody>
                {audit.recommendations.map((r, i) => (
                  <tr key={i} className={`ops__audit-row ops__audit-row--${r.severity}`}>
                    <td><input type="checkbox" checked={selectedRecs.has(i)} onChange={() => {
                      setSelectedRecs(prev => {
                        const next = new Set(prev)
                        next.has(i) ? next.delete(i) : next.add(i)
                        return next
                      })
                    }} /></td>
                    <td className="ops__audit-zip">{r.zip}</td>
                    <td>{r.dayFull}</td>
                    <td className="ops__audit-from">{r.from}</td>
                    <td className="ops__audit-arrow">→</td>
                    <td className="ops__audit-to">{r.to}</td>
                    <td><span className={`ops__audit-conf ops__audit-conf--${r.confidence >= 80 ? 'high' : r.confidence >= 60 ? 'med' : 'low'}`}>{r.confidence}%</span></td>
                    <td className="ops__audit-reason">{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>}

        {/* Mismatches without clear recommendation */}
        {audit.mismatches?.filter(m => !audit.recommendations.find(r => r.zip === m.zip && r.dayFull === m.day)).length > 0 && <>
          <h4 style={{ marginTop: 20, fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Other Mismatches ({audit.mismatches.filter(m => !audit.recommendations.find(r => r.zip === m.zip && r.dayFull === m.day)).length})
          </h4>
          <div className="ops__audit-table-wrap">
            <table className="ops__audit-table">
              <thead><tr><th>ZIP</th><th>Day</th><th>Rule</th><th>Actual Top</th><th>Details</th></tr></thead>
              <tbody>
                {audit.mismatches.filter(m => !audit.recommendations.find(r => r.zip === m.zip && r.dayFull === m.day)).slice(0, 20).map((m, i) => (
                  <tr key={i} className={`ops__audit-row ops__audit-row--${m.severity}`}>
                    <td className="ops__audit-zip">{m.zip}</td>
                    <td>{m.day}</td>
                    <td>{m.currentRule} ({m.currentRulePct}%)</td>
                    <td>{m.actualTop} ({m.actualTopPct}%)</td>
                    <td className="ops__audit-reason">{m.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>}
      </>}
    </div>
  )
}
