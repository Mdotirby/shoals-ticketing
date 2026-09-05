"use client";

import Link from "next/link";
import { Event } from "@/lib/types/event";
import { formatEventDateShort, formatEventTime } from "@/lib/dates";

/**
 * The LISTING card — photo on top, body panel beneath, with a date line, a
 * venue line with pin icon, a price pill and a Get Tickets button.
 *
 * NOT the same component as EventCard. EventCard is the full-bleed photo tile
 * (venue badge top-left, title and pills over a bottom scrim) used by the
 * checkout-success cross-sell. The two are not interchangeable — merging them
 * drops this card's CTA button and orphans the .events-grid-card rules in
 * globals.css. That has already happened once; see the note above
 * body[data-theme="liquid-glass"] .events-grid-card in globals.css.
 *
 * This is a verbatim extraction of the markup that was inline in
 * app/events/page.tsx — same elements, same class names, same formatters, so
 * the existing .events-grid-card CSS (both the base rules and the storefront
 * glass restyle) applies unchanged. It moved into a component only because the
 * mockup uses this same card shape on home as well as the listing, and two
 * hand-maintained copies is how they drift apart.
 */
export default function EventGridCard({ event }: { event: Event }) {
  const isFree = event.price === 0;

  return (
    <Link href={`/events/${event.id}`} className="events-grid-card">
      {/* Image */}
      <div className={`event-card-img${!event.image_url ? " event-card-placeholder" : ""}`}>
        {event.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.image_url} alt={event.title} />
        ) : (
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.25 }}>
            <path d="M9 18V5l12-2v13" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="6" cy="18" r="3" stroke="#fff" strokeWidth="1.5"/>
            <circle cx="18" cy="16" r="3" stroke="#fff" strokeWidth="1.5"/>
          </svg>
        )}
      </div>

      {/* Body */}
      <div className="event-card-body">
        <h2 className="event-card-title">{event.title}</h2>

        <p className="event-card-meta">
          {formatEventDateShort(event.date)}
          {formatEventTime(event.date) && ` · ${formatEventTime(event.date)}`}
        </p>

        <p className="event-card-meta">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke="currentColor" strokeWidth="1.5"/>
            <circle cx="12" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
          {event.venue}
        </p>

        <div className="event-card-footer">
          <span className="event-card-price">
            {isFree ? "FREE" : `$${event.price.toFixed(2)}`}
          </span>

          <span className="event-card-btn">
            {isFree ? "Register Free" : "Get Tickets"}
          </span>
        </div>
      </div>
    </Link>
  );
}
