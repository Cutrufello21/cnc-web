import './RecentLog.css'

export default function RecentLog({ logs }) {
  return (
    <section className="dispatch__section" style={{ marginTop: 40 }}>
      <h2 className="dispatch__section-title">Recent Dispatch Log</h2>
      <div className="dispatch__table-wrap">
        <table className="dispatch__table rlog">
          <thead>
            <tr>
              <th>Date</th>
              <th>Day</th>
              <th>Orders</th>
              <th>Unassigned</th>
              <th>Cold Chain</th>
              <th>Corrections</th>
              <th>Top Driver</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log, i) => (
              <tr key={i}>
                <td className="rlog__date">{log.Date || '—'}</td>
                <td>{log['Delivery Day'] || '—'}</td>
                <td className="rlog__num">{log['Orders Processed'] || '0'}</td>
                <td className={`rlog__num ${parseInt(log['Unassigned Count']) > 0 ? 'rlog__warn' : ''}`}>
                  {log['Unassigned Count'] || '0'}
                </td>
                <td className="rlog__num">{log['Cold Chain'] || '0'}</td>
                <td className="rlog__num">{log['Corrections'] || '0'}</td>
                <td>
                  <span className="rlog__driver">{log['Top Driver'] || '—'}</span>
                  {log['Top Stops'] && <span className="rlog__stops"> ({log['Top Stops']})</span>}
                </td>
                <td>
                  <span className={`rlog__status ${log.Status === 'Complete' ? 'rlog__status--ok' : ''}`}>
                    {log.Status || '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
