import './TrustBar.css'

const items = [
  'Serving pharmacies since 2007',
  '215,000+ verified deliveries since 2023',
  '300–600 orders nightly',
  '17 dedicated drivers',
  'Zero subcontractors',
  '200+ ZIP codes covered',
  '8 AM–6 PM delivery window — never missed',
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
