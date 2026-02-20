"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Footer from "@/app/components/Footer";

type TicketData = {
  id: string;
  qr_code: string;
  qr_data_url?: string;
  customer_name: string;
  customer_email: string;
  is_scanned: boolean;
  event_id: string;
  created_at: string;
  events?: { title: string; venue: string; date: string };
};

export default function TicketViewPage() {
  const { id } = useParams() as { id: string };
  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/tickets/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); return; }
        setTicket(data);
      })
      .catch(() => setError("Failed to load ticket"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <main className="ticket-page"><div className="ticket-page-loading">Loading ticket…</div></main>;
  if (error || !ticket) return <main className="ticket-page"><div className="ticket-page-loading">{error || "Ticket not found."}</div></main>;

  const event = ticket.events;

  return (
    <>
      <main className="ticket-page">
        <section className="ticket-hero">
          <h1 className="ticket-hero-title">Your Ticket</h1>
        </section>

        <section className="digital-ticket-section">
          <div className="digital-ticket-card">
            {ticket.qr_data_url ? (
              <img src={ticket.qr_data_url} alt="QR Code" className="digital-ticket-qr" />
            ) : (
              <div className="digital-ticket-qr-placeholder">
                <p>QR: {ticket.qr_code}</p>
              </div>
            )}

            <div className="digital-ticket-info">
              <h2 className="digital-ticket-event">{event?.title || "Event"}</h2>
              <p className="digital-ticket-venue">{event?.venue || "Venue"}</p>
              {event?.date && (
                <p className="digital-ticket-date">
                  {((d: string) => (d && d.length === 10 && d[4] === "-") ? new Date(d + "T12:00:00") : new Date(d))(event.date).toLocaleDateString("en-US", {
                    weekday: "long", month: "long", day: "numeric", year: "numeric",
                  })}
                  {" at "}
                  {((d: string) => (d && d.length === 10 && d[4] === "-") ? new Date(d + "T12:00:00") : new Date(d))(event.date).toLocaleTimeString("en-US", {
                    hour: "numeric", minute: "2-digit",
                  })}
                </p>
              )}

              <div className="digital-ticket-holder">
                <span className="digital-ticket-label">Ticket Holder</span>
                <span className="digital-ticket-name">{ticket.customer_name || "Guest"}</span>
                <span className="digital-ticket-email">{ticket.customer_email}</span>
              </div>

              {ticket.is_scanned && (
                <div className="digital-ticket-scanned">✅ Already Scanned</div>
              )}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
