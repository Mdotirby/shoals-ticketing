"use client";

import Image from "next/image";
import Link from "next/link";
import { useOperator } from "@/app/components/OperatorContext";
import { useVenueTheme } from "@/app/components/VenueThemeProvider";

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
  const venueTheme = useVenueTheme();

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

  // On a venue subdomain, use venue social links from the theme; otherwise operator defaults.
  const connectLinks = venueTheme.isVenueSubdomain
    ? [
        ...(venueTheme.instagram_url ? [{ label: "Instagram", href: venueTheme.instagram_url }] : []),
        ...(venueTheme.facebook_url ? [{ label: "Facebook", href: venueTheme.facebook_url }] : []),
        {
          label: "Email Us",
          href: `mailto:${venueTheme.contact_email ?? venueTheme.support_email ?? operator.contactEmail}`,
        },
      ]
    : [
        { label: "Instagram", href: operator.instagramUrl },
        { label: "Facebook", href: operator.facebookUrl },
        { label: "Email Us", href: `mailto:${operator.contactEmail}` },
      ];

  // Footer is always dark — use white logo on subdomains if available, else operator white logo.
  const logoSrc = venueTheme.isVenueSubdomain && venueTheme.logo_url
    ? venueTheme.logo_url
    : operator.logoWhite;
  const logoAlt = venueTheme.isVenueSubdomain && venueTheme.name
    ? venueTheme.name
    : operator.logoAlt;
  const footerDesc = venueTheme.isVenueSubdomain && venueTheme.footer_description
    ? venueTheme.footer_description
    : operator.footerDescription;

  return (
    <footer className="site-footer">
      <div className="footer-content">
        <div className="footer-brand">
          <Image
            src={logoSrc}
            alt={logoAlt}
            width={200}
            height={40}
            className="footer-logo"
            unoptimized
          />
          <p className="footer-description">{footerDesc}</p>
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
