import './BrandMark.css'

export default function BrandMark({ variant = 'light', size = 'default' }) {
  return (
    <div className={`brand-mark brand-mark--${variant} brand-mark--${size}`}>
      <span className="brand-mark__cnc">CNC</span>
      <span className="brand-mark__rule" />
      <div className="brand-mark__right">
        <span className="brand-mark__delivery">DELIVERY</span>
        <span className="brand-mark__line" />
        <span className="brand-mark__tagline">The last mile in patient care</span>
      </div>
    </div>
  )
}
