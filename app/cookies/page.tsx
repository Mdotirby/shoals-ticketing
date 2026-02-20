import Footer from "../components/Footer";

export const metadata = {
  title: "Cookie Policy | VenueCore",
};

export default function CookiePolicyPage() {
  return (
    <>
      <main className="policy-page">
        <div className="policy-container">
          <h1 className="policy-title">Cookie Policy</h1>
          <p className="policy-effective">Effective Date: February 20, 2026</p>

          <section className="policy-section">
            <h2>1. What Are Cookies?</h2>
            <p>
              Cookies are small text files placed on your device when you visit a website. They help the site remember your preferences, understand how you interact with the site, and improve your overall experience. Cookies may be &quot;session&quot; cookies (deleted when you close your browser) or &quot;persistent&quot; cookies (remaining on your device for a set period or until you delete them).
            </p>
          </section>

          <section className="policy-section">
            <h2>2. How VenueCore Uses Cookies</h2>
            <p>We use cookies and similar tracking technologies for the following purposes:</p>

            <h3>Essential Cookies</h3>
            <p>
              These cookies are necessary for our platform to function properly. They enable core features like secure login, ticket checkout, and session management. Without these cookies, our Services cannot operate as intended.
            </p>
            <ul>
              <li>Authentication and session tokens</li>
              <li>Shopping cart and checkout state</li>
              <li>Security and fraud prevention</li>
              <li>Venue-specific theme and configuration</li>
            </ul>

            <h3>Analytics Cookies</h3>
            <p>
              These cookies help us understand how visitors interact with our platform. We use this data to improve site performance, content, and user experience.
            </p>
            <ul>
              <li>Page views and navigation patterns</li>
              <li>Event listing engagement</li>
              <li>Feature usage and performance metrics</li>
            </ul>

            <h3>Functional Cookies</h3>
            <p>
              These cookies remember your preferences and choices to provide a more personalized experience.
            </p>
            <ul>
              <li>Language and region preferences</li>
              <li>Previously viewed events</li>
              <li>Search history and filters</li>
            </ul>

            <h3>Marketing Cookies</h3>
            <p>
              These cookies may be used to deliver relevant advertisements and track the effectiveness of marketing campaigns. We may use third-party advertising partners who set these cookies.
            </p>
            <ul>
              <li>Ad targeting and retargeting</li>
              <li>Campaign performance measurement</li>
              <li>Social media integration</li>
            </ul>
          </section>

          <section className="policy-section">
            <h2>3. Third-Party Cookies</h2>
            <p>
              Some cookies on our site are placed by third-party services we use, including:
            </p>
            <ul>
              <li><strong>Stripe:</strong> Payment processing and fraud detection</li>
              <li><strong>Analytics Providers:</strong> Website usage analysis and reporting</li>
              <li><strong>Social Media Platforms:</strong> Social sharing and engagement features</li>
            </ul>
            <p>
              These third parties have their own privacy and cookie policies that govern their use of your data.
            </p>
          </section>

          <section className="policy-section">
            <h2>4. Managing Your Cookie Preferences</h2>
            <p>You have several options for managing cookies:</p>
            <ul>
              <li><strong>Browser Settings:</strong> Most browsers allow you to block or delete cookies through their settings menu. Note that blocking essential cookies may prevent our platform from functioning properly.</li>
              <li><strong>Opt-Out Links:</strong> Some third-party analytics and advertising services offer opt-out mechanisms on their websites.</li>
              <li><strong>Do Not Track:</strong> Some browsers offer a &quot;Do Not Track&quot; setting. While there is no universal standard for honoring this signal, we respect your privacy preferences.</li>
            </ul>
          </section>

          <section className="policy-section">
            <h2>5. Data Collected Through Cookies</h2>
            <p>Information collected through cookies may include:</p>
            <ul>
              <li>IP address and approximate location</li>
              <li>Browser type and version</li>
              <li>Operating system</li>
              <li>Referring website</li>
              <li>Pages visited and time spent</li>
              <li>Links clicked and actions taken</li>
            </ul>
            <p>
              This data is used in accordance with our <a href="/privacy">Privacy Policy</a>.
            </p>
          </section>

          <section className="policy-section">
            <h2>6. Changes to This Cookie Policy</h2>
            <p>
              We may update this Cookie Policy from time to time to reflect changes in technology, legislation, or our data practices. We will post the updated policy on this page with a revised effective date.
            </p>
          </section>

          <section className="policy-section">
            <h2>7. Contact Us</h2>
            <p>
              If you have questions about our use of cookies, please contact us at:
            </p>
            <p>
              <strong>VenueCore</strong><br />
              Email: privacy@venuecore.com
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
