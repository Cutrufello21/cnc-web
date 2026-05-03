export default function KPICard({ label, value, sub, trend, accent }) {
  return (
    <div className="hq__kpi">
      <span className="hq__kpi-label">{label}</span>
      <span className={`hq__kpi-value ${accent ? 'hq__kpi-value--accent' : ''}`}>{value}</span>
      <span className={`hq__kpi-sub ${trend === 'up' ? 'hq__kpi-sub--up' : ''} ${trend === 'down' ? 'hq__kpi-sub--down' : ''}`}>{sub}</span>
    </div>
  )
}
