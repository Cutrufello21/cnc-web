import './TrustBar.css'

const items = [
  'In operation since 2007',
  '1.3M+ deliveries since 2007',
  '215,000+ verified deliveries since 2023',
  '300–600 deliveries daily',
  'Zero subcontractors. Zero exceptions.',
  '200+ ZIP codes across Northeast Ohio',
  '8 AM–6 PM — a window we\'ve never missed',
  'Routes built for Northeast Ohio, not a national algorithm',
]

export default function TrustBar() {
  return (
    <section className="trust">
      <div className="trust__inner">
        <div className="trust__track">
          {[...items, ...items].map((item, i) => (
            <span key={i} className="trust__item">
              {item}
              <span className="trust__dot">&middot;</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
