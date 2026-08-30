"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "framer-motion";
import { Event } from "@/lib/types/event";
import { formatEventDateLong } from "@/lib/dates";
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

  return (
    <motion.section
      className="home-hero featured-carousel"
      drag={isMobile && events.length > 1 ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.2}
      onDragEnd={handleDragEnd}
    >
      <AnimatePresence>
        <motion.div
          key={event.id}
          className="featured-carousel-bg"
          style={{
            backgroundImage: event.image_url ? `url(${event.image_url})` : undefined,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: prefersReduced ? 0 : 0.8, ease: "easeOut" }}
        />
      </AnimatePresence>

      <div className="home-hero-overlay" />

      <div className="home-hero-content">
        <AnimatePresence mode="wait">
          <motion.div
            key={event.id}
            initial={{ opacity: 0, y: prefersReduced ? 0 : 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: prefersReduced ? 0 : -16 }}
            transition={{ duration: prefersReduced ? 0 : 0.4, ease: "easeOut" }}
          >
            <h1 className="featured-carousel-title">{event.title}</h1>
            {event.subtitle && (
              <p className="featured-carousel-subtitle">{event.subtitle}</p>
            )}
            <p className="featured-carousel-date">{formatEventDateLong(event.date)}</p>
            <Link href={`/events/${event.id}`} className="home-hero-cta">
              Get Tickets
            </Link>
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.section>
  );
}
