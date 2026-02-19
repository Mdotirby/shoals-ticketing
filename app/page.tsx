"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
import EventCard from "./components/EventCard";
import Footer from "./components/Footer";
import { Event } from "@/lib/types/event";
import { useVenue } from "./components/VenueContext";
import { useVenueTheme } from "./components/VenueThemeProvider";

// Default hero images (West 72 / main domain)
const DEFAULT_HERO_1 = "https://rgwykfwlnzkblsmtzatx.supabase.co/storage/v1/object/sign/webUI-pics/Photo%20Nov%2008%202025,%208%2041%2054%20PM.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9lN2Y2ZWNhMS01ZWEyLTRlOWEtOWZhMS01NWUxOGNkODkxMzkiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ3ZWJVSS1waWNzL1Bob3RvIE5vdiAwOCAyMDI1LCA4IDQxIDU0IFBNLmpwZyIsImlhdCI6MTc3MTA0NjkwMSwiZXhwIjoxODAyNTgyOTAxfQ.Nv30BCP6oIByWGDfqwg1AfwnYzBA3U6xkgB9fNX-T2E";
const DEFAULT_HERO_2 = "https://rgwykfwlnzkblsmtzatx.supabase.co/storage/v1/object/sign/webUI-pics/Photo%20Oct%2025%202024,%204%2008%2039%20PM%20(1).jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9lN2Y2ZWNhMS01ZWEyLTRlOWEtOWZhMS01NWUxOGNkODkxMzkiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ3ZWJVSS1waWNzL1Bob3RvIE9jdCAyNSAyMDI0LCA0IDA4IDM5IFBNICgxKS5qcGciLCJpYXQiOjE3NzEyNzE3MzUsImV4cCI6MTgwMjgwNzczNX0._wFJSXOe4a4GWPfwAC-skaCxpra06sGhszPZKvdAsrA";
function AnimatedEventCard({ event, index }: { event: Event; index: number }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <motion.div
      ref={ref}
      className="home-event-card-wrapper"
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
    >
      <EventCard event={event} />
    </motion.div>
  );
}

export default function HomePage() {
  const { venueSlug, isVenueSubdomain } = useVenue();
  const venueTheme = useVenueTheme();
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");

  // Use venue-specific hero images if on a subdomain, otherwise defaults
  const HERO_IMAGE_1 = venueTheme.hero_image_url || DEFAULT_HERO_1;
  const HERO_IMAGE_2 = venueTheme.hero_image_2_url || DEFAULT_HERO_2;

  const filtered = useMemo(() => {
    if (!query) return events;
    const q = query.toLowerCase();
    return events.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.venue.toLowerCase().includes(q)
    );
  }, [events, query]);

  useEffect(() => {
    const params = isVenueSubdomain ? `?venue_slug=${venueSlug}` : "";

    fetch(`/api/events${params}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to fetch events");
        return res.json();
      })
      .then((data) => setEvents(data))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <>
      <main className="home-page">
        {/* ── HERO SECTION ── */}
        <section
          className="home-hero"
          style={{
            backgroundImage: HERO_IMAGE_1
              ? `url(${HERO_IMAGE_1})`
              : "linear-gradient(180deg, #0b0d1d 0%, #202045 100%)",
          }}
        >
          <div className="home-hero-overlay" />
          <div className="home-hero-content">
            <h1 className="home-hero-title">
              Feel the Music.
              <br />
              Live the Moment.
            </h1>

            <Link href="/events" className="home-hero-cta">
              See What&apos;s Coming <span className="cta-arrow">→</span>
            </Link>

            <div className="home-hero-partners">
              <span className="partners-label">Trusted by our partners</span>
              <div className="partners-logos">
                {/* Replace with actual partner logos */}
                <span className="partner-logo-placeholder">🎵 Logoipsum</span>
                <span className="partner-logo-placeholder">🎸 LOGOIPSUM</span>
                <span className="partner-logo-placeholder">🎶 Logoipsum</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── GOLD SEPARATOR ── */}
        <div className="home-gold-separator" />

        {/* ── UPCOMING SHOWS SECTION ── */}
        <section className="home-upcoming-section">
          <div className="home-upcoming-header">
            <div className="events-eyebrow">
              <span className="events-eyebrow-glow" />
              <span className="events-eyebrow-accent-left" />
              <span className="events-eyebrow-text">UPCOMING SHOWS</span>
              <span className="events-eyebrow-accent-right" />
            </div>
            <h2 className="home-upcoming-heading">
              What&apos;s Coming . . ?
            </h2>
            <div className="home-events-search">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.5" />
                <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                type="search"
                className="home-events-search-input"
                placeholder="Search shows…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search events"
              />
            </div>
          </div>

          <div className="home-events-carousel">
            {isLoading && (
              <p className="home-events-loading">Loading events...</p>
            )}
            {!isLoading && filtered.length === 0 && (
              <p className="home-events-loading">
                {query ? `No shows match "${query}".` : "No events yet."}
              </p>
            )}
            {!isLoading &&
              filtered.map((event, i) => (
                <AnimatedEventCard key={event.id} event={event} index={i} />
              ))}
          </div>
        </section>

        {/* ── SECOND HERO IMAGE ── */}
        <section
          className="home-hero-secondary"
          style={{
            backgroundImage: HERO_IMAGE_2
              ? `url(${HERO_IMAGE_2})`
              : "linear-gradient(180deg, #202045 0%, #0b0d1d 100%)",
          }}
        >
          <div className="home-hero-overlay" />
        </section>

        {/* ── CTA SECTION ── */}
        <section className="home-cta-section">
          <div className="home-cta-glow" />
          <h2 className="home-cta-title">Get Rowdy With Us!</h2>
          <p className="home-cta-subtitle">
            Join thousands of live music fans for unforgettable nights, real-world energy,
            and meaningful connections.
          </p>
          <Link href="/events" className="home-cta-button">
            🎫 See What&apos;s Coming
          </Link>
        </section>
      </main>

      <Footer />
    </>
  );
}
