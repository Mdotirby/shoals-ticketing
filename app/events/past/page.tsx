"use client";

/**
 * Public archive of past / closed-out shows.
 *
 * Customer-facing page that lists shows the venue has hosted. Tickets
 * cannot be purchased — this is purely a "look what we've done" history.
 *
 * Source: GET /api/events?include=past
 *   The endpoint returns events whose date has passed OR which an admin
 *   has explicitly closed out. Sorted most-recent first.
 */
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Event } from "@/lib/types/event";
import { useVenue } from "@/app/components/VenueContext";
import Footer from "@/app/components/Footer";
import { formatEventDateShort } from "@/lib/dates";

export default function PastEventsPage() {
  const { venueSlug, isVenueSubdomain } = useVenue();
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const params = new URLSearchParams({ include: "past" });
    if (isVenueSubdomain && venueSlug) params.set("venue_slug", venueSlug);
    fetch(`/api/events?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to fetch past events");
        const data = await res.json();
        if (Array.isArray(data)) setEvents(data);
      })
      .catch((err) => console.error("Past events fetch error:", err))
      .finally(() => setIsLoading(false));
  }, [venueSlug, isVenueSubdomain]);

  const filtered = useMemo(() => {
    if (!query) return events;
    const q = query.toLowerCase();
    return events.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.venue.toLowerCase().includes(q) ||
        (e.description ?? "").toLowerCase().includes(q)
    );
  }, [events, query]);

  return (
    <>
      <main className="events-list-page">
        <div style={{ marginBottom: 24 }}>
          <div className="events-eyebrow" style={{ marginBottom: 8 }}>
            <span className="events-eyebrow-glow" />
            <span className="events-eyebrow-accent-left" />
            <span className="events-eyebrow-text">PAST SHOWS</span>
            <span className="events-eyebrow-accent-right" />
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 800, color: "#fff", margin: 0 }}>
            Look Back
          </h1>
          <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 14, margin: "8px 0 0" }}>
            Shows we&apos;ve hosted. Tickets are no longer on sale —
            <Link href="/events" style={{ color: "#d0c290", marginLeft: 4 }}>
              see what&apos;s coming →
            </Link>
          </p>
        </div>

        <div className="events-search-bar">
          <svg className="events-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.5" />
            <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            className="events-search-input"
            placeholder="Search past shows"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 18, padding: "8px 12px" }}
            >
              ✕
            </button>
          )}
        </div>

        {isLoading && <p className="events-list-loading">Loading past shows…</p>}
        {!isLoading && filtered.length === 0 && (
          <p className="events-list-loading">
            {query ? `No past shows match "${query}".` : "No past shows yet."}
          </p>
        )}

        <style>{`
          .past-event-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 24px;
            margin-top: 24px;
          }
          @media (max-width: 1024px) { .past-event-grid { grid-template-columns: repeat(2, 1fr); } }
          @media (max-width: 640px)  { .past-event-grid { grid-template-columns: 1fr; } }
          .past-event-card {
            position: relative;
            background: rgba(255,255,255,0.02);
            border: 1px solid rgba(255,255,255,0.06);
            border-radius: 12px;
            overflow: hidden;
            transition: all 0.2s;
            cursor: pointer;
            text-decoration: none;
            display: block;
          }
          .past-event-card:hover {
            border-color: rgba(208,194,144,0.3);
            transform: translateY(-2px);
          }
          .past-event-thumb {
            width: 100%;
            aspect-ratio: 16 / 9;
            background-size: cover;
            background-position: center;
            background-color: #1a1a2a;
            filter: grayscale(0.4) brightness(0.85);
          }
          .past-event-body { padding: 14px 16px 16px; }
          .past-event-title {
            color: #fff;
            font-size: 15px;
            font-weight: 700;
            margin: 0 0 4px;
            line-height: 1.3;
          }
          .past-event-meta {
            color: rgba(255,255,255,0.5);
            font-size: 12px;
          }
          .past-badge {
            position: absolute;
            top: 10px;
            right: 10px;
            background: rgba(0,0,0,0.65);
            color: rgba(255,255,255,0.85);
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 1px;
            padding: 3px 8px;
            border-radius: 3px;
            text-transform: uppercase;
          }
        `}</style>

        {!isLoading && filtered.length > 0 && (
          <div className="past-event-grid">
            {filtered.map((ev) => (
              <Link
                key={ev.id}
                href={`/events/${ev.id}`}
                className="past-event-card"
              >
                <div
                  className="past-event-thumb"
                  style={{ backgroundImage: ev.image_url ? `url(${ev.image_url})` : undefined }}
                />
                <span className="past-badge">Past</span>
                <div className="past-event-body">
                  <h3 className="past-event-title">{ev.title}</h3>
                  <div className="past-event-meta">
                    {ev.venue} · {formatEventDateShort(ev.date)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
