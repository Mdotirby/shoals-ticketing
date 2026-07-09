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
  seatAssignments?: SeatAssignment[];
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
  events?: { title: string; venue: string; date: string; image_url?: string };
  siblings: SiblingTicket[];
  seatAssignments?: SeatAssignment[];
  operatorSlug?: string;
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

  const seats = current.seatAssignments ?? ticket.seatAssignments ?? [];
  const formattedDate = event?.date
    ? safeDate(event.date).toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric", year: "numeric",
      })
    : null;

  return (
    <>
      <main className="ticket-page">
        <section className="digital-ticket-section">

          {/* Page heading */}
          <div className="digital-ticket-page-header">
            {event?.title && (
              <h1 className="digital-ticket-page-title">{event.title}</h1>
            )}
            {(formattedDate || event?.venue) && (
              <p className="digital-ticket-page-meta">
                {formattedDate}
                {formattedDate && event?.venue && <span className="digital-ticket-meta-sep"> · </span>}
                {event?.venue}
              </p>
            )}
          </div>

          {/* Carousel */}
          <div
            className="digital-ticket-carousel"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {totalTickets > 1 && currentIndex > 0 && (
              <button
                className="digital-ticket-arrow digital-ticket-arrow-prev"
                onClick={() => setCurrentIndex(currentIndex - 1)}
                aria-label="Previous ticket"
              >
                ‹
              </button>
            )}
            {totalTickets > 1 && currentIndex < totalTickets - 1 && (
              <button
                className="digital-ticket-arrow digital-ticket-arrow-next"
                onClick={() => setCurrentIndex(currentIndex + 1)}
                aria-label="Next ticket"
              >
                ›
              </button>
            )}

            {/* Ticket card — reserved-seat tickets (seats.length > 0) keep the
                existing "glass" card unchanged; only general admission gets
                the new design for now. See plan: table-based seat
                assignments (~17% of real sold seats) don't map cleanly onto
                the new design's Section/Row/Seat layout, so that variant is
                deliberately deferred rather than shipped half-right. */}
            {seats.length > 0 ? (
              <div className="digital-ticket-card">

                {/* QR zone — event image fills the background */}
                <div
                  className="digital-ticket-qr-zone"
                  style={event?.image_url ? {
                    backgroundImage: `url(${event.image_url})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center top",
                  } : undefined}
                >
                  {/* Dark + blur overlay so QR stays scannable */}
                  {event?.image_url && <div className="digital-ticket-qr-overlay" />}

                  {current.is_scanned && (
                    <div className="digital-ticket-scanned-badge">Already Scanned</div>
                  )}
                  {current.qr_data_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={current.qr_data_url} alt="QR Code" className="digital-ticket-qr" />
                  ) : (
                    <div className="digital-ticket-qr-placeholder">
                      <p>{current.qr_code}</p>
                    </div>
                  )}
                  <p className="digital-ticket-show-at-door">Scan at the door for entry</p>
                </div>

                {/* Perforated tear line */}
                <div className="digital-ticket-tear">
                  <span className="digital-ticket-notch digital-ticket-notch-left" />
                  <div className="digital-ticket-tear-line" />
                  <span className="digital-ticket-notch digital-ticket-notch-right" />
                </div>

                {/* Info zone */}
                <div className="digital-ticket-info-zone">

                  {/* Seat assignments */}
                  <div className="digital-ticket-seats">
                    <span className="digital-ticket-seats-label">Assigned Seats</span>
                    <div className="digital-ticket-seats-list">
                      {seats.map((s, i) => (
                        <span key={i} className="digital-ticket-seat-chip">
                          {s.row
                            ? `${s.section} · Row ${s.row} · Seat ${s.seat}`
                            : s.seat}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Holder */}
                  <div className="digital-ticket-holder-row">
                    <div className="digital-ticket-holder-cell">
                      <span className="digital-ticket-cell-label">Ticket Holder</span>
                      <span className="digital-ticket-cell-value">{current.customer_name || "Guest"}</span>
                      <span className="digital-ticket-cell-sub">{current.customer_email}</span>
                    </div>
                    <div className="digital-ticket-holder-cell digital-ticket-holder-cell-right">
                      <span className="digital-ticket-cell-label">Ticket #</span>
                      <span className="digital-ticket-cell-value" style={{ fontSize: 13 }}>{current.qr_code?.slice(0, 8).toUpperCase()}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="ga-ticket-card">

                {/* Header bar */}
                <div className="ga-ticket-header">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/West72_Logos/W72_tech_icon_black.png" alt="" className="ga-ticket-header-icon" />
                  <span className="ga-ticket-header-text">
                    <strong>WEST 72</strong>&nbsp;ENTERTAINMENT
                  </span>
                </div>

                {/* QR zone — blurred event image behind an opaque QR card */}
                <div className="ga-ticket-qr-zone">
                  {event?.image_url && (
                    <div
                      className="ga-ticket-qr-bg"
                      style={{ backgroundImage: `url(${event.image_url})` }}
                    />
                  )}

                  {current.qr_data_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={current.qr_data_url} alt="QR Code" className="ga-ticket-qr" />
                  ) : (
                    <div className="digital-ticket-qr-placeholder">
                      <p>{current.qr_code}</p>
                    </div>
                  )}
                  <p className="ga-ticket-show-at-door">Scan at the door for entry</p>
                </div>

                {/* Info panel */}
                <div className="ga-ticket-info-zone">
                  <p className="ga-ticket-type-heading">General Admission</p>
                  <p className="ga-ticket-type-subheading">Ticket for Admission</p>
                  <div className="ga-ticket-divider" />

                  <div className="ga-ticket-holder-row">
                    <div className="ga-ticket-holder-cell">
                      <span className="ga-ticket-cell-label">Ticket Holder</span>
                      <span className="ga-ticket-cell-value">{current.customer_name || "Guest"}</span>
                      <span className="ga-ticket-cell-sub">{current.customer_email}</span>
                    </div>
                    <div className="ga-ticket-holder-cell ga-ticket-holder-cell-right">
                      <span className="ga-ticket-cell-label">Ticket ID</span>
                      <span className="ga-ticket-cell-value" style={{ fontSize: 13 }}>{current.qr_code?.slice(0, 8).toUpperCase()}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Ticket X of Y — below the card */}
            <p className="digital-ticket-eyebrow digital-ticket-eyebrow-below">
              {totalTickets > 1 ? `Ticket ${currentIndex + 1} of ${totalTickets}` : "Your Ticket"}
            </p>
          </div>

          {/* Dot pagination */}
          {totalTickets > 1 && (
            <div className="digital-ticket-dots">
              {siblings.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentIndex(i)}
                  className={`digital-ticket-dot${i === currentIndex ? " digital-ticket-dot-active" : ""}`}
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
