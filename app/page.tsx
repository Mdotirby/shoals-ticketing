"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import Link from "next/link";
import { motion, useInView, useReducedMotion } from "framer-motion";
import EventCard from "./components/EventCard";
import Footer from "./components/Footer";
import NewsletterSignup from "./components/NewsletterSignup";
import FeaturedEventsCarousel from "./components/FeaturedEventsCarousel";
import { Event } from "@/lib/types/event";
import { Sponsor } from "@/lib/types/sponsor";
import { useVenue } from "./components/VenueContext";
import { useVenueTheme } from "./components/VenueThemeProvider";
import { useOperator } from "./components/OperatorContext";
import { WEST72_HOST_VENUE_ID, WEST72_EVENT_VENUE_ID } from "@/lib/west72-featured";
function SponsorLogo({ sponsor }: { sponsor: Sponsor }) {
  const [imgFailed, setImgFailed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const tierH = sponsor.tier === "title" ? 52 : sponsor.tier === "presenting" ? 40 : 30;
  const showImg = !!sponsor.logo_url && !imgFailed;

  return (
    <motion.a
      href={sponsor.website_url ?? "#"}
      target={sponsor.website_url ? "_blank" : undefined}
      rel="noopener noreferrer"
      variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.45 } } }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      style={{ display: "inline-flex", alignItems: "center" }}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <motion.img
          src={sponsor.logo_url!}
          alt={sponsor.sponsor_name}
          onError={() => setImgFailed(true)}
          animate={{ scale: hovered ? 1.06 : 1 }}
          transition={{ duration: 0.25 }}
          style={{ height: tierH, maxWidth: 160, objectFit: "contain" }}
        />
      ) : (
        <span style={{ fontSize: sponsor.tier === "title" ? 16 : 13, fontWeight: 700, color: "rgba(208,194,144,0.9)", letterSpacing: "0.05em" }}>
          {sponsor.sponsor_name}
        </span>
      )}
    </motion.a>
  );
}

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

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

// Shared stagger variant for hero content children
const heroItem = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};

// Scroll-reveal variants with optional delay
function revealVariant(delay = 0) {
  return {
    hidden: { opacity: 0, y: 28 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: EASE, delay } },
  };
}

