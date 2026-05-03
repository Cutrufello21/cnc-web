export default function PayrollInsights({ insights, loadingInsights, loadInsights }) {
  return (
    <div className="pay__insights">
      <div className="pay__insights-header">
        <h3 className="pay__insights-title">AI Insights</h3>
        {!insights && !loadingInsights && (
          <button className="pay__insights-btn" onClick={loadInsights}>
            Generate Insights
          </button>
        )}
      </div>
      {loadingInsights && (
        <div className="pay__insights-loading">
          <div className="dispatch__spinner" />
          <span>Analyzing delivery data...</span>
        </div>
      )}
      {insights && (
        <div className="pay__insights-content">
          {insights.split('\n').map((line, i) => {
            if (line.match(/^(KEY INSIGHTS|ANOMALIES|RECOMMENDATIONS|PREDICTION):/)) {
              return <h4 key={i} className="pay__insights-section">{line.replace(':', '')}</h4>
            }
            if (line.startsWith('•')) {
              return <p key={i} className="pay__insights-bullet">{line}</p>
            }
            if (line.trim()) {
              return <p key={i} className="pay__insights-text">{line}</p>
            }
            return null
          })}
        </div>
      )}
      <p className="pay__insights-note">AI insights are included in the payroll email when you Approve & Send</p>
    </div>
  )
}
