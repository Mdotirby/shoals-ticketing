"use client";

import Image from "next/image";
import Link from "next/link";
import { useVenue } from "@/app/components/VenueContext";
import { useState, useEffect } from "react";

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

const managementLinks = [
  { label: "For Venues", href: "/login" },
  { label: "For Artists", href: "/login" },
  { label: "For Agents", href: "/agent" },
];

const DEFAULT_CONNECT_LINKS = [
  { label: "Instagram", href: "https://instagram.com" },
  { label: "Facebook", href: "https://facebook.com" },
  { label: "Email Us", href: "mailto:info@west72entertainment.com" },
];

export default function Footer() {
  const { venueSlug, isVenueSubdomain } = useVenue();
  const [connectLinks, setConnectLinks] = useState(DEFAULT_CONNECT_LINKS);

  // Load venue-specific social links when on a venue subdomain
  useEffect(() => {
    if (!isVenueSubdomain) return;
    fetch("/api/venues")
      .then((r) => r.json())
      .then((venues: Array<Record<string, unknown>>) => {
        if (!Array.isArray(venues)) return;
        const v = venues.find((x) => x.slug === venueSlug);
        if (v) {
          const links = [];
          if (v.instagram_url) links.push({ label: "Instagram", href: v.instagram_url as string });
          if (v.facebook_url) links.push({ label: "Facebook", href: v.facebook_url as string });
          if (v.buyer_email) links.push({ label: "Email Us", href: `mailto:${v.buyer_email}` });
          else links.push({ label: "Email Us", href: "mailto:info@west72entertainment.com" });
          if (links.length > 0) setConnectLinks(links.length >= 2 ? links : DEFAULT_CONNECT_LINKS);
        }
      })
      .catch(() => {});
  }, [venueSlug, isVenueSubdomain]);
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
            <h3 className="footer-column-heading">Management</h3>
            {managementLinks.map((link) => (
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
          <Link href="/do-not-sell" className="footer-legal-link">
            Do Not Sell My Info
          </Link>
          <span className="footer-legal-separator">·</span>
          <Link href="/privacy" className="footer-legal-link">
            Privacy Policy
          </Link>
          <span className="footer-legal-separator">·</span>
          <Link href="/cookies" className="footer-legal-link">
            Cookie Policy
          </Link>
        </div>
      </div>
    </footer>
  );
}
