"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useOperator } from "./OperatorContext";
import { useVenueTheme } from "./VenueThemeProvider";

const navItems = [
  { label: "Events", href: "/events" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
  { label: "Login", href: "/login" },
];

/** Routes where the public header should be hidden (they have their own nav) */
const HIDDEN_PREFIXES = ["/admin", "/portal", "/agent"];

export default function Header() {
  const pathname = usePathname();
  const operator = useOperator();
  const venueTheme = useVenueTheme();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [featuredEvent, setFeaturedEvent] = useState<{ id: string; title: string } | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  const isHidden = HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix));

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
  // Fall back to the operator horizontal logo otherwise.
  const logoSrc = venueTheme.isVenueSubdomain && venueTheme.logo_url
    ? venueTheme.logo_url
    : operator.logo;
  const logoAlt = venueTheme.isVenueSubdomain && venueTheme.name
    ? venueTheme.name
    : operator.logoAlt;

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
              className="header-logo-img"
            />
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

          <div className="header-right">
            <nav className="header-nav">
              {navItems.map((item) => (
                <Link key={item.label} href={item.href} className="header-nav-link">
                  {item.label}
                </Link>
              ))}
            </nav>

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
      </nav>
    </>
  );
}
