"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useOperator } from "./OperatorContext";
import { useVenueTheme } from "./VenueThemeProvider";
import { logoFor } from "@/lib/operators";

/**
 * Storefront header — the floating glass pill from the mockup (line 1252).
 *
 * NOT a replacement for <Header>. That one is the full-width site bar in the
 * root layout and still serves /login and everything outside the storefront
 * routes; this one is rendered by the storefront pages themselves and sits
 * inside the 1240px .sf-page column as a pill, per the mockup.
 *
 * Branding is the one intentional deviation from the mockup, per
 * STOREFRONT_SPEC.md § Branding: the mockup draws a "WEST-72 / ENTERTAINMENT"
 * text lockup, production resolves the operator's real mark instead. Storefront
 * chrome is always dark translucent glass, so the white cut is always the
 * right one — hence `glass = true` rather than usesLiquidGlass(). A venue
 * subdomain's own logo still wins over the operator mark, same rule Header
 * already implements.
 */

const navItems = [
  { label: "Events", href: "/events" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
  { label: "Login", href: "/login" },
];

export default function SfHeader() {
  const pathname = usePathname();
  const operator = useOperator();
  const venueTheme = useVenueTheme();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [featuredEvent, setFeaturedEvent] = useState<{ id: string; title: string } | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  // Same call Header already makes — the CTA targets the featured event.
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

  const useVenueLogo = venueTheme.isVenueSubdomain && !!venueTheme.logo_url;
  const wordmark = useVenueLogo ? venueTheme.logo_url! : logoFor(operator, "horizontal", true);
  const iconMark = logoFor(operator, "icon", true);
  const logoAlt =
    venueTheme.isVenueSubdomain && venueTheme.name ? venueTheme.name : operator.logoAlt;

  return (
    <>
      <header className="sf-header">
        <Link href="/" className="sf-header-logo" aria-label="Go to homepage">
          <Image
            src={wordmark}
            alt={logoAlt}
            width={320}
            height={56}
            priority
            unoptimized
            className="sf-header-mark sf-header-mark--wordmark"
          />
          {/* ≤640px swaps the wordmark for the square icon mark, centred in the
              collapsed three-column grid. A venue subdomain keeps its own logo
              at both sizes — it has no separate icon cut. */}
          {!useVenueLogo && (
            <Image
              src={iconMark}
              alt={logoAlt}
              width={65}
              height={64}
              priority
              unoptimized
              className="sf-header-mark sf-header-mark--icon"
            />
          )}
        </Link>

        <div className="sf-header-spacer" />

        <nav className="sf-header-nav">
          {navItems.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.label}
                href={item.href}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="sf-header-spacer" />

        {featuredEvent && (
          <Link
            href={`/events/${featuredEvent.id}`}
            className="sf-btn sf-btn--primary sf-btn--md"
          >
            Get Tickets
          </Link>
        )}

        {/* Hidden above 640px by the .sf-header .hamburger rule in the sf
            block. Reuses the existing glass hamburger and drawer rather than
            introducing a second set — Header's drawer is the working
            reference the spec points at. */}
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
      </header>

      {/* Outside <header> so its fixed positioning isn't clipped by the pill's
          backdrop-filter, which creates a containing block for fixed
          descendants. Same reason Header renders its drawer outside. */}
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
        {/* CTA is hidden in the collapsed header and moves to the foot of the
            open sheet as a full-width target — mockup line 1820. */}
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
