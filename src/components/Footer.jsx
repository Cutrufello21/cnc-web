import BrandMark from './BrandMark'
import './Footer.css'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <div className="footer__brand">
          <BrandMark variant="light" />
          <p className="footer__tagline">The last mile in patient care.</p>
        </div>

        <div className="footer__links">
          <div className="footer__col">
            <h4>Services</h4>
            <a href="#services">How It Works</a>
            <a href="#coverage">Coverage Area</a>
            <a href="mailto:dom@cncdeliveryservice.com">Request a Consultation</a>
          </div>
          <div className="footer__col">
            <h4>Team</h4>
            <a href="/login">Driver Portal</a>
            <a href="/login">Dispatch Dashboard</a>
          </div>
          <div className="footer__col">
            <h4>Contact</h4>
            <a href="mailto:dom@cncdeliveryservice.com">dom@cncdeliveryservice.com</a>
            <a href="tel:+13306346260">(330) 634-6260</a>
            <span className="footer__location">Akron, Ohio</span>
          </div>
        </div>

        <div className="footer__compliance">
          HIPAA-compliant operations &nbsp;·&nbsp; BAA available upon request
        </div>

        <div className="footer__bottom">
          <p>&copy; {new Date().getFullYear()} CNC Delivery Service. All rights reserved.</p>
          <p className="footer__address">
            Akron, Ohio &nbsp;·&nbsp; dom@cncdeliveryservice.com &nbsp;·&nbsp; (330) 634-6260 &nbsp;·&nbsp; cncdelivery.com
          </p>
        </div>
      </div>
    </footer>
  )
}
