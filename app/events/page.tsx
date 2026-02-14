"use client"

import { useEffect, useState } from "react";
import { Event } from "@/lib/types/event";

export default function Events() {
  const [events, setEvents] = useState<Event[]>([]);

  useEffect(() => {
   fetch("/api/events").then((res) => res.json()).then(setEvents);
  }, []);

  return (
    <div style={{ padding: 40 }}>
      <h1>Upcoming Shows</h1>
      {events.length === 0 && <p>No events yet.</p>}
       {events.map((event) => (
        <div key={event.id} style={{ marginBottom: 20 }}>
          <h2>{event.title}</h2>
          <p>{event.venue}</p>
          <p>{new Date(event.date).toLocaleDateString()}</p>
          <p>${event.price}</p>
          <p>{event.image_url ?? "No image"}</p>
          <button onClick={() => alert("Stripe checkout goes here")}>Buy Ticket</button>
         </div>
      ))}
    </div>
  )
}