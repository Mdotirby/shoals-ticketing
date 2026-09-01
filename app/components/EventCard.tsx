"use client";

import Link from "next/link";

/**
 * Flat-prop shape (name/venue/dateLabel/.../ctaHref) instead of `event:
 * Event` — matches design/liquid-glass/liquid-glass-components.tsx's
 * EventCard, now the real target shape rather than a reference. Callers
 * that have a full Event record map it with lib/eventCardProps.ts's
 * eventToCardProps() rather than each formatting price/date locally.
 *
 * The visual implementation (full-bleed photo, venue tag pinned top-left,
 * gradient scrim, title + pills) is unchanged — it already matched the
 * mockup — only the inputs changed, so nothing about how this actually
 * renders was touched.
 */
type EventCardProps = {
  name: string;
  venue: string;
  dateLabel: string;
  timeLabel: string;
  priceLabel: string;
  isFree?: boolean;
  photoUrl?: string;
  ctaHref: string;
  /** Not part of the mockup's EventCard, but a real capability the old
   *  event-based version had (unused anywhere today, per a repo-wide grep —
   *  kept rather than silently dropped, since something could start passing
   *  it later). */
  soldOut?: boolean;
};

export default function EventCard({
  name,
  venue,
  dateLabel,
  timeLabel,
  priceLabel,
  isFree = false,
  photoUrl,
  ctaHref,
  soldOut = false,
}: EventCardProps) {
  return (
    <Link
      href={ctaHref}
      className="event-card"
      aria-label={soldOut ? `${name} — Sold Out` : `View tickets for ${name}`}
      style={{
        backgroundImage: photoUrl
          ? `url(${photoUrl})`
          : "linear-gradient(145deg, #202045 0%, #0b0d1d 100%)",
      }}
    >
      <span className="event-card-glow" />

      {soldOut && (
        <div className="event-venue-badge" style={{ background: "rgba(239,68,68,0.85)" }}>
          <span className="badge-text">SOLD OUT</span>
        </div>
      )}
      {!soldOut && (
        <div className="event-venue-badge">
          <span className="badge-text">{venue}</span>
        </div>
      )}

      <div className="event-main-content">
        <h2 className="event-card-title">{name}</h2>

        <div className="event-meta-badges">
          <span className={`event-badge event-price-badge${isFree ? " event-price-badge--free" : ""}`}>
            <span className="badge-text">{isFree ? "FREE" : priceLabel}</span>
          </span>
          {/* Date and time share one pill so the row stays on a single line at
              every breakpoint — split across two pills they wrapped on narrow
              phones. */}
          <span className="event-badge event-date-badge">
            <span className="badge-text">
              {dateLabel}
              {timeLabel && ` · ${timeLabel}`}
            </span>
          </span>
        </div>
      </div>
    </Link>
  );
}
