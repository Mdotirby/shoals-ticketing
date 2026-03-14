"use client";

import Image from "next/image";
import Link from "next/link";
import { useVenue } from "@/app/components/VenueContext";
import { useOperator } from "@/app/components/OperatorContext";
import { useState, useEffect } from "react";

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

export default function Footer() {
  const operator = useOperator();
  const { venueSlug, isVenueSubdomain } = useVenue();

  // Service links vary by operator
  const serviceLinks =
    operator.slug === "venuecore"
      ? [
          { label: "Ticketing", href: "/events" },
          { label: "Venue Management", href: "/about" },
          { label: "Artist Deals", href: "/about" },
          { label: "Auctions", href: "/auctions" },
        ]
      : [
          { label: "Concert Promotion", href: "/about" },
          { label: "Talent Buying", href: "/about" },
          { label: "Ticketing", href: "/events" },
          { label: "Auctions", href: "/auctions" },
        ];

  const defaultConnectLinks = [
    { label: "Instagram", href: operator.instagramUrl },
    { label: "Facebook", href: operator.facebookUrl },
    { label: "Email Us", href: `mailto:${operator.contactEmail}` },
  ];

  const [connectLinks, setConnectLinks] = useState(defaultConnectLinks);

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
          else links.push({ label: "Email Us", href: `mailto:${operator.contactEmail}` });
          if (links.length > 0) setConnectLinks(links.length >= 2 ? links : defaultConnectLinks);
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueSlug, isVenueSubdomain]);

  return (
    <footer className="site-footer">
      <div className="footer-content">
        <div className="footer-brand">
          <Image
            src={operator.logo}
            alt={operator.logoAlt}
            width={127}
            height={127}
            className="footer-logo"
          />
          <p className="footer-description">{operator.footerDescription}</p>
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
          Copyright {new Date().getFullYear()} {operator.copyright}. All Rights Reserved.
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
