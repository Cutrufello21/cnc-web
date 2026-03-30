import './PrivacyPage.css'

export default function PrivacyPage() {
  return (
    <div className="privacy">
      <div className="privacy__inner">
        <h1>Privacy Policy</h1>
        <p className="privacy__updated">Last updated: March 30, 2026</p>

        <p>
          CNC Delivery Service ("we," "us," or "our") operates the C&C Driver mobile application
          and the cncdelivery.com website (collectively, the "Services"). This Privacy Policy
          describes how we collect, use, and protect your information when you use our Services.
        </p>

        <h2>Information We Collect</h2>

        <h3>Account Information</h3>
        <p>
          When you are set up as a driver, we collect your name, email address, phone number,
          and driver identification number.
        </p>

        <h3>Location Data</h3>
        <p>
          The C&C Driver app collects precise GPS location data to provide turn-by-turn navigation,
          route optimization, and mileage tracking. Location data is collected while the app is in
          use and, with your permission, in the background to record mileage and route data during
          active deliveries. You can disable background location access in your device settings at
          any time, though this may limit app functionality.
        </p>

        <h3>Delivery Data</h3>
        <p>
          We collect information about delivery stops including addresses, order numbers, delivery
          status, timestamps, and route information. This data is used to manage and optimize
          delivery operations.
        </p>

        <h3>Device Information</h3>
        <p>
          We may collect device type, operating system version, and app version for troubleshooting
          and compatibility purposes.
        </p>

        <h2>How We Use Your Information</h2>
        <ul>
          <li>Provide turn-by-turn navigation and route optimization</li>
          <li>Track and record delivery completions</li>
          <li>Calculate mileage for driver records and tax purposes</li>
          <li>Coordinate deliveries between drivers and dispatch</li>
          <li>Improve our delivery operations and Services</li>
        </ul>

        <h2>Information Sharing</h2>
        <p>
          We do not sell your personal information. We may share information with:
        </p>
        <ul>
          <li><strong>Pharmacy partners</strong> — delivery status and order information necessary to fulfill deliveries</li>
          <li><strong>Service providers</strong> — such as Mapbox (mapping/navigation) and Supabase (data storage), who process data on our behalf</li>
          <li><strong>Legal requirements</strong> — when required by law or to protect our rights</li>
        </ul>

        <h2>Data Retention</h2>
        <p>
          Delivery records and route data are retained for business and compliance purposes.
          Location data from completed routes is retained for mileage records and operational
          improvement. You may request deletion of your personal data by contacting us.
        </p>

        <h2>Data Security</h2>
        <p>
          We use industry-standard security measures including encrypted data transmission (TLS),
          secure authentication, and access controls. Our operations are HIPAA-compliant where
          applicable to protected health information.
        </p>

        <h2>Your Rights</h2>
        <p>You may:</p>
        <ul>
          <li>Request access to the personal data we hold about you</li>
          <li>Request correction of inaccurate data</li>
          <li>Request deletion of your data</li>
          <li>Disable location tracking in your device settings</li>
        </ul>

        <h2>Children's Privacy</h2>
        <p>
          Our Services are not intended for use by anyone under the age of 18.
          We do not knowingly collect information from children.
        </p>

        <h2>Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. Changes will be posted on this
          page with an updated revision date.
        </p>

        <h2>Contact Us</h2>
        <p>
          If you have questions about this Privacy Policy or your data, contact us at:
        </p>
        <p>
          CNC Delivery Service<br />
          Akron, Ohio<br />
          <a href="mailto:dom@cncdeliveryservice.com">dom@cncdeliveryservice.com</a><br />
          <a href="tel:+13306346260">(330) 634-6260</a>
        </p>
      </div>
    </div>
  )
}