export default function HomePage() {
  const { venueSlug, isVenueSubdomain } = useVenue();
  const venueTheme = useVenueTheme();
  const operator = useOperator();
  const prefersReduced = useReducedMotion();
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [homeSponsors, setHomeSponsors] = useState<Sponsor[]>([]);
  const sponsorRef = useRef(null);
  const sponsorInView = useInView(sponsorRef, { once: true, margin: "-60px" });
  const upcomingRef = useRef(null);
  const upcomingInView = useInView(upcomingRef, { once: true, margin: "-60px" });
  const ctaRef = useRef(null);
  const ctaInView = useInView(ctaRef, { once: true, margin: "-80px" });

  // On a root operator domain (west72ent.com, venuecore.live) use the hardcoded
  // operator assets — no Supabase involved. On venue subdomains, prefer the
  // DB-stored URL then fall back to the per-venue static file.
  const HERO_IMAGE_1 = isVenueSubdomain
    ? (venueTheme.hero_image_url || `/hero-images/${venueSlug}/hero.jpg`)
    : operator.heroImage;
  const HERO_IMAGE_2 = isVenueSubdomain
    ? (venueTheme.hero_image_2_url || operator.heroImage2)
    : operator.heroImage2;

  const filtered = useMemo(() => {
    if (query) {
      const q = query.toLowerCase();
      return events.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.venue.toLowerCase().includes(q)
      );
    }
    if (operator.slug === "west72") {
      // Featured (Singin' River Brewing Co., hosted by West 72) events sort
      // first; Array.sort is stable so date order is preserved within each group.
      const isFeatured = (e: Event) =>
        e.venue_id === WEST72_HOST_VENUE_ID && e.event_venue_id === WEST72_EVENT_VENUE_ID;
      return [...events]
        .sort((a, b) => Number(isFeatured(b)) - Number(isFeatured(a)))
        .slice(0, 7);
    }
    return events;
  }, [events, query, operator.slug]);

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

  const ctaSection = (
    <section className="home-cta-section" ref={ctaRef}>
      <div className="home-cta-glow" />
      <motion.h2
        className="home-cta-title"
        initial="hidden"
        animate={ctaInView ? "visible" : "hidden"}
        variants={revealVariant()}
      >
        {operator.slug === "west72" ? "Get Rowdy" : "Get Rowdy With Us!"}
      </motion.h2>
      <motion.p
        className="home-cta-subtitle"
        initial="hidden"
        animate={ctaInView ? "visible" : "hidden"}
        variants={revealVariant(prefersReduced ? 0 : 0.12)}
      >
        Join thousands of live music fans for unforgettable nights, real-world energy,
        and meaningful connections.
      </motion.p>
      <motion.div
        initial="hidden"
        animate={ctaInView ? "visible" : "hidden"}
        variants={revealVariant(prefersReduced ? 0 : 0.24)}
      >
        <Link href="/events" className="home-cta-button">
          {operator.slug === "west72" ? "See the Full Calendar" : <>🎫 See What&apos;s Coming</>}
        </Link>
      </motion.div>
    </section>
  );

  return (
    <>
      <main className="home-page">
        {/* ── HERO SECTION ── */}
        {operator.slug === "west72" ? (
          <FeaturedEventsCarousel />
        ) : (
          <section className="home-hero">
            {/* Ken Burns background — animates on a separate layer so content stays crisp */}
            <div
              className="home-hero-bg-ken"
              style={{
                backgroundImage: HERO_IMAGE_1
                  ? `url(${HERO_IMAGE_1})`
                  : "linear-gradient(180deg, #0b0d1d 0%, #202045 100%)",
              }}
            />
            <div className="home-hero-overlay" />
            <motion.div
              className="home-hero-content"
              initial="hidden"
              animate="visible"
              variants={{
                hidden: {},
                visible: { transition: { staggerChildren: prefersReduced ? 0 : 0.2, delayChildren: prefersReduced ? 0 : 0.35 } },
              }}
            >
              <motion.h1 className="home-hero-title" variants={heroItem}>
                {venueTheme.homepage_headline || (
                  <>Feel the Music.<br />Live the Moment.</>
                )}
              </motion.h1>
              {venueTheme.homepage_subheadline && (
                <motion.p className="home-hero-subtitle" variants={heroItem}>
                  {venueTheme.homepage_subheadline}
                </motion.p>
              )}

              <motion.div variants={heroItem}>
                <Link href={venueTheme.homepage_cta_url || "/events"} className="home-hero-cta">
                  {venueTheme.homepage_cta_text || "See What's Coming"} <span className="cta-arrow">→</span>
                </Link>
              </motion.div>
            </motion.div>
          </section>
        )}

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
                <SponsorLogo key={sponsor.id} sponsor={sponsor} />
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
          <motion.div
            ref={upcomingRef}
            className="home-upcoming-header"
            initial="hidden"
            animate={upcomingInView ? "visible" : "hidden"}
            variants={{ hidden: {}, visible: { transition: { staggerChildren: prefersReduced ? 0 : 0.12 } } }}
          >
            <motion.div className="events-eyebrow" variants={revealVariant()}>
              <span className="events-eyebrow-glow" />
              <span className="events-eyebrow-accent-left" />
              <span className="events-eyebrow-text">UPCOMING SHOWS</span>
              <span className="events-eyebrow-accent-right" />
            </motion.div>
            <motion.h2 className="home-upcoming-heading" variants={revealVariant()}>
              {operator.slug === "west72" ? "See What's Next" : <>What&apos;s Coming . . ?</>}
            </motion.h2>
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
          </motion.div>

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

        {/* For west72, the CTA reads as the end of the card list, not below the FWB section */}
        {operator.slug === "west72" && ctaSection}

        {/* ── NEWSLETTER / FWB SECTION ── */}
        {operator.slug === "west72" ? (
          /* West72: FWB form floats over the rock band hero image */
          <div
            className="west72-fwb-hero"
            style={{
              backgroundImage: HERO_IMAGE_2
                ? `url(${HERO_IMAGE_2})`
                : "linear-gradient(180deg, #0a0a0a 0%, #1a1008 100%)",
            }}
          >
            <div className="west72-fwb-overlay" />
            <NewsletterSignup />
          </div>
        ) : (
          <>
            <NewsletterSignup />
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
          </>
        )}

        {operator.slug !== "west72" && ctaSection}
      </main>

      <Footer />
    </>
  );
}
