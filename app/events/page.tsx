"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Event } from "@/lib/types/event";
import { useVenue } from "@/app/components/VenueContext";
import Footer from "@/app/components/Footer";
import { formatEventDateShort, formatEventTime } from "@/lib/dates";

type FilterType = "all" | "event" | "artist" | "venue" | "city";

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
  const [hosts, setHosts] = useState<{ id: string; name: string }[]>([]);
  const [hostFilter, setHostFilter] = useState("");

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

    fetch("/api/venues")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setHosts(data.map((v) => ({ id: v.id, name: v.name })));
      })
      .catch((err) => console.error("Venues fetch error:", err));
  }, [venueSlug, isVenueSubdomain]);

  // Only list hosts that actually have an upcoming event, so the dropdown
  // never offers a choice that would empty the results.
  const hostsWithEvents = useMemo(
    () => hosts.filter((h) => events.some((e) => e.venue_id === h.id)),
    [hosts, events]
  );

  const filtered = useMemo(
    () =>
      events.filter(
        (e) => matchesFilter(e, query, filter) && (!hostFilter || e.venue_id === hostFilter)
      ),
    [events, query, filter, hostFilter]
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
          {hostsWithEvents.length > 0 && (
            <select
              className="events-filter-select"
              style={{ marginLeft: 6 }}
              value={hostFilter}
              onChange={(e) => setHostFilter(e.target.value)}
            >
              <option value="">All Hosts</option>
              {hostsWithEvents.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          )}
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

        {/* Always-visible link to the past-shows archive */}
        <div style={{ textAlign: "right", marginTop: 8 }}>
          <Link
            href="/events/past"
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.55)",
              textDecoration: "none",
              borderBottom: "1px solid rgba(255,255,255,0.15)",
              paddingBottom: 1,
            }}
          >
            View past shows →
          </Link>
        </div>

        {/* ── Responsive grid styles ── */}
        <style>{`
          .events-card-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 24px;
            margin-top: 24px;
          }
          @media (max-width: 1024px) {
            .events-card-grid { grid-template-columns: repeat(2, 1fr); }
          }
          @media (max-width: 768px) {
            .events-card-grid {
              grid-template-columns: repeat(2, 1fr);
              gap: 12px;
            }
            .events-grid-card .event-card-body {
              padding: 10px;
              gap: 6px;
            }
            .events-grid-card .event-card-title {
              font-size: 14px;
            }
            .events-grid-card .event-card-meta {
              font-size: 11px;
            }
            .events-grid-card .event-card-price {
              font-size: 11px;
              padding: 3px 10px;
            }
            .events-grid-card .event-card-btn {
              font-size: 12px;
              padding: 8px;
            }
          }
          @media (max-width: 400px) {
            .events-card-grid {
              grid-template-columns: repeat(2, 1fr);
              gap: 8px;
            }
          }
          .events-grid-card {
            background: #131629;
            border-radius: 12px;
            border: 1px solid rgba(255,255,255,0.08);
            overflow: hidden;
            display: flex;
            flex-direction: column;
            transition: transform 0.2s ease, border-color 0.2s ease;
            text-decoration: none;
            color: inherit;
          }
          .events-grid-card:hover {
            transform: scale(1.02);
            border-color: rgba(var(--vc-gold-rgb), 0.45);
          }
          .event-card-img {
            position: relative;
            width: 100%;
            aspect-ratio: 16 / 9;
            background: #0b0d1d;
            overflow: hidden;
          }
          .event-card-img img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
          }
          .event-card-img::after {
            content: "";
            position: absolute;
            bottom: 0; left: 0; right: 0;
            height: 50%;
            background: linear-gradient(to top, rgba(19,22,41,0.85), transparent);
            pointer-events: none;
          }
          .event-card-placeholder {
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .event-card-body {
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            flex: 1;
          }
          .event-card-title {
            font-size: 17px;
            font-weight: 700;
            color: #fff;
            margin: 0;
            line-height: 1.3;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }
          .event-card-meta {
            font-size: 13px;
            color: rgba(255,255,255,0.5);
            margin: 0;
            display: flex;
            align-items: center;
            gap: 5px;
          }
          .event-card-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            margin-top: auto;
          }
          .event-card-price {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 999px;
            font-size: 13px;
            font-weight: 600;
            background: rgba(var(--vc-gold-rgb), 0.15);
            color: rgb(var(--vc-gold-rgb));
          }
          .event-card-btn {
            display: inline-block;
            padding: 10px 20px;
            border: none;
            border-radius: 999px;
            background: rgb(var(--vc-gold-rgb));
            color: #0b0d1d;
            font-size: 14px;
            font-weight: 700;
            text-align: center;
            text-decoration: none;
            cursor: pointer;
            white-space: nowrap;
            transition: opacity 0.15s ease;
          }
          .event-card-btn:hover { opacity: 0.88; }
        `}</style>

        {!isLoading && filtered.length > 0 && (
          <div className="events-card-grid">
            {filtered.map((event) => {
              const isFree = event.price === 0;
              return (
                <Link
                  key={event.id}
                  href={`/events/${event.id}`}
                  className="events-grid-card"
                >
                  {/* Image */}
                  <div className={`event-card-img${!event.image_url ? " event-card-placeholder" : ""}`}>
                    {event.image_url ? (
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
            })}
          </div>
        )}
      </main>

      <Footer />
    </>
  );
}
