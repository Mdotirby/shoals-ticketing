"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Event } from "@/lib/types/event";
import { useVenue } from "@/app/components/VenueContext";
import EventsHero from "@/app/components/EventsHero";
import EventCard from "@/app/components/EventCard";
import Footer from "@/app/components/Footer";
import { eventToCardProps } from "@/lib/eventCardProps";

/**
 * Events index — storefront rebuild (2026-09-05).
 *
 * DATA LAYER UNCHANGED. Both fetches, their query-param construction, their
 * effect dependencies, the FilterType union, matchesFilter(), hostsWithEvents
 * and the `filtered` memo are byte-identical to main. Nothing about which
 * events appear, in what order, or under what filter moved.
 *
 * What changed is presentation only, and it removes code rather than adding it:
 *
 * 1. The 200-line inline <style> block is gone. It hardcoded the pre-glass
 *    navy palette — background:#131629, #0b0d1d, rgb(var(--vc-gold-rgb))
 *    pills and buttons — so this page rendered in the old theme while every
 *    other storefront surface had moved to liquid glass. That block was the
 *    single largest source of the drift.
 *
 * 2. The hand-inlined card markup is replaced by <EventCard>, fed through
 *    eventToCardProps(). EventCard already renders on the .event-card classes
 *    in globals.css under body[data-theme="liquid-glass"], and the home page
 *    and checkout-success cross-sell grid already use exactly this pairing —
 *    so the cards here now match those two surfaces instead of being a third
 *    private implementation that formats its own dates and prices.
 *
 * 3. <EventsHero /> now renders above the search bar. It existed in the repo,
 *    picks up the per-venue hero via SafeImage, and was simply never mounted
 *    on this route — the page opened straight onto a bare filter row.
 *
 * The only CSS this file still carries is the grid track definition, which is
 * layout specific to this route. Card styling stays in globals.css so it can't
 * fork again.
 */

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
      <EventsHero />

      <main className="events-list-page">
        {/* ── Search + Filter bar ──
            events.png shows the search input, the two filter pills, and the
            "View past shows" link as separate elements spread across the
            full row width — not all crammed inside one big capped-width
            pill. .events-search-bar is the bare flex-row wrapper; the
            search icon+input has its own pill (.events-search-pill) so it
            doesn't lose that styling given the outer div isn't a pill. */}
        <div className="events-search-bar">
          <div className="events-search-pill">
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
            {query && (
              <button
                type="button"
                className="events-search-clear"
                aria-label="Clear search"
                onClick={() => setQuery("")}
              >
                ✕
              </button>
            )}
          </div>

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
              value={hostFilter}
              onChange={(e) => setHostFilter(e.target.value)}
            >
              <option value="">All Hosts</option>
              {hostsWithEvents.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          )}

          {/* events.png puts this on the same row as search/filters,
              right-aligned. The inline style block it used to carry moved
              into .events-view-past-link below. */}
          <Link href="/events/past" className="events-view-past-link">
            View past shows →
          </Link>
        </div>

        {isLoading && <p className="events-list-loading">Loading events...</p>}

        {!isLoading && filtered.length === 0 && (
          <p className="events-list-loading">
            {query ? `No events match "${query}".` : "No events available."}
          </p>
        )}

        {/* Grid tracks only — card surfaces live in globals.css so this route
            can't fork the card design again. */}
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
            .events-card-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
          }
          @media (max-width: 400px) {
            .events-card-grid { grid-template-columns: 1fr; gap: 12px; }
          }
          .events-search-clear {
            background: none;
            border: none;
            color: rgba(255,255,255,0.5);
            cursor: pointer;
            font-size: 18px;
            padding: 4px 8px;
            line-height: 1;
          }
          .events-search-clear:hover { color: rgba(255,255,255,0.85); }
          .events-view-past-link {
            margin-left: auto;
            font-size: 12px;
            color: rgba(255,255,255,0.55);
            text-decoration: none;
            white-space: nowrap;
            border-bottom: 1px solid rgba(255,255,255,0.15);
            padding-bottom: 1px;
          }
          .events-view-past-link:hover {
            color: rgba(255,255,255,0.9);
            border-bottom-color: rgba(255,255,255,0.4);
          }
        `}</style>

        {!isLoading && filtered.length > 0 && (
          <div className="events-card-grid">
            {filtered.map((event) => (
              <EventCard key={event.id} {...eventToCardProps(event)} />
            ))}
          </div>
        )}
      </main>

      <Footer />
    </>
  );
}
