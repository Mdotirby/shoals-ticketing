"use client";

import Link from "next/link";
import { Event } from "@/lib/types/event";

type EventCardProps = {
  event: Event;
};

/** Parse date strings safely — date-only strings get T12:00:00 to avoid UTC midnight timezone shift */
function safeDate(date: string) {
  // If it's a date-only string (YYYY-MM-DD, 10 chars), append noon to avoid timezone shift
  if (date && date.length === 10 && date[4] === "-") return new Date(date + "T12:00:00");
  return new Date(date);
}

function formatEventDate(date: string) {
  return safeDate(date).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatEventTime(date: string): string {
  return safeDate(date).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default function EventCard({ event }: EventCardProps) {
  return (
    <Link
      href={`/events/${event.id}`}
      className="event-card"
      aria-label={`View tickets for ${event.title}`}
      style={{
        backgroundImage: event.image_url
          ? `url(${event.image_url})`
          : "linear-gradient(145deg, #202045 0%, #0b0d1d 100%)",
      }}
    >
      <span className="event-card-glow" />

      <div className="event-venue-badge">
        <span className="badge-text">{event.venue}</span>
      </div>

      <div className="event-main-content">
        <h2 className="event-card-title">{event.title}</h2>

        <div className="event-meta-badges">
          <span className="event-badge event-price-badge">
            <span className="badge-text">${event.price}</span>
          </span>
          <span className="event-badge event-date-badge">
            <span className="badge-text">{formatEventDate(event.date)}</span>
          </span>
          <span className="event-badge event-time-badge">
            <span className="badge-text">{formatEventTime(event.date)}</span>
          </span>
        </div>
      </div>
    </Link>
  );
}
