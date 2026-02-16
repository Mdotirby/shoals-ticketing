"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useVenueTheme } from "./VenueThemeProvider";

const navItems = [
  { label: "Events", href: "/events" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const venue = useVenueTheme();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 40);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const logoSrc = venue.isVenueSubdomain && venue.logo_url
    ? venue.logo_url
    : "/beige-brown-logo.png";

  return (
    <header className={`site-header ${scrolled ? "header-scrolled" : ""}`}>
      <div className="header-inner">
        <Link href="/" className="header-logo" aria-label="Go to homepage">
          {venue.isVenueSubdomain && venue.logo_url ? (
            // External URL for venue logos
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={venue.logo_url}
              alt={venue.name || "Venue Logo"}
              className="header-logo-img"
            />
          ) : (
            <Image
              src="/venuecore.png"
              alt="VenueCore Logo"
              width={127}
              height={127}
              priority
              unoptimized
            />
          )}
        </Link>

        <button
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

        <nav className={`header-nav ${isMenuOpen ? "open" : ""}`}>
          {navItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="header-nav-link"
              onClick={() => setIsMenuOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
