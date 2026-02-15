"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Event } from "@/lib/types/event";
import { getCookie } from "@/lib/cookies";
import Footer from "@/app/components/Footer";

function formatEventDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const venueSlug = getCookie("venue-slug");
    const params = venueSlug ? `?venue_slug=${venueSlug}` : "";

    fetch(`/api/events${params}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to fetch events");
        const data = await res.json();
        if (Array.isArray(data)) {
          setEvents(data);
        }
      })
      .catch((err) => {
        console.error("Events fetch error:", err);
      })
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <>
      <main className="events-list-page">
        {isLoading && (
          <p className="events-list-loading">Loading events...</p>
        )}

        {!isLoading && events.length === 0 && (
          <p className="events-list-loading">No events available.</p>
        )}

        {!isLoading &&
          events.map((event) => (
            <div key={event.id} className="events-list-card">
              <div className="elc-info">
                <span className="elc-price-badge">
                  ${event.price.toFixed(2)}
                </span>
                <h2 className="elc-title">{event.title}</h2>
                <p className="elc-date">{formatEventDate(event.date)}</p>
                <span className="elc-venue-badge">
                  <span className="elc-venue-dot" />
                  {event.venue}
                </span>
              </div>

              <div className="elc-right">
                <Link
                  href={`/events/${event.id}`}
                  className="elc-buy-btn"
                >
                  🎫 Buy Tickets
                </Link>

                {event.image_url && (
                  <div
                    className="elc-photo"
                    style={{ backgroundImage: `url(${event.image_url})` }}
                  />
                )}
                {!event.image_url && (
                  <div className="elc-photo elc-photo-placeholder" />
                )}
              </div>
            </div>
          ))}
      </main>

      <Footer />
    </>
  );
}
