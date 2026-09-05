"use client";

import Link from "next/link";
import { useOperator } from "./OperatorContext";

/**
 * Storefront footer — one centered line.
 *
 * Mockup (VenueCore.dc.html line 1310) hardcodes:
 *   © 2026 West 72 Entertainment LLC · Florence, AL · Privacy Policy
 *
 * Production must not hardcode that. Per STOREFRONT_SPEC.md § Branding the
 * name comes from operator.copyright, so venuecore.live renders its own
 * entity rather than West 72's, and the year is computed rather than frozen
 * at 2026. "Privacy Policy" links to /privacy.
 *
 * Deliberately separate from the existing <Footer>, which is the tall
 * multi-column site footer still used outside the storefront routes.
 */
export default function SfFooter() {
  const operator = useOperator();

  return (
    <footer className="sf-footer">
      © {new Date().getFullYear()} {operator.copyright} · Florence, AL ·{" "}
      <Link href="/privacy">Privacy Policy</Link>
    </footer>
  );
}
