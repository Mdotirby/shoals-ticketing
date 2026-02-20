"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Event } from "@/lib/types/event";
import { useVenue } from "@/app/components/VenueContext";
import Footer from "@/app/components/Footer";

type FilterType = "all" | "event" | "artist" | "venue" | "city";

function safeDate(d: string) { return (d && d.length === 10 && d[4] === "-") ? new Date(d + "T12:00:00") : new Date(d.replace(/[+-]\d{2}:\d{2}$/, "").replace(/Z$/, "")); }

function formatEventDate(date: string) {
  return safeDate(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatEventTime(date: string) {
  if (date && date.length === 10) return null;
  const d = safeDate(date);
  if (d.getHours() === 0 && d.getMinutes() === 0) return null;
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function matchesFilter(event: Event, query: string, filter: FilterType): boolean {
  const q = query.toLowerCase();
  if (!q) return true;
  switch (filter) {
    case "event":  return event.title.toLowerCase().includes(q);
    case "venue":  return event.venue.toLowerCase().includes(q);
    case "artist": return (event.description ?? event.title).toLowerCase().includes(q);
    case "city":   return event.venue.toLowerCase().includes(q);
    default:       return (
      event.title.toLowerCase().includes(q) ||
      event.venue.toLowerCase().includes(q) ||
      (event.description ?? "").toLowerCase().includes(q)
    );
  }
}

export default function EventsPage() {
  const { venueSlug, isVenueSubdomain } = useVenue();
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");

  useEffect(() => {
    const params = isVenueSubdomain ? `?venue_slug=${venueSlug}` : "";
    fetch(`/api/events${params}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to fetch events");
        const data = await res.json();
        if (Array.isArray(data)) setEvents(data);
      })
      .catch((err) => console.error("Events fetch error:", err))
      .finally(() => setIsLoading(false));
  }, [venueSlug, isVenueSubdomain]);

  const filtered = useMemo(
    () => events.filter((e) => matchesFilter(e, query, filter)),
    [events, query, filter]
  );

  return (
    <>
      <main className="events-list-page">
        {/* ── Search + Filter bar ── */}
        <div className="events-search-bar">
          <svg className="events-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.5" />
            <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            className="events-search-input"
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            className="events-filter-select"
            value={filter}
            onChange={(e) => setFilter(e.target.value as FilterType)}
          >
            <option value="all">by All</option>
            <option value="event">by Event</option>
            <option value="artist">by Artist</option>
            <option value="venue">by Venue</option>
            <option value="city">by City</option>
          </select>
          {query && (
            <button type="button" onClick={() => setQuery("")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 18, padding: "8px 12px" }}>✕</button>
          )}
        </div>

        {isLoading && <p className="events-list-loading">Loading events...</p>}

        {!isLoading && filtered.length === 0 && (
          <p className="events-list-loading">
            {query ? `No events match "${query}".` : "No events available."}
          </p>
        )}

        {!isLoading &&
          filtered.map((event) => (
            <div key={event.id} className="events-list-card">
              <div className="elc-info">
                <span className="elc-price-badge">${event.price.toFixed(2)}</span>
                <h2 className="elc-title">{event.title}</h2>
                <p className="elc-date">
                  {formatEventDate(event.date)}
                  {formatEventTime(event.date) && ` · ${formatEventTime(event.date)}`}
                </p>
                <span className="elc-venue-badge">
                  <span className="elc-venue-dot" />
                  {event.venue}
                </span>
              </div>

              <div className="elc-right">
                <Link href={`/events/${event.id}`} className="elc-buy-btn">
                  Buy Tickets
                </Link>
                {event.image_url ? (
                  <div
                    className="elc-photo"
                    style={{ backgroundImage: `url(${event.image_url})` }}
                  />
                ) : (
                  <div className="elc-photo elc-photo-placeholder" />
                )}
              </div>
            </div>
          ))}
      </main>

      <Footer />
    </>
  );
}
