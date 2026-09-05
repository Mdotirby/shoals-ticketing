"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Event } from "@/lib/types/event";
import { useVenue } from "@/app/components/VenueContext";
import SfHeader from "@/app/components/SfHeader";
import SfFooter from "@/app/components/SfFooter";
import EventGridCard from "@/app/components/EventGridCard";

/**
 * Events listing — storefront glass rebuild (step 4/8).
 *
 * DATA LAYER UNCHANGED. Both fetches, their query-param construction, the
 * [venueSlug, isVenueSubdomain] dependency array, the FilterType union,
 * matchesFilter(), hostsWithEvents and the `filtered` memo are byte-identical.
 *
 * What changed is presentation only:
 *
 *  - The inline <style> block is gone. Not because it was "pre-glass drift" —
 *    that claim was wrong and got this file reverted once. It goes because
 *    storefront-glass.css now supplies every one of those classes, including
 *    the grid tracks, so the block is genuinely redundant rather than merely
 *    overridden. The glass rules in globals.css that style .events-grid-card
 *    are untouched and still do the work.
 *
 *  - The hand-inlined card markup moves to <EventGridCard>. That component is
 *    a verbatim extraction of exactly this markup — same elements, same class
 *    names, same formatters — so the card still renders photo-on-top with the
 *    date line, the venue line, the price pill and the Get Tickets button.
 *    It is NOT EventCard, which is the full-bleed tile and belongs only to the
 *    cross-sell.
 *
 *  - EventsHero stays unmounted. The mockup has no hero on the listing.
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
    <div className="sf-page">
      <SfHeader />

      <main className="events-list-page">
        {/* ── Search + Filter bar ──
            events.png shows the search input, the two filter pills, and the
            "View past shows" link as separate elements spread across the
            full row width — not all crammed inside one big capped-width
            pill. .events-search-bar is now the bare flex-row wrapper; the
            search icon+input got its own pill (.events-search-pill) so it
            doesn't lose that styling now that the outer div isn't a pill
            itself. */}
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
                className="sf-search-clear"
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

          {/* events.png puts this on the same row as search/filters, right-aligned
              — was a separate row below the whole bar. */}
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

        {/* Grid tracks, card surface, search pill, filter selects and the
            past-shows link all come from the storefront block in globals.css
            now — this route carries no <style> of its own. */}
        {!isLoading && filtered.length > 0 && (
          <div className="sf-grid-events">
            {filtered.map((event) => (
              <EventGridCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </main>

      <SfFooter />
    </div>
  );
}
