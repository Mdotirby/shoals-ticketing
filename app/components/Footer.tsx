"use client";

import Image from "next/image";
import Link from "next/link";

const serviceLinks = [
  { label: "Concert Promotion", href: "/about" },
  { label: "Talent Buying", href: "/about" },
  { label: "Ticketing", href: "/events" },
  { label: "Auctions", href: "/auctions" },
];

const infoLinks = [
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
  { label: "FAQ", href: "/faq" },
];

const venueLinks = [
  { label: "Venue Portal", href: "/login" },
];

const artistLinks = [
  { label: "Artist Portal", href: "/login" },
];

const connectLinks = [
  { label: "Instagram", href: "https://instagram.com" },
  { label: "Facebook", href: "https://facebook.com" },
  { label: "Email Us", href: "mailto:info@west72entertainment.com" },
];

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-content">
        <div className="footer-brand">
          <Image
            src="/VenueCore_VenueCore-FullLogo.png"
            alt="VenueCore Logo"
            width={127}
            height={127}
            className="footer-logo"
          />
          <p className="footer-description">
            Discover. Grab. Experience. Live.  
            VenueCore makes it easy to find upcoming shows, buy tickets in seconds, 
            and enjoy seamless entry at the door—plus VIP packages 
            and live auctions for the ultimate experience.
          </p>
        </div>

        <div className="footer-links-group">
          <div className="footer-column">
            <h3 className="footer-column-heading">Services</h3>
            {serviceLinks.map((link) => (
              <Link key={link.label} href={link.href} className="footer-link">
                {link.label}
              </Link>
            ))}
          </div>

          <div className="footer-column">
            <h3 className="footer-column-heading">Information</h3>
            {infoLinks.map((link) => (
              <Link key={link.label} href={link.href} className="footer-link">
                {link.label}
              </Link>
            ))}
          </div>

          <div className="footer-column">
            <h3 className="footer-column-heading">Organizers</h3>
            {venueLinks.map((link) => (
              <Link key={link.label} href={link.href} className="footer-link">
                {link.label}
              </Link>
            ))}
          </div>

          <div className="footer-column">
            <h3 className="footer-column-heading">Artists</h3>
            {artistLinks.map((link) => (
              <Link key={link.label} href={link.href} className="footer-link">
                {link.label}
              </Link>
            ))}
          </div>

          <div className="footer-column">
            <h3 className="footer-column-heading">Connect</h3>
            {connectLinks.map((link) => (
              <Link key={link.label} href={link.href} className="footer-link">
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        <p className="footer-copyright">
          Copyright {new Date().getFullYear()} West 72 Entertainment. All Rights
          Reserved.
        </p>
        <div className="footer-legal">
          <Link href="/privacy" className="footer-legal-link">
            Privacy Policy
          </Link>
          <span className="footer-legal-separator">·</span>
          <Link href="/terms" className="footer-legal-link">
            Terms &amp; Conditions
          </Link>
        </div>
      </div>
    </footer>
  );
}
