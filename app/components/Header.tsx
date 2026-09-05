"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useOperator } from "./OperatorContext";
import { useVenueTheme } from "./VenueThemeProvider";
import { usesLiquidGlass, logoFor } from "@/lib/operators";

const navItems = [
  { label: "Events", href: "/events" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
  { label: "Login", href: "/login" },
];

/** Routes where the public header should be hidden (they have their own nav) */
const HIDDEN_PREFIXES = ["/admin", "/portal", "/agent"];

/**
 * Storefront routes that render <SfHeader> themselves — the floating glass
 * pill from the mockup. Exact matches, not prefixes: /events/[id]/seating is
 * out of scope for the storefront rebuild and still wants this header, so
 * hiding all of /events would break it.
 *
 * This list grows one entry per storefront page as each is rebuilt. When the
 * last one lands, this header serves /login, /fwb, /partners, the legal pages
 * and the auction routes.
 */
const SF_HEADER_ROUTES = ["/"];

export default function Header() {
  const pathname = usePathname();
  const operator = useOperator();
  const venueTheme = useVenueTheme();
  const glass = usesLiquidGlass(operator.slug);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [featuredEvent, setFeaturedEvent] = useState<{ id: string; title: string } | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  const isHidden =
    HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    SF_HEADER_ROUTES.includes(pathname);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    fetch("/api/events/featured")
      .then((res) => res.json())
      .then((data) => setFeaturedEvent(data?.event ?? null))
      .catch(() => {});
  }, []);

  const handleOutsideClick = useCallback((e: MouseEvent) => {
    if (
      navRef.current &&
      !navRef.current.contains(e.target as Node) &&
      hamburgerRef.current &&
      !hamburgerRef.current.contains(e.target as Node)
    ) {
      setIsMenuOpen(false);
    }
  }, []);

  useEffect(() => {
    if (isMenuOpen) document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isMenuOpen, handleOutsideClick]);

  if (isHidden) return null;

  // On a venue subdomain, show the venue's own logo from Supabase storage.
  // Otherwise use the operator wordmark — the white cut under the liquid-glass
  // theme, since the header pill is a dark translucent surface there and the
  // full-colour mark reads muddy against it.
  //
  // logoFor() replaces the hand-written `glass ? logoWhite : logo` ternary that
  // used to be here. Same result for the wordmark; the change is that the icon
  // mark below now gets the same treatment instead of always using the colour
  // cut, which is what made the VenueCore icon read muddy on the mobile pill.
  const operatorWordmark = logoFor(operator, "horizontal", glass);
  const logoSrc = venueTheme.isVenueSubdomain && venueTheme.logo_url
    ? venueTheme.logo_url
    : operatorWordmark;
  const logoAlt = venueTheme.isVenueSubdomain && venueTheme.name
    ? venueTheme.name
    : operator.logoAlt;

  // The mobile header swaps the wordmark for the square icon mark, centred on
  // the full header width — see .header-logo-img--icon. Venue subdomains keep
  // their own logo rather than the operator's mark.
  const showMobileIcon = glass && !venueTheme.isVenueSubdomain;

  return (
    <>
      <header className={`site-header ${scrolled ? "header-scrolled" : ""}`}>
        <div className="header-inner">
          <Link href="/" className="header-logo" aria-label="Go to homepage">
            <Image
              src={logoSrc}
              alt={logoAlt}
              width={320}
              height={56}
              priority
              unoptimized
              className="header-logo-img header-logo-img--wordmark"
            />
            {showMobileIcon && (
              <Image
                src={logoFor(operator, "icon", glass)}
                alt={logoAlt}
                width={65}
                height={64}
                priority
                unoptimized
                className="header-logo-img header-logo-img--icon"
              />
            )}
          </Link>

          <button
            ref={hamburgerRef}
            type="button"
            className="hamburger"
            aria-label="Toggle navigation menu"
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen((prev) => !prev)}
          >
            <span className={`hamburger-bar ${isMenuOpen ? "open" : ""}`} />
            <span className={`hamburger-bar ${isMenuOpen ? "open" : ""}`} />
            <span className={`hamburger-bar ${isMenuOpen ? "open" : ""}`} />
          </button>

          {/* .header-nav is a direct sibling of the logo and .header-right now,
              not nested inside .header-right alongside the CTA — nesting it
              there meant the links could only ever sit tight against the CTA
              button, never centered in the bar the way the design calls for.
              Display:none under 768px either way (mobile uses the drawer), so
              this doesn't affect the mobile layout. */}
          <nav className="header-nav">
            {navItems.map((item) => (
              <Link key={item.label} href={item.href} className="header-nav-link">
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="header-right">
            {featuredEvent && (
              <Link href={`/events/${featuredEvent.id}`} className="header-cta">
                Get Tickets
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Mobile slide-in drawer — rendered outside <header> so its fixed
          positioning isn't clipped by the header's backdrop-filter, which
          creates a containing block for position:fixed descendants. */}
      <div
        className={`mobile-nav-backdrop ${isMenuOpen ? "open" : ""}`}
        onClick={() => setIsMenuOpen(false)}
      />
      <nav ref={navRef} className={`mobile-nav-drawer ${isMenuOpen ? "open" : ""}`}>
        {navItems.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="mobile-nav-link"
            onClick={() => setIsMenuOpen(false)}
          >
            {item.label}
          </Link>
        ))}
        {/* The "Get Tickets" CTA is hidden in the collapsed mobile header and
            lives here instead, full-width at the foot of the open menu. Same
            featuredEvent target as the desktop header CTA. */}
        {featuredEvent && (
          <>
            <div className="mobile-nav-divider" />
            <Link
              href={`/events/${featuredEvent.id}`}
              className="mobile-nav-cta"
              onClick={() => setIsMenuOpen(false)}
            >
              Get Tickets
            </Link>
          </>
        )}
      </nav>
    </>
  );
}
