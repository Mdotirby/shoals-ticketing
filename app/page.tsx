"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import Link from "next/link";
import { motion, useInView, useReducedMotion } from "framer-motion";
import EventGridCard from "./components/EventGridCard";
import SfHeader from "./components/SfHeader";
import SfFooter from "./components/SfFooter";
import NewsletterSignup from "./components/NewsletterSignup";
import FeaturedEventsCarousel from "./components/FeaturedEventsCarousel";
import { Event } from "@/lib/types/event";
import { Sponsor } from "@/lib/types/sponsor";
import { useVenue } from "./components/VenueContext";
import { useVenueTheme } from "./components/VenueThemeProvider";
import { useOperator } from "./components/OperatorContext";
import { WEST72_HOST_VENUE_ID, WEST72_EVENT_VENUE_ID } from "@/lib/west72-featured";

/**
 * Home — storefront glass rebuild (step 3/8).
 *
 * DATA LAYER UNCHANGED. Both fetches (/api/sponsors?homepage=1 and
 * /api/events), their effect dependency arrays, the `filtered` memo including
 * the west72 featured-venue sort and slice(0, 7), and every venueTheme
 * homepage override are byte-identical to the previous version. Only markup
 * and class names changed.
 *
 * The mockup (VenueCore.dc.html lines 1250–1311) draws home as just
 * header → hero → "Upcoming" grid → footer. Production has four sections the
 * mockup does not draw, and all four are KEPT here per Matt's call:
 *
 *   - the Proud Partners strip (paid sponsor logos, /api/sponsors?homepage=1)
 *   - the home search box
 *   - the "Get Rowdy" CTA section
 *   - the FWB / newsletter signup (NewsletterSignup → /api/laylo/subscribe)
 *
 * Dropping them would have deleted two live API calls and the sponsor
 * placements, which the spec's own "every fetch stays byte-identical" rule
 * forbids. They are restyled to sit with the glass surfaces rather than
 * removed.
 *
 * Cards are EventGridCard (.events-grid-card), not EventCard. The mockup's
 * home cards at line 1288 are the photo-on-top/body-beneath shape with a
 * price pill and a CTA button — the listing card, not the full-bleed tile.
 * See the warning at the top of the storefront block in globals.css.
 */

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
        <motion.img
          src={sponsor.logo_url!}
          alt={sponsor.sponsor_name}
          onError={() => setImgFailed(true)}
          animate={{ scale: hovered ? 1.06 : 1 }}
          transition={{ duration: 0.25 }}
          style={{ height: tierH, maxWidth: 160, objectFit: "contain" }}
        />
      ) : (
        <span className="sf-partners-fallback">{sponsor.sponsor_name}</span>
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
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
    >
      <EventGridCard event={event} />
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
    <section className="sf-cta" ref={ctaRef}>
      <motion.h2
        className="sf-cta-title"
        initial="hidden"
        animate={ctaInView ? "visible" : "hidden"}
        variants={revealVariant()}
      >
        {operator.slug === "west72" ? "Get Rowdy" : "Get Rowdy With Us!"}
      </motion.h2>
      <motion.p
        className="sf-cta-sub"
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
        <Link href="/events" className="sf-btn sf-btn--primary sf-btn--lg">
          {operator.slug === "west72" ? "See the Full Calendar" : "See What’s Coming"}
        </Link>
      </motion.div>
    </section>
  );

  return (
    <div className="sf-page">
      <SfHeader />

      {/* ── HERO ── */}
      {operator.slug === "west72" ? (
        <FeaturedEventsCarousel />
      ) : (
        <section className="sf-hero">
          <div className="sf-hero-media">
            {/* Ken Burns pan is kept — .home-hero-bg-ken is the same
                absolute/cover fill as .sf-hero-media-layer plus the 30s
                animation, so the two compose without fighting. */}
            <div
              className="sf-hero-media-layer home-hero-bg-ken"
              style={{
                backgroundImage: HERO_IMAGE_1 ? `url(${HERO_IMAGE_1})` : undefined,
              }}
            />
          </div>
          <motion.div
            className="sf-hero-overlay"
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: prefersReduced ? 0 : 0.2, delayChildren: prefersReduced ? 0 : 0.35 } },
            }}
          >
            <motion.h1 className="sf-hero-title" variants={heroItem}>
              {venueTheme.homepage_headline || (
                <>Feel the Music. Live the Moment.</>
              )}
            </motion.h1>
            {venueTheme.homepage_subheadline && (
              <motion.p className="sf-hero-kicker" variants={heroItem}>
                {venueTheme.homepage_subheadline}
              </motion.p>
            )}

            <motion.div className="sf-hero-actions" variants={heroItem}>
              <Link
                href={venueTheme.homepage_cta_url || "/events"}
                className="sf-btn sf-btn--primary sf-btn--lg"
              >
                {venueTheme.homepage_cta_text || "See What’s Coming"}
              </Link>
            </motion.div>
          </motion.div>
        </section>
      )}

      {/* ── PROUD PARTNERS ──
          Not in the mockup, kept deliberately: these are paid placements and
          the strip is the only thing on the storefront that renders them. */}
      {homeSponsors.length > 0 && (
        <section ref={sponsorRef} className="sf-partners">
          <motion.p
            initial={{ opacity: 0 }}
            animate={sponsorInView ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="sf-eyebrow"
          >
            Proud Partners
          </motion.p>
          <motion.div
            initial="hidden"
            animate={sponsorInView ? "visible" : "hidden"}
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }}
            className="sf-partners-row"
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
            <Link href="/partners" className="sf-partners-link">
              View All Partners →
            </Link>
          </motion.div>
        </section>
      )}

      {/* ── UPCOMING ── */}
      <motion.div
        ref={upcomingRef}
        className="sf-section-head"
        initial="hidden"
        animate={upcomingInView ? "visible" : "hidden"}
        variants={{ hidden: {}, visible: { transition: { staggerChildren: prefersReduced ? 0 : 0.12 } } }}
      >
        <h2>Upcoming</h2>

        {/* Not in the mockup; production has it and it stays. */}
        <div className="sf-home-search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ color: "rgba(255,255,255,0.35)", flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.5" />
            <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            placeholder="Search shows…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button type="button" aria-label="Clear search" onClick={() => setQuery("")}>✕</button>
          )}
        </div>

        <Link href="/events">All events →</Link>
      </motion.div>

      <div className="sf-grid-home">
        {!isLoading &&
          filtered.map((event, i) => (
            <AnimatedEventCard key={event.id} event={event} index={i} />
          ))}
      </div>

      {isLoading && <p className="sf-empty">Loading events...</p>}
      {!isLoading && filtered.length === 0 && (
        <p className="sf-empty">
          {query ? `No shows match "${query}".` : "No events yet."}
        </p>
      )}

      {/* For west72, the CTA reads as the end of the card list, not below the FWB section */}
      {operator.slug === "west72" && ctaSection}

      {/* ── NEWSLETTER / FWB ──
          Not in the mockup, kept: this is the Friends With Benefits signup and
          it POSTs /api/laylo/subscribe. */}
      {operator.slug === "west72" ? (
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
          {/* Decorative second hero band, non-west72 only. Kept from the
              previous version; only the rounding/border moved to glass. */}
          <section
            className="sf-hero-secondary"
            style={{
              backgroundImage: HERO_IMAGE_2
                ? `url(${HERO_IMAGE_2})`
                : "linear-gradient(180deg, #202045 0%, #0b0d1d 100%)",
            }}
          />
        </>
      )}

      {operator.slug !== "west72" && ctaSection}

      <SfFooter />
    </div>
  );
}
