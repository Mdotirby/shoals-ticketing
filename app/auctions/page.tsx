"use client";

import Image from "next/image";
import Link from "next/link";
import Footer from "@/app/components/Footer";
import { useOperator } from "@/app/components/OperatorContext";

const features = [
  {
    icon: "",
    title: "Mobile-First Bidding",
    description:
      "Guests scan a QR code at any item and place bids instantly from their phone. No app downloads, no accounts to create — just enter your name, email, and phone and start bidding in seconds.",
  },
  {
    icon: "",
    title: "Real-Time Updates",
    description:
      "Every bid updates live across all devices. Guests see the current price the moment it changes, know instantly when they've been outbid, and never miss a chance to bid again.",
  },
  {
    icon: "",
    title: "Anti-Snipe Protection",
    description:
      "Last-second bids automatically extend the auction closing time, giving every bidder a fair chance. No more frustration from being outbid with zero time to respond.",
  },
  {
    icon: "",
    title: "Outbid Notifications",
    description:
      "When someone outbids a guest, they get an email with a direct link back to the item. More notifications means more bids — and more revenue for your cause.",
  },
  {
    icon: "",
    title: "Printable QR Codes",
    description:
      "One click generates beautifully formatted QR code cards for every item. Print them, place them next to your items, and guests are bidding in seconds.",
  },
  {
    icon: "",
    title: "Flexible Checkout",
    description:
      "When the auction closes, winners choose to pay by cash, check, or credit/debit card. Card payments process instantly through Stripe — no chasing down payments after the event.",
  },
  {
    icon: "",
    title: "Comprehensive Reports",
    description:
      "Five detailed reports — Item Report, All Bidders, Winning Bidders, Paid by CC, and Gross Receipts — all exportable as PDFs. Know exactly what happened and who owes what.",
  },
  {
    icon: "",
    title: "Your Brand, Front & Center",
    description:
      "Upload your organization's logo and it appears on every page guests see. This is your auction, your brand — VenueCore just powers the technology behind the scenes.",
  },
];

export default function AuctionsAboutPage() {
  const operator = useOperator();
  const isVenueCore = operator.slug === "venuecore";
  return (
    <div className="auctions-about-page">
      {/* Hero Section */}
      <section className="auctions-hero">
        <div className="auctions-hero-content">
          <div className="auctions-hero-badge">VC Auction</div>
          <h1 className="auctions-hero-title">
            Silent Auctions,<br />
            <span className="auctions-hero-accent">Without the Silence.</span>
          </h1>
          <p className="auctions-hero-subtitle">
            Forget the clipboard bid sheets and the chaos of manual tracking.
            VC Auction brings your silent auction to life with real-time mobile bidding,
            instant notifications, and seamless checkout — so you can focus on
            your event, not your spreadsheets.
          </p>
          <div className="auctions-hero-cta">
            <Link href="/login" className="auctions-cta-btn">
              Get Started
            </Link>
            <Link href="/contact" className="auctions-cta-btn auctions-cta-outline">
              Contact Us
            </Link>
          </div>
        </div>
      </section>

      {/* Pain Points */}
      <section className="auctions-pain-section">
        <div className="auctions-section-inner">
          <h2 className="auctions-section-title">We Built This Because Silent Auctions Are Broken</h2>
          <div className="auctions-pain-grid">
            <div className="auctions-pain-card">
              <h3>For Organizers</h3>
              <p>
                You&apos;ve spent weeks collecting donations and setting up items — then on event
                night you&apos;re scrambling with paper bid sheets, trying to read handwriting,
                manually tallying winners, and chasing down payments. The post-event spreadsheet
                takes longer than the auction itself.
              </p>
              <p className="auctions-pain-solution">
                <strong>VC Auction handles it all.</strong> Set up your items in minutes. Print QR codes.
                Bids come in automatically. Winners check out on their phone. Reports generate
                themselves. You get to actually enjoy the event you worked so hard to plan.
              </p>
            </div>
            <div className="auctions-pain-card">
              <h3>For Guests</h3>
              <p>
                Walking back and forth to check if you&apos;ve been outbid. Waiting in line at
                the auction table. Not knowing if you won until someone reads names off a list.
                Finding out you need to write a check because they don&apos;t take cards.
              </p>
              <p className="auctions-pain-solution">
                <strong>Now it&apos;s all on your phone.</strong> Scan a QR code. Place a bid. Get notified
                instantly if someone outbids you. See a live countdown. When you win, pay
                however you want — cash, check, or card — right from your screen.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="auctions-features-section">
        <div className="auctions-section-inner">
          <h2 className="auctions-section-title">Everything You Need</h2>
          <p className="auctions-section-subtitle">
            Built for charity galas, fundraiser dinners, school auctions, and any event
            where you want to raise more money with less effort.
          </p>
          <div className="auctions-features-grid">
            {features.map((feature) => (
              <div key={feature.title} className="auctions-feature-card">
                <span className="auctions-feature-icon">{feature.icon}</span>
                <h3 className="auctions-feature-title">{feature.title}</h3>
                <p className="auctions-feature-desc">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="auctions-how-section">
        <div className="auctions-section-inner">
          <h2 className="auctions-section-title">How It Works</h2>
          <div className="auctions-steps">
            <div className="auctions-step">
              <div className="auctions-step-number">1</div>
              <h3>Set Up Your Auction</h3>
              <p>Add your items, set starting bids and minimum increments, schedule your open and close times.</p>
            </div>
            <div className="auctions-step">
              <div className="auctions-step-number">2</div>
              <h3>Print & Display QR Codes</h3>
              <p>One click generates all your QR codes. Print them and place them next to each item.</p>
            </div>
            <div className="auctions-step">
              <div className="auctions-step-number">3</div>
              <h3>Guests Scan & Bid</h3>
              <p>Guests scan any item&apos;s QR code, register once with their phone, and start bidding immediately.</p>
            </div>
            <div className="auctions-step">
              <div className="auctions-step-number">4</div>
              <h3>Auction Closes & Checkout</h3>
              <p>Winners get notified, see their items, and check out with cash, check, or credit card — all from their phone.</p>
            </div>
            <div className="auctions-step">
              <div className="auctions-step-number">5</div>
              <h3>Pull Your Reports</h3>
              <p>Download detailed PDFs of bidders, winners, payments, and gross receipts. Settlement ready in minutes.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="auctions-cta-section">
        <div className="auctions-section-inner" style={{ textAlign: "center" }}>
          <h2 className="auctions-section-title">Ready to Raise More?</h2>
          <p className="auctions-section-subtitle">
            Stop leaving money on the table with paper bid sheets.
            VC Auction is included with your VenueCore plan — no extra fees, no per-item charges.
          </p>
          <div className="auctions-hero-cta" style={{ justifyContent: "center" }}>
            <Link href="/login" className="auctions-cta-btn">
              Get Started
            </Link>
            <Link href="/contact" className="auctions-cta-btn auctions-cta-outline">
              Schedule a Demo
            </Link>
          </div>
        </div>
      </section>

      {/* Powered By — only show VenueCore attribution on VenueCore domain */}
      {isVenueCore && (
        <div className="auctions-powered-by">
          <Image
            src="/VenueCore_VenueCore-Horizontal.png"
            alt="VenueCore"
            width={140}
            height={40}
            style={{ objectFit: "contain", opacity: 0.5 }}
          />
        </div>
      )}

      <Footer />
    </div>
  );
}
