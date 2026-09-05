"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "framer-motion";
import { Event } from "@/lib/types/event";
import { formatEventDateLong, formatEventTime } from "@/lib/dates";
import { WEST72_HOST_VENUE_ID, WEST72_EVENT_VENUE_ID } from "@/lib/west72-featured";

const ROTATE_MS = 4000;
// How far (px) or how fast (px/s) a drag has to travel before it counts as
// an intentional swipe rather than a stray touch/tap — standard thresholds
// for this pattern, tuned so a normal tap on the "Get Tickets" link (which
// framer-motion already distinguishes from a drag by movement distance)
// never gets misread as a swipe.
const SWIPE_OFFSET_THRESHOLD = 60;
const SWIPE_VELOCITY_THRESHOLD = 400;

/** Returns null while loading or if no events match, so the caller can fall back to the default hero. */
export default function FeaturedEventsCarousel() {
  const [events, setEvents] = useState<Event[] | null>(null);
  const [index, setIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches
  );
  // Bumped after a manual swipe to restart the auto-rotate effect below with
  // a fresh ROTATE_MS window, instead of auto-advancing again moments after
  // the user just navigated manually.
  const [resetKey, setResetKey] = useState(0);
  const prefersReduced = useReducedMotion();

  useEffect(() => {
    fetch(`/api/events?venue_id=${WEST72_HOST_VENUE_ID}&event_venue_id=${WEST72_EVENT_VENUE_ID}`)
      .then((res) => res.json())
      .then((data) => setEvents(Array.isArray(data) ? data : []))
      .catch(() => setEvents([]));
  }, []);

  // Swipe gesture is mobile-only — desktop keeps today's auto-rotate-only
  // behavior untouched. Initial value comes from the lazy useState
  // initializer above; this effect only subscribes to further changes
  // (e.g. rotating a tablet, resizing a window past the breakpoint).
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (!events || events.length < 2) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % events.length);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [events, resetKey]);

  function handleDragEnd(_event: unknown, info: PanInfo) {
    if (!events || events.length < 2) return;
    const { offset, velocity } = info;
    if (offset.x < -SWIPE_OFFSET_THRESHOLD || velocity.x < -SWIPE_VELOCITY_THRESHOLD) {
      setIndex((i) => (i + 1) % events.length);
      setResetKey((k) => k + 1);
    } else if (offset.x > SWIPE_OFFSET_THRESHOLD || velocity.x > SWIPE_VELOCITY_THRESHOLD) {
      setIndex((i) => (i - 1 + events.length) % events.length);
      setResetKey((k) => k + 1);
    }
  }

  if (!events || events.length === 0) return null;

  const event = events[index];

  // Mockup line 1268 draws the kicker as uppercase DAY · MONTH DATE · VENUE.
  // formatEventDateLong already returns the "Friday, November 6" shape, so the
  // comma becomes the separator and the venue joins on the end.
  //
  // The doors time is appended as a fourth segment. The mockup's kicker has
  // only three, but the previous markup carried the time on its own
  // .featured-carousel-where line and dropping it here would lose information
  // the hero used to show.
  const kicker = [
    formatEventDateLong(event.date).replace(/,\s*/, " · "),
    event.venue,
    formatEventTime(event.date),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <motion.section
      className="sf-hero"
      drag={isMobile && events.length > 1 ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.2}
      onDragEnd={handleDragEnd}
    >
      <div className="sf-hero-media">
        <AnimatePresence>
          <motion.div
            key={event.id}
            className="sf-hero-media-layer"
            style={{
              backgroundImage: event.image_url ? `url(${event.image_url})` : undefined,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReduced ? 0 : 0.8, ease: "easeOut" }}
          />
        </AnimatePresence>
      </div>

      <div className="sf-hero-overlay">
        <AnimatePresence mode="wait">
          <motion.div
            key={event.id}
            initial={{ opacity: 0, y: prefersReduced ? 0 : 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: prefersReduced ? 0 : -16 }}
            transition={{ duration: prefersReduced ? 0 : 0.4, ease: "easeOut" }}
          >
            <p className="sf-hero-kicker">{kicker}</p>
            <h1 className="sf-hero-title">{event.title}</h1>
            {event.subtitle && (
              <p className="featured-carousel-subtitle">{event.subtitle}</p>
            )}
            <div className="sf-hero-actions">
              <Link
                href={`/events/${event.id}`}
                className="sf-btn sf-btn--primary sf-btn--lg"
              >
                Get Tickets
              </Link>
              {/* Mockup's second button is "Details"; production's is this —
                  it hands off to the event page's Spotify preview, which
                  autoplays the artist's featured track. The events list API
                  doesn't return the Spotify fields, so the event page — which
                  does have them — decides whether there's anything to play.
                  Kept over the mockup's label because it does something the
                  primary button doesn't; restyled as the secondary. */}
              <Link
                href={`/events/${event.id}?preview=1`}
                className="sf-btn sf-btn--secondary sf-btn--lg"
              >
                <svg width="9" height="10" viewBox="0 0 9 10" fill="currentColor" aria-hidden="true" style={{ marginRight: 7 }}>
                  <polygon points="0,0 9,5 0,10" />
                </svg>
                Preview Artist
              </Link>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Desktop-only affordance for the mobile swipe gesture. */}
      <div className="sf-hero-swipe" aria-hidden="true">SWIPE →</div>

      {/* Position indicator only — deliberately not clickable, so autoplay and
          swipe stay the only things that move the carousel. */}
      {events.length > 1 && (
        <div className="sf-hero-dots" aria-hidden="true">
          {events.map((e, i) => (
            <i key={e.id} className={i === index ? "active" : undefined} />
          ))}
        </div>
      )}
    </motion.section>
  );
}
