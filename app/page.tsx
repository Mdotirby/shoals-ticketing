"use client";

import { useEffect, useState } from "react";
import EventCarousel from "./components/EventCarousel";
import EventsHero from "./components/EventsHero";
import { Event } from "./types/event";

export default function HomePage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    fetch("/api/events")
               .then(async (res) => {
        if (!res.ok) {
          throw new Error("Failed to fetch events");
        }

        const data = await res.json();
        setEvents(data);
      })
      .catch(() => {
        setError("Could not load events right now.");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  return (
       <main className="home-events-page">
      <EventsHero />

      {isLoading && <p>Loading events...</p>}
      {!isLoading && error && <p>{error}</p>}
      {!isLoading && !error && events.length === 0 && <p>No events yet.</p>}

            {!isLoading && !error && events.length > 0 && <EventCarousel events={events} />}
    </main>
  );
}
