"use client"

type Event = {
  id: string
  title: string
  venue: string
  date: string
  price: number
}

import { useEffect, useState } from "react"

export default function Events() {
  const [events, setEvents] = useState<Event[]>([])


  useEffect(() => {
    fetch("/api/events")
      .then(res => res.json())
      .then(setEvents)
  }, [])

  return (
    <div style={{ padding: 40 }}>
      <h1>Upcoming Shows</h1>
      {events.length === 0 && <p>No events yet.</p>}
      {events.map(e => (
        <div key={e.id} style={{ marginBottom: 20 }}>
          <h2>{e.title}</h2>
          <p>{e.venue}</p>
          <p>{new Date(e.date).toLocaleDateString()}</p>
          <p>${e.price}</p>
          <button onClick={() => alert("Stripe checkout goes here")}>
            Buy Ticket
          </button>
        </div>
      ))}
    </div>
  )
}
