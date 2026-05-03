export default function PayrollTable({ data, getAdjustedPay, getAdjustedTotal, getPerStopShadow, getEditedValue, hasEdits, handleEdit, saveEdit, saving, adjustedTotal }) {
  return <>
    <div className="pay__table-wrap">
      <table className="pay__table">
        <thead>
          <tr>
            <th>Driver</th>
            <th>ID</th>
            <th className="pay__th-num">Mon</th>
            <th className="pay__th-num">Tue</th>
            <th className="pay__th-num">Wed</th>
            <th className="pay__th-num">Thu</th>
            <th className="pay__th-num">Fri</th>
            <th className="pay__th-num">Total</th>
            <th className="pay__th-num">Rate</th>
            <th className="pay__th-num">Will Calls</th>
            <th className="pay__th-num">Office Fee</th>
            <th className="pay__th-num pay__th-pay">Weekly Pay</th>
          </tr>
        </thead>
        <tbody>
          {data.drivers.map((d) => {
            const adjustedPay = getAdjustedPay(d)
            const payDiffers = Math.abs(adjustedPay - d.sheetPay) > 0.01 && d.sheetPay > 0
            const wcEdited = hasEdits(d.name, 'Will Calls')

            return (
              <tr key={d.name} className={d.isFlat ? 'pay__row--flat' : ''}>
                <td className="pay__cell-name">{d.name}</td>
                <td className="pay__cell-id">{d.id}</td>
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(day => {
                  const orig = d[day.toLowerCase()]
                  const dayEdited = hasEdits(d.name, day)
                  return (
                    <td key={day} className="pay__cell-edit">
                      {d.isFlat && d.name === 'Paul' ? '—' : (
                        <input
                          type="number"
                          className={`pay__edit-input pay__edit-input--day ${dayEdited ? 'pay__edit-input--changed' : ''}`}
                          value={getEditedValue(d.name, day, orig || '')}
                          onChange={(e) => handleEdit(d.name, day, e.target.value)}
                          onBlur={() => dayEdited && saveEdit(d, day)}
                          onKeyDown={(e) => e.key === 'Enter' && dayEdited && saveEdit(d, day)}
                          min="0"
                          placeholder="0"
                        />
                      )}
                    </td>
                  )
                })}
                <td className="pay__cell-num pay__cell-total">{getAdjustedTotal(d)}</td>
                <td className="pay__cell-rate">
                  {d.isFlat ? (() => {
                    const vals = d.shadowRates ? [d.shadowRates.mon, d.shadowRates.tue, d.shadowRates.wed, d.shadowRates.thu, d.shadowRates.fri] : null
                    const allSame = vals && vals.every(v => v === vals[0])
                    const ratePart = vals ? (allSame ? `$${vals[0]}/stop` : `${vals.map(v => `$${v}`).join('/')}/stop`) : null
                    const wcPart = d.shadowWcRate ? ` + $${d.shadowWcRate}/wc` : ''
                    const shadowLabel = ratePart ? `@ ${ratePart}${wcPart}` : null
                    return <>
                      <div>Flat</div>
                      {shadowLabel && <div style={{ fontSize: 10, color: '#9BA5B4', marginTop: 2 }}>{shadowLabel}</div>}
                    </>
                  })() : d.rates ? (() => {
                    const vals = [d.rates.mon, d.rates.tue, d.rates.wed, d.rates.thu, d.rates.fri]
                    const allSame = vals.every(v => v === vals[0])
                    return allSame ? `$${vals[0]}` : vals.map(v => `$${v}`).join('/')
                  })() : '—'}
                </td>
                <td className="pay__cell-edit">
                  {d.isFlat ? '—' : (
                    <div className="pay__edit-wrap">
                      <input
                        type="number"
                        className={`pay__edit-input ${wcEdited ? 'pay__edit-input--changed' : ''}`}
                        value={getEditedValue(d.name, 'Will Calls', d.willCalls || '')}
                        onChange={(e) => handleEdit(d.name, 'Will Calls', e.target.value)}
                        onBlur={() => wcEdited && saveEdit(d, 'Will Calls')}
                        onKeyDown={(e) => e.key === 'Enter' && wcEdited && saveEdit(d, 'Will Calls')}
                        min="0"
                        placeholder="0"
                      />
                      {saving === `${d.name}:Will Calls` && <span className="pay__saving">...</span>}
                    </div>
                  )}
                </td>
                <td className={`pay__cell-num ${d.officeFee < 0 ? 'pay__cell-fee' : ''}`}>
                  {d.officeFee ? `$${d.officeFee}` : '—'}
                </td>
                <td className="pay__cell-pay">
                  <span className={payDiffers ? 'pay__adjusted' : ''}>
                    ${adjustedPay.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                  {d.isFlat && getPerStopShadow && (() => {
                    const shadow = getPerStopShadow(d)
                    if (shadow == null || getAdjustedTotal(d) === 0) return null
                    return (
                      <div style={{ fontSize: 11, color: '#9BA5B4', marginTop: 2, fontWeight: 400 }}>
                        ${shadow.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                    )
                  })()}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="pay__footer">
            <td colSpan={7}>TOTAL</td>
            <td className="pay__cell-num pay__cell-total">
              {data.drivers.reduce((s, d) => s + getAdjustedTotal(d), 0)}
            </td>
            <td></td>
            <td className="pay__cell-num">
              {data.drivers.reduce((s, d) => s + (parseInt(getEditedValue(d.name, 'Will Calls', d.willCalls)) || 0), 0)}
            </td>
            <td className="pay__cell-num pay__cell-fee">
              ${data.drivers.reduce((s, d) => s + d.officeFee, 0)}
            </td>
            <td className="pay__cell-pay pay__cell-grand">
              ${adjustedTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div className="pay__legend">
      <span>Rate: per delivery (Mon/Tue/Wed/Thu/Fri if different)</span>
      <span>Will Calls: $9 each</span>
      <span>Flat: Mark $1,550 · Dom $2,500 · Paul $2,000</span>
      <span>Per-stop shadow: Mark/Dom @ $9/stop + $10/will-call. Flat is authoritative.</span>
    </div>
  </>
}
