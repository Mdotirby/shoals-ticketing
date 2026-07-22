"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Event } from "@/lib/types/event";
import { formatEventDateLong } from "@/lib/dates";

// West 72 Entertainment LLC (host) + Singin' River Brewing Co. (venue) —
// per Mobile UI Web Design.psd, only events matching both show here.
const HOST_VENUE_ID = "341ddebe-2666-4d1d-a279-4bc44b7f2700";
const EVENT_VENUE_ID = "a0ab8c69-06b7-4242-89d6-2d85ad3c17a3";
const ROTATE_MS = 4000;

/** Returns null while loading or if no events match, so the caller can fall back to the default hero. */
export default function FeaturedEventsCarousel() {
  const [events, setEvents] = useState<Event[] | null>(null);
  const [index, setIndex] = useState(0);
  const prefersReduced = useReducedMotion();

  useEffect(() => {
    fetch(`/api/events?venue_id=${HOST_VENUE_ID}&event_venue_id=${EVENT_VENUE_ID}`)
      .then((res) => res.json())
      .then((data) => setEvents(Array.isArray(data) ? data : []))
      .catch(() => setEvents([]));
  }, []);

  useEffect(() => {
    if (!events || events.length < 2) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % events.length);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [events]);

  if (!events || events.length === 0) return null;

  const event = events[index];

  return (
    <section className="home-hero featured-carousel">
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
    </section>
  );
}
