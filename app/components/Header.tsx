"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

const navItems = [
  { label: "Events", href: "/events" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
  { label: "Admin", href: "/admin" },
];

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="site-header">
        <div className="header-logo">
        <Image
          src="/beige-brown-logo.png"
          alt="West72 Logo"
          width={127}
          height={127}
          priority
        />
      </div>

      <button
        type="button"
        className="hamburger"
        aria-label="Toggle navigation menu"
        aria-expanded={isMenuOpen}
        onClick={() => setIsMenuOpen((prev) => !prev)}
      >
        ☰
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
    </header>
  );
}
