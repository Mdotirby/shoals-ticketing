import Footer from "../components/Footer";

export const metadata = {
  title: "Privacy Policy | VenueCore",
};

export default function PrivacyPolicyPage() {
  return (
    <>
      <main className="policy-page">
        <div className="policy-container">
          <h1 className="policy-title">Privacy Policy</h1>
          <p className="policy-effective">Effective Date: February 20, 2026</p>

          <section className="policy-section">
            <h2>1. Introduction</h2>
            <p>
              VenueCore (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website, use our ticketing platform, or interact with our services (collectively, the &quot;Services&quot;). By using our Services, you consent to the practices described in this policy.
            </p>
          </section>

          <section className="policy-section">
            <h2>2. Information We Collect</h2>
            <h3>Personal Information You Provide</h3>
            <ul>
              <li><strong>Account &amp; Contact Information:</strong> Name, email address, phone number, and mailing address when you create an account or sign up for our newsletter.</li>
              <li><strong>Payment Information:</strong> Credit/debit card details and billing address processed securely through our third-party payment processor (Stripe). We do not store your full card number on our servers.</li>
              <li><strong>Event-Related Data:</strong> Ticket purchases, event preferences, auction bids, and other interactions with events on our platform.</li>
              <li><strong>Communications:</strong> Information you provide when contacting us, submitting feedback, or participating in surveys.</li>
            </ul>

            <h3>Information Collected Automatically</h3>
            <ul>
              <li><strong>Device &amp; Usage Data:</strong> IP address, browser type, operating system, referring URLs, pages viewed, time spent on pages, and click patterns.</li>
              <li><strong>Cookies &amp; Tracking Technologies:</strong> We use cookies, web beacons, and similar technologies to enhance your experience and analyze usage. See our <a href="/cookies">Cookie Policy</a> for details.</li>
              <li><strong>Location Data:</strong> Approximate geographic location based on your IP address.</li>
            </ul>
          </section>

          <section className="policy-section">
            <h2>3. How We Use Your Information</h2>
            <ul>
              <li>Process ticket purchases and event registrations</li>
              <li>Send order confirmations, tickets, and event updates</li>
              <li>Deliver newsletter content including presale access, exclusive offers, and event announcements</li>
              <li>Improve and personalize our Services</li>
              <li>Communicate about promotions, new features, and partner offers</li>
              <li>Detect and prevent fraud and unauthorized access</li>
              <li>Comply with legal obligations</li>
              <li>Analyze trends and user behavior to improve the platform</li>
            </ul>
          </section>

          <section className="policy-section">
            <h2>4. How We Share Your Information</h2>
            <p>We do not sell your personal information. We may share your data with:</p>
            <ul>
              <li><strong>Event Organizers &amp; Venues:</strong> Names and ticket details necessary for event entry and management.</li>
              <li><strong>Service Providers:</strong> Third-party vendors who assist in operating our platform (e.g., payment processors, email services, hosting providers).</li>
              <li><strong>Legal Requirements:</strong> When required by law, regulation, or legal process.</li>
              <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets.</li>
            </ul>
          </section>

          <section className="policy-section">
            <h2>5. Data Retention</h2>
            <p>
              We retain your personal information for as long as your account is active or as needed to provide you with our Services. We may also retain and use your information to comply with legal obligations, resolve disputes, and enforce our agreements.
            </p>
          </section>

          <section className="policy-section">
            <h2>6. Your Rights &amp; Choices</h2>
            <ul>
              <li><strong>Access &amp; Correction:</strong> You may request access to or correction of your personal information.</li>
              <li><strong>Deletion:</strong> You may request deletion of your personal information, subject to legal retention requirements.</li>
              <li><strong>Opt-Out of Marketing:</strong> You can unsubscribe from marketing emails at any time using the link in any email we send.</li>
              <li><strong>Do Not Sell:</strong> We do not sell personal information. For more details, visit our <a href="/do-not-sell">Do Not Sell My Info</a> page.</li>
              <li><strong>Cookie Preferences:</strong> You can manage cookie settings through your browser. See our <a href="/cookies">Cookie Policy</a>.</li>
            </ul>
          </section>

          <section className="policy-section">
            <h2>7. Security</h2>
            <p>
              We implement industry-standard security measures including SSL/TLS encryption, secure payment processing via Stripe, access controls, and regular security assessments. However, no method of electronic transmission or storage is 100% secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section className="policy-section">
            <h2>8. Children&apos;s Privacy</h2>
            <p>
              Our Services are not directed to individuals under the age of 13. We do not knowingly collect personal information from children under 13. If we learn we have collected such information, we will promptly delete it.
            </p>
          </section>

          <section className="policy-section">
            <h2>9. Third-Party Links</h2>
            <p>
              Our Services may contain links to third-party websites or services. We are not responsible for the privacy practices of these third parties. We encourage you to review their privacy policies.
            </p>
          </section>

          <section className="policy-section">
            <h2>10. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of material changes by posting the updated policy on our website with a revised effective date. Your continued use of our Services after any changes constitutes acceptance of the updated policy.
            </p>
          </section>

          <section className="policy-section">
            <h2>11. Contact Us</h2>
            <p>
              If you have questions about this Privacy Policy or wish to exercise your rights, please contact us at:
            </p>
            <p>
              <strong>VenueCore</strong><br />
              Email: privacy@venuecore.com<br />
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
