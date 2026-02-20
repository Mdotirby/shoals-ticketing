import Footer from "../components/Footer";

export const metadata = {
  title: "Do Not Sell My Info | VenueCore",
};

export default function DoNotSellPage() {
  return (
    <>
      <main className="policy-page">
        <div className="policy-container">
          <h1 className="policy-title">Do Not Sell My Personal Information</h1>
          <p className="policy-effective">Effective Date: February 20, 2026</p>

          <section className="policy-section">
            <h2>Our Commitment</h2>
            <p>
              At VenueCore, we respect your privacy and are committed to transparency about how we handle your personal information. <strong>We do not sell your personal information to third parties.</strong>
            </p>
            <p>
              This page is provided in accordance with applicable privacy laws, including the California Consumer Privacy Act (CCPA) and similar state and federal regulations that give consumers the right to opt out of the sale of their personal information.
            </p>
          </section>

          <section className="policy-section">
            <h2>What Does &quot;Sale&quot; of Personal Information Mean?</h2>
            <p>
              Under the CCPA and similar laws, the &quot;sale&quot; of personal information is broadly defined to include selling, renting, releasing, disclosing, disseminating, making available, transferring, or otherwise communicating a consumer&apos;s personal information to a third party for monetary or other valuable consideration.
            </p>
          </section>

          <section className="policy-section">
            <h2>VenueCore&apos;s Practices</h2>
            <p>
              VenueCore does not engage in the sale of personal information as defined by applicable law. Specifically:
            </p>
            <ul>
              <li>We do not sell your name, email address, phone number, or any other personal data to third-party marketers or data brokers.</li>
              <li>We do not exchange personal information for monetary compensation.</li>
              <li>We do not share your personal information with third parties for their own marketing purposes without your explicit consent.</li>
            </ul>
          </section>

          <section className="policy-section">
            <h2>Information We Do Share</h2>
            <p>
              While we do not sell your information, we may share certain data with trusted service providers who help us operate our platform. These include:
            </p>
            <ul>
              <li><strong>Payment Processors (Stripe):</strong> To process ticket purchases securely.</li>
              <li><strong>Event Organizers &amp; Venues:</strong> Ticket holder names for event entry and management purposes.</li>
              <li><strong>Email Service Providers:</strong> To deliver order confirmations, tickets, and newsletter communications you&apos;ve opted into.</li>
              <li><strong>Hosting &amp; Infrastructure Providers:</strong> To operate and secure our platform.</li>
            </ul>
            <p>
              These service providers are contractually obligated to use your information only for the purposes of providing services to VenueCore and are prohibited from selling or using your data for their own purposes.
            </p>
          </section>

          <section className="policy-section">
            <h2>Your Rights</h2>
            <p>Depending on your jurisdiction, you may have the following rights:</p>
            <ul>
              <li><strong>Right to Know:</strong> Request details about the personal information we collect, use, and disclose.</li>
              <li><strong>Right to Delete:</strong> Request deletion of your personal information, subject to certain legal exceptions.</li>
              <li><strong>Right to Opt-Out:</strong> Although we do not sell personal information, you may still submit an opt-out request and we will honor it.</li>
              <li><strong>Right to Non-Discrimination:</strong> We will not discriminate against you for exercising any of your privacy rights.</li>
            </ul>
          </section>

          <section className="policy-section">
            <h2>How to Submit a Request</h2>
            <p>
              To exercise any of your privacy rights or if you have questions about our data practices, please contact us:
            </p>
            <p>
              <strong>VenueCore</strong><br />
              Email: privacy@venuecore.com
            </p>
            <p>
              We will respond to verified requests within 45 days, as required by applicable law. We may need to verify your identity before processing your request.
            </p>
          </section>

          <section className="policy-section">
            <h2>Changes to This Notice</h2>
            <p>
              We may update this page from time to time. Any changes will be posted here with a revised effective date. We encourage you to review this page periodically.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
