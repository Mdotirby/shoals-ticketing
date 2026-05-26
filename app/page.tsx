"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
import EventCard from "./components/EventCard";
import Footer from "./components/Footer";
import NewsletterSignup from "./components/NewsletterSignup";
import { Event } from "@/lib/types/event";
import { Sponsor } from "@/lib/types/sponsor";
import { useVenue } from "./components/VenueContext";
import { useVenueTheme } from "./components/VenueThemeProvider";

// Hero images from public folder — per-venue via slug
const DEFAULT_HERO_1 = "/hero-images/default/hero.jpg";
const DEFAULT_HERO_2 = "/hero-images/default/hero2.jpg";
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
  const [homeSponsors, setHomeSponsors] = useState<Sponsor[]>([]);
  const sponsorRef = useRef(null);
  const sponsorInView = useInView(sponsorRef, { once: true, margin: "-60px" });

  // Hero: prefer DB-stored URL (uploaded via branding page), fall back to static file, then default
  const staticSlugHero = isVenueSubdomain ? `/hero-images/${venueSlug}/hero.jpg` : DEFAULT_HERO_1;
  const HERO_IMAGE_1 = venueTheme.hero_image_url || staticSlugHero;
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
    fetch("/api/sponsors?homepage=1")
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setHomeSponsors(data); })
      .catch(() => {});
  }, []);

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
              {venueTheme.homepage_headline || (
                <>Feel the Music.<br />Live the Moment.</>
              )}
            </h1>
            {venueTheme.homepage_subheadline && (
              <p className="home-hero-subtitle">{venueTheme.homepage_subheadline}</p>
            )}

            <Link href={venueTheme.homepage_cta_url || "/events"} className="home-hero-cta">
              {venueTheme.homepage_cta_text || "See What's Coming"} <span className="cta-arrow">→</span>
            </Link>

            {/* Partner logos strip removed from hero — rendered as its own section below */}
          </div>
        </section>

        {/* ── GOLD SEPARATOR ── */}
        <div className="home-gold-separator" />

        {/* ── PROUD PARTNERS STRIP ── */}
        {homeSponsors.length > 0 && (
          <section ref={sponsorRef} style={{ padding: "32px 24px", textAlign: "center", borderBottom: "1px solid rgba(208,194,144,0.08)" }}>
            <motion.p
              initial={{ opacity: 0 }}
              animate={sponsorInView ? { opacity: 1 } : { opacity: 0 }}
              transition={{ duration: 0.6 }}
              style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(208,194,144,0.5)", marginBottom: 20 }}
            >
              Proud Partners
            </motion.p>
            <motion.div
              initial="hidden"
              animate={sponsorInView ? "visible" : "hidden"}
              variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }}
              style={{ display: "flex", justifyContent: "center", alignItems: "center", flexWrap: "wrap", gap: "16px 40px" }}
            >
              {homeSponsors.map(sponsor => (
                <motion.a
                  key={sponsor.id}
                  href={sponsor.website_url ?? "#"}
                  target={sponsor.website_url ? "_blank" : undefined}
                  rel="noopener noreferrer"
                  variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.45 } } }}
                  whileHover={{ scale: 1.06, opacity: 1 }}
                  style={{ opacity: 0.6, transition: "opacity 0.2s", display: "inline-flex", alignItems: "center" }}
                >
                  {sponsor.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={sponsor.logo_url}
                      alt={sponsor.name}
                      style={{
                        height: sponsor.tier === "title" ? 52 : sponsor.tier === "presenting" ? 40 : 30,
                        maxWidth: 160,
                        objectFit: "contain",
                        filter: "grayscale(1) brightness(1.8)",
                      }}
                    />
                  ) : (
                    <span style={{ fontSize: sponsor.tier === "title" ? 16 : 13, fontWeight: 700, color: "rgba(208,194,144,0.7)", letterSpacing: "0.05em" }}>
                      {sponsor.name}
                    </span>
                  )}
                </motion.a>
              ))}
            </motion.div>
            <motion.div
              initial={{ opacity: 0 }}
              animate={sponsorInView ? { opacity: 1 } : { opacity: 0 }}
              transition={{ delay: 0.6, duration: 0.4 }}
            >
              <Link href="/partners" style={{ display: "inline-block", marginTop: 16, fontSize: 11, color: "rgba(208,194,144,0.4)", textDecoration: "none", letterSpacing: "0.08em" }}>
                View All Partners →
              </Link>
            </motion.div>
          </section>
        )}

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
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{color: "rgba(255,255,255,0.35)", flexShrink: 0}}>
                <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.5" />
                <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                type="search"
                className="home-events-search-input"
                placeholder="Search shows…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 18, padding: "8px" }}>✕</button>
              )}
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

        {/* ── NEWSLETTER SIGNUP ── */}
        <NewsletterSignup />

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
