"use client";

import { useEffect, useState, useRef, TouchEvent } from "react";
import { useParams } from "next/navigation";
import Footer from "@/app/components/Footer";

type SiblingTicket = {
  id: string;
  qr_code: string;
  qr_data_url?: string;
  customer_name: string;
  customer_email: string;
  is_scanned: boolean;
};

type SeatAssignment = {
  section: string;
  row: string;
  seat: string;
};

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
  siblings: SiblingTicket[];
  seatAssignments?: SeatAssignment[];
};

function safeDate(d: string) {
  return d && d.length === 10 && d[4] === "-"
    ? new Date(d + "T12:00:00")
    : new Date(d.replace(/[+-]\d{2}:\d{2}$/, "").replace(/Z$/, ""));
}

export default function TicketViewPage() {
  const { id } = useParams() as { id: string };
  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const touchStart = useRef(0);
  const touchEnd = useRef(0);

  useEffect(() => {
    fetch(`/api/tickets/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); return; }
        setTicket(data);
        // Set initial index to the current ticket
        const idx = (data.siblings || []).findIndex((s: SiblingTicket) => s.qr_code === id);
        if (idx >= 0) setCurrentIndex(idx);
      })
      .catch(() => setError("Failed to load ticket"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <main className="ticket-page"><div className="ticket-page-loading">Loading ticket…</div></main>;
  if (error || !ticket) return <main className="ticket-page"><div className="ticket-page-loading">{error || "Ticket not found."}</div></main>;

  const event = ticket.events;
  const siblings = ticket.siblings || [ticket];
  const totalTickets = siblings.length;
  const current = siblings[currentIndex] || siblings[0];

  const handleTouchStart = (e: TouchEvent) => { touchStart.current = e.targetTouches[0].clientX; };
  const handleTouchMove = (e: TouchEvent) => { touchEnd.current = e.targetTouches[0].clientX; };
  const handleTouchEnd = () => {
    const diff = touchStart.current - touchEnd.current;
    if (Math.abs(diff) > 50) {
      if (diff > 0 && currentIndex < totalTickets - 1) setCurrentIndex(currentIndex + 1);
      if (diff < 0 && currentIndex > 0) setCurrentIndex(currentIndex - 1);
    }
  };

  const goTo = (idx: number) => setCurrentIndex(idx);

  return (
    <>
      <main className="ticket-page">
        <section className="ticket-hero">
          <h1 className="ticket-hero-title">
            {totalTickets > 1 ? "Your Tickets" : "Your Ticket"}
          </h1>
        </section>

        <section className="digital-ticket-section">
          {/* Ticket counter */}
          {totalTickets > 1 && (
            <div style={{
              textAlign: "center", marginBottom: 12,
              color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: 600,
              letterSpacing: 1,
            }}>
              TICKET {currentIndex + 1} OF {totalTickets}
            </div>
          )}

          {/* Carousel container */}
          <div
            style={{ overflow: "hidden", position: "relative" }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {/* Arrow buttons for desktop */}
            {totalTickets > 1 && currentIndex > 0 && (
              <button
                onClick={() => setCurrentIndex(currentIndex - 1)}
                style={{
                  position: "absolute", left: 4, top: "50%", transform: "translateY(-50%)",
                  zIndex: 10, background: "rgba(208,194,144,0.15)", border: "1px solid rgba(208,194,144,0.3)",
                  borderRadius: "50%", width: 36, height: 36, color: "#d0c290",
                  fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                }}
                aria-label="Previous ticket"
              >
                ‹
              </button>
            )}
            {totalTickets > 1 && currentIndex < totalTickets - 1 && (
              <button
                onClick={() => setCurrentIndex(currentIndex + 1)}
                style={{
                  position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)",
                  zIndex: 10, background: "rgba(208,194,144,0.15)", border: "1px solid rgba(208,194,144,0.3)",
                  borderRadius: "50%", width: 36, height: 36, color: "#d0c290",
                  fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                }}
                aria-label="Next ticket"
              >
                ›
              </button>
            )}

            <div className="digital-ticket-card">
              {current.qr_data_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={current.qr_data_url} alt="QR Code" className="digital-ticket-qr" />
              ) : (
                <div className="digital-ticket-qr-placeholder">
                  <p>QR: {current.qr_code}</p>
                </div>
              )}

              <div className="digital-ticket-info">
                <h2 className="digital-ticket-event">{event?.title || "Event"}</h2>
                <p className="digital-ticket-venue">{event?.venue || "Venue"}</p>
                {event?.date && (
                  <p className="digital-ticket-date">
                    {safeDate(event.date).toLocaleDateString("en-US", {
                      weekday: "long", month: "long", day: "numeric", year: "numeric",
                    })}
                  </p>
                )}

                {/* Seat assignments */}
                {ticket.seatAssignments && ticket.seatAssignments.length > 0 && (
                  <div style={{
                    margin: "16px 0", padding: "12px 16px", borderRadius: 10,
                    background: "rgba(99,102,241,0.08)",
                    border: "1px solid rgba(99,102,241,0.2)",
                    textAlign: "center",
                  }}>
                    <span style={{
                      display: "block", fontSize: 10, fontWeight: 700,
                      color: "#818cf8", textTransform: "uppercase",
                      letterSpacing: 1, marginBottom: 8,
                    }}>
                      Your Assigned Seats
                    </span>
                    {ticket.seatAssignments.map((s, i) => (
                      <div key={i} style={{
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        color: "rgba(255,255,255,0.8)", fontSize: 14,
                        marginBottom: 4,
                      }}>
                        {s.row ? (
                          <>
                            <span style={{ color: "#d0c290", fontWeight: 700 }}>{s.section}</span>
                            <span style={{ color: "rgba(255,255,255,0.3)" }}>&middot;</span>
                            <span>Row {s.row}</span>
                            <span style={{ color: "rgba(255,255,255,0.3)" }}>&middot;</span>
                            <span>Seat {s.seat}</span>
                          </>
                        ) : (
                          <span style={{ color: "#d0c290", fontWeight: 700 }}>{s.seat}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="digital-ticket-holder">
                  <span className="digital-ticket-label">Ticket Holder</span>
                  <span className="digital-ticket-name">{current.customer_name || "Guest"}</span>
                  <span className="digital-ticket-email">{current.customer_email}</span>
                </div>

                {current.is_scanned && (
                  <div className="digital-ticket-scanned">Already Scanned</div>
                )}

                {/* QR Entry Notice */}
                <div style={{
                  marginTop: 16,
                  padding: "12px 16px",
                  background: "rgba(208,194,144,0.06)",
                  border: "1px solid rgba(208,194,144,0.12)",
                  borderRadius: 8,
                  textAlign: "center",
                  width: "100%",
                  boxSizing: "border-box",
                }}>
                  <p style={{ color: "#d0c290", fontWeight: 700, fontSize: 13, margin: "0 0 4px" }}>
                    Show This at the Door
                  </p>
                  <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, margin: 0, lineHeight: 1.5 }}>
                    Present your QR code for entry. Screenshot it, save to your photos, or print a copy.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Dot indicators */}
          {totalTickets > 1 && (
            <div style={{
              display: "flex", justifyContent: "center", gap: 8, marginTop: 16,
            }}>
              {siblings.map((_, i) => (
                <button
                  key={i}
                  onClick={() => goTo(i)}
                  style={{
                    width: i === currentIndex ? 24 : 8,
                    height: 8,
                    borderRadius: 4,
                    background: i === currentIndex ? "#d0c290" : "rgba(255,255,255,0.2)",
                    border: "none",
                    cursor: "pointer",
                    transition: "all 200ms ease",
                    padding: 0,
                  }}
                  aria-label={`Go to ticket ${i + 1}`}
                />
              ))}
            </div>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
