import './Footer.css'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <div className="footer__brand">
          <div className="footer__logo">
            <span className="footer__logo-icon">CNC</span>
            <span className="footer__logo-text">Delivery</span>
          </div>
          <p className="footer__tagline">
            Medication delivered with care.
            <br />
            Northeast Ohio's trusted pharmacy courier.
          </p>
        </div>

        <div className="footer__links">
          <div className="footer__col">
            <h4>Service</h4>
            <a href="#services">How It Works</a>
            <a href="#coverage">Coverage Area</a>
            <a href="mailto:dom@cncdeliveryservice.com">Contact</a>
          </div>
          <div className="footer__col">
            <h4>Team</h4>
            <a href="/login">Driver Portal</a>
            <a href="/login">Dispatch Dashboard</a>
          </div>
        </div>

        <div className="footer__bottom">
          <p>&copy; {new Date().getFullYear()} CNC Delivery Service. All rights reserved.</p>
          <p className="footer__address">Northeast Ohio &middot; dom@cncdeliveryservice.com</p>
        </div>
      </div>
    </footer>
  )
}
