"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import SeatingChartViewer, { SelectedSeat } from "@/app/components/seating/SeatingChartViewer";
import { formatEventDateFull, formatEventTime } from "@/lib/dates";

type EventData = {
  id: string;
  title: string;
  venue: string;
  date: string;
  price: number;
};

export default function SeatsPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;

  const [event, setEvent] = useState<EventData | null>(null);
  const [selectedSeats, setSelectedSeats] = useState<SelectedSeat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reserving, setReserving] = useState(false);
  const [reserveError, setReserveError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/events/${eventId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Event not found");
        return res.json();
      })
      .then((data: EventData) => setEvent(data))
      .catch(() => setError("Could not load this event."))
      .finally(() => setIsLoading(false));
  }, [eventId]);

  const totalPrice = selectedSeats.reduce((sum, s) => sum + s.price, 0);

  const handleProceedToCheckout = async () => {
    if (selectedSeats.length === 0) return;
    setReserving(true);
    setReserveError(null);

    try {
      let sessionId = sessionStorage.getItem("vc_session");
      if (!sessionId) {
        sessionId = Math.random().toString(36).slice(2) + Date.now().toString(36);
        sessionStorage.setItem("vc_session", sessionId);
      }

      const res = await fetch(`/api/seating/events/${eventId}/reserve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seat_ids: selectedSeats.map((s) => s.seatId),
          session_id: sessionId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to reserve seats");
      }

      // Redirect to checkout with seat_ids
      const seatIds = selectedSeats.map((s) => s.seatId).join(",");
      router.push(`/checkout?event=${eventId}&seat_ids=${seatIds}&qty=${selectedSeats.length}`);
    } catch (err) {
      setReserveError(err instanceof Error ? err.message : "Failed to reserve seats");
    } finally {
      setReserving(false);
    }
  };

  if (isLoading) {
    return (
      <main style={{ minHeight: "100vh", background: "#0a0a0f", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 18, color: "#a1a1aa" }}>Loading seating chart...</div>
      </main>
    );
  }

  if (error || !event) {
    return (
      <main style={{ minHeight: "100vh", background: "#0a0a0f", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 18, color: "#f87171" }}>{error || "Event not found."}</div>
      </main>
    );
  }

  const showTime = formatEventTime(event.date);

  return (
    <main style={{ minHeight: "100vh", background: "#0a0a0f", color: "#fff", padding: "24px 16px 80px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* Back link */}
        <a
          href={`/events/${eventId}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: "#818cf8",
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 500,
            marginBottom: 20,
          }}
        >
          ← Back to Event
        </a>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: "clamp(20px, 5vw, 28px)", fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>
            {event.title}
          </h1>
          <p style={{ fontSize: 15, color: "#a1a1aa", marginTop: 6 }}>
            {formatEventDateFull(event.date)}
            {showTime && <> · {showTime}</>}
            {" · "}
            {event.venue}
          </p>
        </div>

        {/* Seating Chart — full width */}
        <div style={{
          background: "#111118",
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.06)",
          padding: "clamp(8px, 3vw, 24px)",
          marginBottom: 24,
        }}>
          <SeatingChartViewer
            eventId={eventId}
            onSelectionChange={(seats) => setSelectedSeats(seats)}
          />
        </div>

        {/* Selected Seats Summary */}
        <div style={{
          background: "#111118",
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.06)",
          padding: "clamp(12px, 3vw, 24px)",
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 0, marginBottom: 16 }}>
            Selected Seats
          </h2>

          {selectedSeats.length === 0 ? (
            <p style={{ color: "#71717a", fontSize: 14, margin: 0 }}>
              Click on available seats in the chart above to select them.
            </p>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                {(() => {
                  // Group table seats for "Full Table" display
                  const tableGroups = new Map<string, typeof selectedSeats>();
                  const individualSeats: typeof selectedSeats = [];
                  for (const s of selectedSeats) {
                    if (s.rowLabel.startsWith("T")) {
                      const key = `${s.sectionName}-${s.rowLabel}`;
                      if (!tableGroups.has(key)) tableGroups.set(key, []);
                      tableGroups.get(key)!.push(s);
                    } else {
                      individualSeats.push(s);
                    }
                  }

                  const items: React.ReactNode[] = [];

                  // Render table groups
                  tableGroups.forEach((seats, key) => {
                    const totalForTable = seats[0].totalTableSeats || 0;
                    const isFullTable = seats.length === totalForTable && totalForTable > 0;
                    if (isFullTable) {
                      const tableTotal = seats.reduce((sum, s) => sum + s.price, 0);
                      items.push(
                        <div
                          key={key}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            flexWrap: "wrap",
                            gap: 4,
                            padding: "10px 14px",
                            background: "rgba(255,255,255,0.03)",
                            borderRadius: 10,
                            border: "1px solid rgba(255,255,255,0.06)",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                            <span
                              style={{
                                width: 12,
                                height: 12,
                                borderRadius: "50%",
                                background: seats[0].color || "#818cf8",
                                display: "inline-block",
                                flexShrink: 0,
                              }}
                            />
                            <span style={{ fontSize: 14, fontWeight: 600 }}>
                              {seats[0].sectionName} — Table {seats[0].rowLabel} (Full Table, {seats.length} seats)
                            </span>
                          </div>
                          <span style={{ fontSize: 14, fontWeight: 600, color: "#818cf8" }}>
                            ${tableTotal.toFixed(2)}
                          </span>
                        </div>
                      );
                    } else {
                      // Partial table — show individual seats
                      seats.forEach((seat) => {
                        items.push(
                          <div
                            key={seat.seatId}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              flexWrap: "wrap",
                              gap: 4,
                              padding: "10px 14px",
                              background: "rgba(255,255,255,0.03)",
                              borderRadius: 10,
                              border: "1px solid rgba(255,255,255,0.06)",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                              <span
                                style={{
                                  width: 12,
                                  height: 12,
                                  borderRadius: "50%",
                                  background: seat.color || "#818cf8",
                                  display: "inline-block",
                                  flexShrink: 0,
                                }}
                              />
                              <span style={{ fontSize: 14, fontWeight: 600 }}>
                                {seat.sectionName} — {seat.rowLabel}, Seat {seat.seatNumber}
                              </span>
                            </div>
                            <span style={{ fontSize: 14, fontWeight: 600, color: "#818cf8" }}>
                              ${seat.price.toFixed(2)}
                            </span>
                          </div>
                        );
                      });
                    }
                  });

                  // Render individual (non-table) seats
                  individualSeats.forEach((seat) => {
                    items.push(
                      <div
                        key={seat.seatId}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          flexWrap: "wrap",
                          gap: 4,
                          padding: "10px 14px",
                          background: "rgba(255,255,255,0.03)",
                          borderRadius: 10,
                          border: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                          <span
                            style={{
                              width: 12,
                              height: 12,
                              borderRadius: "50%",
                              background: seat.color || "#818cf8",
                              display: "inline-block",
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ fontSize: 14, fontWeight: 600 }}>
                            {seat.sectionName} — Row {seat.rowLabel}, Seat {seat.seatNumber}
                          </span>
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "#818cf8" }}>
                          ${seat.price.toFixed(2)}
                        </span>
                      </div>
                    );
                  });

                  return items;
                })()}
              </div>

              {/* Total */}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "14px 0",
                borderTop: "1px solid rgba(255,255,255,0.08)",
                marginBottom: 20,
              }}>
                <span style={{ fontSize: 16, fontWeight: 700 }}>
                  Total ({selectedSeats.length} {selectedSeats.length === 1 ? "seat" : "seats"})
                </span>
                <span style={{ fontSize: 20, fontWeight: 800, color: "#818cf8" }}>
                  ${totalPrice.toFixed(2)}
                </span>
              </div>

              {/* Reserve error */}
              {reserveError && (
                <p style={{ color: "#f87171", fontSize: 13, marginBottom: 12, textAlign: "center" }}>
                  {reserveError}
                </p>
              )}

              {/* Proceed to Checkout button */}
              <button
                onClick={handleProceedToCheckout}
                disabled={reserving}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "14px 24px",
                  background: reserving
                    ? "#4b5563"
                    : "linear-gradient(135deg, #818cf8 0%, #6366f1 50%, #7c3aed 100%)",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 16,
                  borderRadius: 12,
                  border: "none",
                  cursor: reserving ? "not-allowed" : "pointer",
                  letterSpacing: "0.02em",
                  boxShadow: reserving ? "none" : "0 4px 14px rgba(99,102,241,0.4)",
                  transition: "transform 0.15s, box-shadow 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (!reserving) {
                    e.currentTarget.style.transform = "translateY(-1px)";
                    e.currentTarget.style.boxShadow = "0 6px 20px rgba(99,102,241,0.5)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = reserving ? "none" : "0 4px 14px rgba(99,102,241,0.4)";
                }}
              >
                {reserving ? "Reserving Seats..." : "Proceed to Checkout"}
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
