import './PrivacyPage.css'

export default function HipaaPage() {
  return (
    <div className="privacy">
      <div className="privacy__inner">
        <h1>HIPAA Compliance & BAA</h1>
        <p className="privacy__updated">Last updated: April 5, 2026</p>

        <p>
          CNC Delivery Service ("CNC," "we," "us") is a medical courier operating in Northeast Ohio
          that transports prescription medications and medical supplies on behalf of pharmacy partners.
          We handle Protected Health Information (PHI) in the course of these deliveries and maintain
          HIPAA-compliant operations across our technology, workforce, and business processes.
        </p>

        <h2>Our Role Under HIPAA</h2>
        <p>
          CNC Delivery Service operates as a <strong>Business Associate</strong> to our pharmacy
          partners (Covered Entities) under the HIPAA Privacy, Security, and Breach Notification
          Rules (45 CFR Parts 160 and 164). We receive the minimum necessary PHI required to
          complete deliveries — specifically patient names and delivery addresses — and we are
          contractually bound to protect this information.
        </p>

        <h2>Business Associate Agreement (BAA)</h2>
        <p>
          We execute a Business Associate Agreement with every pharmacy partner before handling any
          PHI. Our BAA covers:
        </p>
        <ul>
          <li>Permitted uses and disclosures of PHI limited to delivery operations</li>
          <li>Implementation of administrative, physical, and technical safeguards</li>
          <li>Breach notification obligations (without unreasonable delay, no later than 60 days)</li>
          <li>Return or destruction of PHI upon contract termination</li>
          <li>Right of Covered Entity to terminate if CNC materially breaches the agreement</li>
          <li>Obligations extend to any subcontractors who access PHI</li>
        </ul>
        <p>
          To request a copy of our BAA or initiate a new agreement, contact us at{' '}
          <a href="mailto:dom@cncdeliveryservice.com">dom@cncdeliveryservice.com</a>.
        </p>

        <h2>PHI We Handle</h2>
        <p>
          In the course of delivery operations, CNC accesses the following PHI elements:
        </p>
        <ul>
          <li><strong>Patient name</strong> — for delivery verification at the door</li>
          <li><strong>Delivery address</strong> — for routing and navigation</li>
          <li><strong>Delivery outcome</strong> — delivered, failed, and reason codes</li>
          <li><strong>Address notes</strong> — driver-entered notes for future deliveries (e.g., gate codes, access instructions)</li>
        </ul>
        <p>
          We do not access, store, or transmit any clinical information, diagnoses, prescription
          details, or insurance data. We apply the HIPAA Minimum Necessary standard — our systems
          only contain the data required to complete the delivery.
        </p>

        <h2>Technical Safeguards</h2>

        <h3>Encryption at Rest</h3>
        <p>
          All PHI fields (patient name, address, delivery outcome, address notes) are encrypted at
          the application layer using <strong>XSalsa20-Poly1305</strong> authenticated encryption
          (via libsodium) before being written to our database. Our database provider (Supabase)
          stores only encrypted ciphertext — it never sees plaintext PHI. Encryption keys are
          generated per device, stored in the iOS Keychain via Expo SecureStore, and never leave
          the device.
        </p>

        <h3>Encryption in Transit</h3>
        <p>
          All data transmitted between our mobile app, web portal, and backend services is encrypted
          using TLS 1.2 or higher. API endpoints enforce HTTPS. No PHI is ever transmitted over
          unencrypted channels.
        </p>

        <h3>Server-Side Geocoding</h3>
        <p>
          Patient addresses are geocoded exclusively on our server using the U.S. Census Bureau
          Geocoding API — a federal government service that does not retain query data. We
          previously identified that client-side geocoding through third-party mapping services
          could expose PHI. That path has been eliminated. Geocoding results are cached server-side
          in our database so addresses are only sent to the Census API once.
        </p>

        <h3>Offline Data Minimization</h3>
        <p>
          When a driver loses cellular connectivity, our app queues delivery confirmations locally.
          The offline queue stores only:
        </p>
        <ul>
          <li>Stop ID (internal identifier)</li>
          <li>Delivery status (delivered or failed)</li>
          <li>Reason code (if failed)</li>
          <li>Timestamp and GPS coordinates</li>
        </ul>
        <p>
          No patient names, addresses, or other PHI are stored in the offline queue. When
          connectivity returns, the app sends the stop ID and status to our server, which looks up
          the full record to complete the sync.
        </p>

        <h3>Authentication & Access Controls</h3>
        <ul>
          <li>Driver app requires authentication — each driver sees only their own assigned stops</li>
          <li>Dispatch portal is role-gated — only authorized dispatchers can access the full view</li>
          <li>Supabase Row Level Security (RLS) enforces per-driver data isolation at the database layer</li>
          <li>Session tokens are stored in the iOS Keychain, not in application storage</li>
        </ul>

        <h2>Administrative Safeguards</h2>
        <ul>
          <li><strong>Workforce training</strong> — All drivers are briefed on PHI handling requirements, including not photographing labels, not sharing patient information, and proper device security</li>
          <li><strong>Minimum necessary access</strong> — Drivers see only the stops assigned to them for the current delivery date</li>
          <li><strong>Incident response</strong> — We maintain a breach response process including identification, containment, risk assessment, notification to the Covered Entity, and documentation</li>
          <li><strong>Device policy</strong> — Drivers are required to use device passcodes and keep their operating system current</li>
        </ul>

        <h2>Physical Safeguards</h2>
        <ul>
          <li><strong>Cold chain compliance</strong> — Temperature-sensitive medications are transported in insulated containers with monitoring. Cold chain stops are flagged in-app for driver awareness</li>
          <li><strong>Delivery verification</strong> — GPS coordinates and timestamps are recorded at the point of delivery</li>
          <li><strong>Controlled substance handling</strong> — Signature-required deliveries are flagged and tracked separately</li>
        </ul>

        <h2>Subcontractors & Third Parties</h2>
        <p>
          Our technology stack includes the following service providers. None receive plaintext PHI:
        </p>
        <ul>
          <li><strong>Supabase</strong> (database & auth) — Stores only encrypted ciphertext for PHI columns. SOC 2 Type II certified</li>
          <li><strong>Vercel</strong> (API hosting) — Processes API requests; PHI is encrypted before reaching the database. SOC 2 Type II certified</li>
          <li><strong>Mapbox</strong> (navigation) — Receives only GPS coordinates for turn-by-turn routing, never patient names or addresses</li>
          <li><strong>U.S. Census Bureau</strong> (geocoding) — Federal government service; receives addresses for coordinate lookup. Not subject to HIPAA but does not retain query data</li>
          <li><strong>Apple (TestFlight / App Store)</strong> — Distributes the app binary only; no PHI passes through Apple's infrastructure</li>
        </ul>

        <h2>Breach Notification</h2>
        <p>
          In the event of a breach of unsecured PHI, CNC Delivery Service will:
        </p>
        <ul>
          <li>Notify the affected Covered Entity without unreasonable delay and no later than 60 calendar days from discovery</li>
          <li>Provide the identity of each individual affected (if known), a description of the PHI involved, recommended steps for individuals to protect themselves, and a description of what CNC is doing to mitigate harm</li>
          <li>Cooperate with the Covered Entity's own notification obligations to affected individuals and HHS</li>
          <li>Document the breach, investigation, and outcome in an internal log retained for six years</li>
        </ul>

        <h2>Your Rights</h2>
        <p>
          If you are a patient whose information was handled by CNC in the course of a delivery,
          your rights under HIPAA (access, amendment, accounting of disclosures) are exercised
          through your pharmacy (the Covered Entity). We will cooperate with any such request
          directed to us by the pharmacy.
        </p>

        <h2>Contact</h2>
        <p>
          For questions about our HIPAA compliance, to request a BAA, or to report a
          potential security concern:
        </p>
        <p>
          CNC Delivery Service<br />
          HIPAA Compliance — Dom Cutrufello, Owner/Operator<br />
          Akron, Ohio<br />
          <a href="mailto:dom@cncdeliveryservice.com">dom@cncdeliveryservice.com</a><br />
          <a href="tel:+13306346260">(330) 634-6260</a>
        </p>
      </div>
    </div>
  )
}
