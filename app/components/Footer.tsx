"use client";

import Image from "next/image";
import Link from "next/link";
import { useVenueTheme } from "./VenueThemeProvider";

const serviceLinks = [
  { label: "Concert Promotion", href: "/about" },
  { label: "Talent Buying", href: "/about" },
  { label: "Ticketing", href: "/events" },
];

const infoLinks = [
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
  { label: "FAQ", href: "/faq" },
];

const venueLinks = [
  { label: "Log in", href: "/login" },
];

const connectLinks = [
  { label: "Instagram", href: "https://instagram.com" },
  { label: "Facebook", href: "https://facebook.com" },
  { label: "Email Us", href: "mailto:info@west72entertainment.com" },
];

export default function Footer() {
  const venue = useVenueTheme();

  return (
    <footer className="site-footer">
      <div className="footer-content">
        <div className="footer-brand">
          {venue.isVenueSubdomain && venue.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={venue.logo_url} alt={venue.name || "Venue"} className="footer-logo" style={{ width: 127, height: 127, objectFit: "contain" }} />
          ) : (
            <Image
              src="/VenueCore_VenueCore-FullLogo.png"
              alt="VenueCore Logo"
              width={127}
              height={127}
              className="footer-logo"
            />
          )}
          <p className="footer-description">
            West 72 Entertainment is a full-service live event company with over
            a decade of experience in artist promotion, concert production, and
            music marketing. Based in the heart of the Southeast, we specialize
            in creating unforgettable experiences that connect top-tier talent
            with fan-first production. From intimate venues to large-scale
            stages, every live music event we produce is designed to engage
            audiences and artists in authentic, lasting ways through our
            expertly crafted concerts.
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
