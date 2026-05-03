import './DispatchSummary.css'

export default function DispatchSummary({
  totalStops,
  totalColdChain,
  activeDriverCount,
  totalDriverCount,
  unassignedCount,
}) {
  const cards = [
    { label: 'Total Stops', value: totalStops, accent: false },
    { label: 'Cold Chain', value: totalColdChain, accent: true },
    { label: 'Active Drivers', value: `${activeDriverCount}/${totalDriverCount}`, accent: false },
  ]

  return (
    <div className="dsummary">
      {cards.map((c, i) => (
        <div key={i} className={`dsummary__card ${c.warn ? 'dsummary__card--warn' : ''}`}>
          <span className={`dsummary__value ${c.accent ? 'dsummary__value--accent' : ''} ${c.warn ? 'dsummary__value--warn' : ''}`}>
            {c.value}
          </span>
          <span className="dsummary__label">{c.label}</span>
        </div>
      ))}
    </div>
  )
}
