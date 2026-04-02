import './PrivacyPage.css'

export default function SupportPage() {
  return (
    <div className="privacy">
      <div className="privacy__inner">
        <h1>Support</h1>
        <p className="privacy__updated">C&C Delivery Service — Driver App Support</p>

        <h2>About the App</h2>
        <p>
          The C&C Driver app is an internal tool used by delivery drivers employed by
          C&C Delivery Service, a pharmacy delivery company based in Northeast Ohio.
          The app helps drivers manage their delivery routes, navigate to patient
          addresses, and confirm completed deliveries.
        </p>

        <h2>Getting Help</h2>
        <p>
          If you're a C&C Delivery driver and need help with the app, please reach out
          to us using any of the methods below:
        </p>

        <h3>Email</h3>
        <p>
          <a href="mailto:support@cncdelivery.com">support@cncdelivery.com</a>
        </p>

        <h3>Phone</h3>
        <p>
          <a href="tel:+13305551234">(330) 555-1234</a>
        </p>

        <h3>Hours</h3>
        <p>Monday – Friday, 7:00 AM – 6:00 PM EST</p>

        <h2>Account Setup</h2>
        <p>
          Driver accounts are created by the company administrator through our dispatch
          portal. If you are a new driver and need login credentials, please contact your
          dispatcher or supervisor.
        </p>

        <h2>Frequently Asked Questions</h2>

        <h3>How do I log in?</h3>
        <p>
          Use the email and password provided by your dispatcher. If you forgot your
          password, contact your dispatcher to have it reset.
        </p>

        <h3>How do I view my route?</h3>
        <p>
          After logging in, your assigned stops for the day will appear on the main
          screen. Tap any stop to see the full address and navigate using Apple Maps.
        </p>

        <h3>The app isn't loading my stops.</h3>
        <p>
          Make sure you have a stable internet connection. Pull down on the stops list
          to refresh. If the issue persists, contact your dispatcher.
        </p>

        <h3>How do I report a problem?</h3>
        <p>
          Email <a href="mailto:support@cncdelivery.com">support@cncdelivery.com</a> with
          a description of the issue and we'll get back to you as soon as possible.
        </p>

        <div style={{ marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px solid #e5e7eb' }}>
          <p style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
            C&C Delivery Service &middot; Northeast Ohio<br />
            <a href="/privacy" style={{ color: '#9ca3af' }}>Privacy Policy</a>
          </p>
        </div>
      </div>
    </div>
  )
}
