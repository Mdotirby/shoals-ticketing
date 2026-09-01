"use client";

/**
 * Liquid glass — the real shared component layer.
 *
 * This used to be a design reference at design/liquid-glass/liquid-glass-
 * components.tsx (source of the JSX structure below). It's the actual
 * shared layer now, imported by real pages — not a picture to eyeball or a
 * file to copy from by hand.
 *
 * Every component here renders through classes that already exist in
 * app/styles/globals.css, scoped to body[data-theme="liquid-glass"]:
 *   - .glass (+ .lg-radius-md / .lg-radius-sm for GlassCard's smaller radii)
 *     — the base surface, already used by a dozen other cards on this site
 *   - .lg-btn / .lg-btn--primary / .lg-btn--outline / .lg-btn--pending
 *   - .lg-chip / .lg-chip--strong
 * These reuse the SAME --lg-* custom properties and the SAME exact values
 * as .checkout-success-btn, .cs-btn--outline, .hotel-badge, etc. — pulling
 * a repeated pattern into one place, not introducing a second visual
 * language or a parallel --sub/--ink token set alongside the existing
 * --lg-sub/--lg-ink ones.
 *
 * Not every component from the original reference file is here. NavBar,
 * MobileNavMenu, HeroCarouselChrome, CheckoutStepper, Field, ProgressBar,
 * ApplePayButton and BackgroundField are NOT included — nothing currently
 * imports them, the app already has its own working, liquid-glass-styled
 * Header/Footer/etc. for the equivalent jobs, and porting them here
 * unverified (their reference JSX leans on Tailwind utility classes like
 * rounded-glass-lg / bg-btn-white / backdrop-blur-glass that were never
 * turned into real Tailwind utilities in this app) would just be dead code
 * that renders unstyled the first time someone tries to use it. Pull them
 * in — adapted the same way GlassCard/Button/Chip were here — when the page
 * that actually needs one is being worked on, the same way this file itself
 * only grew the pieces Checkout Success needed today.
 */

import React from "react";

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* ---------------------------------------------------------------
   GlassCard — the base surface: nav, cards, forms, modals. Radius
   defaults to "lg" (24px, --lg-radius-lg) to match the mockups.
--------------------------------------------------------------- */
export function GlassCard({
  children,
  className,
  radius = "lg",
}: {
  children: React.ReactNode;
  className?: string;
  radius?: "lg" | "md" | "sm";
}) {
  const radiusClass = radius === "md" ? "lg-radius-md" : radius === "sm" ? "lg-radius-sm" : undefined;
  return <div className={cx("glass", radiusClass, className)}>{children}</div>;
}

/* ---------------------------------------------------------------
   Button — primary (white glass pill) / outline (frosted, transparent).
   `href` renders a real <a> (so it behaves like a link, not a button
   wrapping a link — the reference file's HotelPartnerPanel nested an <a>
   inside a <button>, which isn't valid HTML; fixed here). Omit `href` to
   get a real <button type="button">.
--------------------------------------------------------------- */
type ButtonOwnProps = {
  children: React.ReactNode;
  variant?: "primary" | "outline" | "pending";
  size?: "md" | "lg";
  className?: string;
  href?: string;
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  className,
  href,
  ...props
}: ButtonOwnProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonOwnProps> &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof ButtonOwnProps>) {
  const cls = cx(
    "lg-btn",
    size === "lg" ? "lg-btn--lg" : "lg-btn--md",
    variant === "primary" ? "lg-btn--primary" : variant === "pending" ? "lg-btn--pending" : "lg-btn--outline",
    className
  );
  if (href) {
    return (
      <a href={href} className={cls} {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" className={cls} {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------
   Chip — price tags, "FREE", filter pills, tags
--------------------------------------------------------------- */
export function Chip({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "strong";
}) {
  return <span className={cx("lg-chip", tone === "strong" && "lg-chip--strong")}>{children}</span>;
}

/* ---------------------------------------------------------------
   TicketCard — the order-confirmation ticket line on Checkout Success
   (checkout_success.png). Thumbnail is the EVENT PHOTO, not a QR code —
   the actual ticket/QR lives behind "View My Tickets". Styling routes
   through .cs-order-ticket / .cs-order-photo / .cs-order-tier etc., the
   same classes already built for this exact row (dashed divider between
   the date/venue block and the tier, matching the mockup's ticket-stub
   perforation) — not reimplemented as Tailwind utilities.
--------------------------------------------------------------- */
export function TicketCard({
  eventName,
  dateVenue,
  tierLabel,
  subLabel,
  photoUrl,
}: {
  eventName: string;
  dateVenue: string;
  tierLabel: string;
  subLabel?: string;
  photoUrl?: string;
}) {
  return (
    <div className="cs-order-ticket">
      <div
        className="cs-order-photo"
        style={photoUrl ? { backgroundImage: `url(${photoUrl})` } : undefined}
      />
      <div className="cs-order-ticket-body">
        <div className="cs-order-event">{eventName}</div>
        <div className="cs-order-when">{dateVenue}</div>
      </div>
      <div className="cs-order-tier">
        <div className="cs-order-tier-name">{tierLabel}</div>
        {subLabel && <div className="cs-order-doors">{subLabel}</div>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   HotelPartnerPanel — Checkout Success cross-sell for a lodging partner.
   Styling routes through .hotel-panel and its children, which already
   exactly matched this reference component before this file existed
   (confirmed diff during the Checkout Success audit) — reused rather than
   redeclared. Not wrapped in <GlassCard>: .hotel-panel already sets its
   own complete background/border/shadow/radius (identical values to
   .glass), so stacking GlassCard on top would just be two surface
   treatments fighting over the same element for no visual difference.
--------------------------------------------------------------- */
export function HotelPartnerPanel({
  partnerName = "Renaissance Shoals Resort & Spa",
  cutoffLabel,
  rackRate,
  memberRate,
  promoCode,
  ctaHref,
}: {
  partnerName?: string;
  cutoffLabel: string;
  rackRate: string;
  memberRate: string;
  promoCode: string;
  ctaHref: string;
}) {
  return (
    <div className="hotel-panel">
      <div className="hotel-photo">
        <span>{partnerName.toUpperCase()}</span>
      </div>
      <div className="hotel-body">
        <div className="hotel-top">
          <Chip>&#10022; Unlocked By Your Ticket</Chip>
          <span className="hotel-cutoff">Room block holds through {cutoffLabel}</span>
        </div>
        <h3>You Bought The Ticket. We Got You The Room.</h3>
        <div className="hotel-partner-name">In partnership with {partnerName}</div>
        <p className="hotel-desc">
          Ticket holders only. Not listed on their site, not open to the public. Skip the drive home.
        </p>
        <div className="hotel-bottom">
          <div>
            <div className="hotel-price-row">
              <span className="hotel-price-old">{rackRate}</span>
              <span className="hotel-price-new">{memberRate}</span>
              <span className="hotel-price-unit">/ night</span>
            </div>
            <div className="hotel-code-note">
              Code <b>{promoCode}</b> applied automatically &mdash; no account needed
            </div>
          </div>
          <Button variant="primary" size="lg" href={ctaHref} target="_blank" rel="noopener noreferrer">
            Unlock Our Rate
          </Button>
        </div>
      </div>
    </div>
  );
}
