"use client";

import Link from "next/link";
import { Event } from "@/lib/types/event";
import { formatEventDateCompact, formatEventTime } from "@/lib/dates";

type EventCardProps = {
  event: Event;
  soldOut?: boolean;
};

export default function EventCard({ event, soldOut = false }: EventCardProps) {
  return (
    <Link
      href={`/events/${event.id}`}
      className="event-card"
      aria-label={soldOut ? `${event.title} — Sold Out` : `View tickets for ${event.title}`}
      style={{
        backgroundImage: event.image_url
          ? `url(${event.image_url})`
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
          <span className="badge-text">{event.venue}</span>
        </div>
      )}

      <div className="event-main-content">
        <h2 className="event-card-title">{event.title}</h2>

        <div className="event-meta-badges">
          <span
            className={`event-badge event-price-badge${
              Number(event.price) === 0 ? " event-price-badge--free" : ""
            }`}
          >
            <span className="badge-text">
              {Number(event.price) === 0 ? "FREE" : `From $${Number(event.price).toFixed(2)}`}
            </span>
          </span>
          {/* Date and time share one pill so the row stays on a single line at
              every breakpoint — split across two pills they wrapped on narrow
              phones. */}
          <span className="event-badge event-date-badge">
            <span className="badge-text">
              {formatEventDateCompact(event.date)}
              {formatEventTime(event.date) && ` · ${formatEventTime(event.date)}`}
            </span>
          </span>
        </div>
      </div>
    </Link>
  );
}
