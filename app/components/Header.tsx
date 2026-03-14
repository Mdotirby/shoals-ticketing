"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect, useRef, useCallback } from "react";
import { useOperator } from "./OperatorContext";

const navItems = [
  { label: "Events", href: "/events" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

export default function Header() {
  const operator = useOperator();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 40);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close mobile nav when clicking outside
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
    if (isMenuOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isMenuOpen, handleOutsideClick]);

  return (
    <header className={`site-header ${scrolled ? "header-scrolled" : ""}`}>
      <div className="header-inner">
        <Link href="/" className="header-logo" aria-label="Go to homepage">
          <Image
            src={operator.logo}
            alt={operator.logoAlt}
            width={200}
            height={200}
            priority
            unoptimized
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

        <nav ref={navRef} className={`header-nav ${isMenuOpen ? "open" : ""}`}>
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
