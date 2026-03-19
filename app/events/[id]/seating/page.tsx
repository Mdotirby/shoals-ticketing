"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import SeatMap from "@/app/components/seating/SeatMap";
import type { SectionFull } from "@/lib/seating/types";

type SelectedSeat = {
  id: string;
  sectionName: string;
  rowLabel: string;
  seatNumber: number;
  priceCents: number;
  color: string;
};

export default function EventSeatingPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;

  const [event, setEvent] = useState<{ id: string; title: string; venue: string; date: string; price: number } | null>(null);
  const [sections, setSections] = useState<SectionFull[]>([]);
  const [roomW, setRoomW] = useState(100);
  const [roomH, setRoomH] = useState(60);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedSeat[]>([]);
  const [reserving, setReserving] = useState(false);
  const [reserveError, setReserveError] = useState<string | null>(null);

  const selectedIds = new Set(selected.map((s) => s.id));

  useEffect(() => {
    Promise.all([
      fetch(`/api/events/${eventId}`).then((r) => r.json()),
      fetch(`/api/seating/events/${eventId}`).then((r) => r.json()),
    ]).then(([ev, seating]) => {
      if (ev.id) setEvent(ev);
      if (seating.enabled && seating.layout) {
        setSections(seating.layout.sections || []);
        setRoomW(seating.layout.room_width_ft || 100);
        setRoomH(seating.layout.room_height_ft || 60);
      } else {
        setError("No seating layout available for this event.");
      }
    }).catch(() => setError("Failed to load event."))
    .finally(() => setLoading(false));
  }, [eventId]);

  const handleSeatClick = useCallback((seatId: string, sectionId: string) => {
    setSelected((prev) => {
      const exists = prev.find((s) => s.id === seatId);
      if (exists) return prev.filter((s) => s.id !== seatId);

      const sec = sections.find((s) => s.id === sectionId);
      if (!sec) return prev;
      const seat = sec.seats.find((s) => s.id === seatId);
      if (!seat) return prev;

      return [...prev, {
        id: seat.id,
        sectionName: sec.name,
        rowLabel: seat.row_label,
        seatNumber: seat.seat_number,
        priceCents: sec.price_cents,
        color: sec.color,
      }];
    });
  }, [sections]);

  const totalCents = selected.reduce((s, seat) => s + seat.priceCents, 0);

  const handleCheckout = async () => {
    if (selected.length === 0) return;
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
        body: JSON.stringify({ seat_ids: selected.map((s) => s.id), session_id: sessionId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to reserve seats");
      }
      const seatIds = selected.map((s) => s.id).join(",");
      router.push(`/checkout?event=${eventId}&seat_ids=${seatIds}&qty=${selected.length}`);
    } catch (err) {
      setReserveError(err instanceof Error ? err.message : "Failed to reserve seats");
    } finally {
      setReserving(false);
    }
  };

  if (loading) return <main style={{ minHeight: "100vh", background: "#0a0a0f", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}><p>Loading seating…</p></main>;
  if (error) return <main style={{ minHeight: "100vh", background: "#0a0a0f", color: "#f87171", display: "flex", alignItems: "center", justifyContent: "center" }}><p>{error}</p></main>;

  return (
    <main style={{ minHeight: "100vh", background: "#0a0a0f", color: "#fff", padding: "20px 16px 80px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <a href={`/events/${eventId}`} style={{ color: "#818cf8", fontSize: 14, textDecoration: "none", marginBottom: 16, display: "inline-block" }}>← Back to Event</a>

        {event && (
          <h1 style={{ fontSize: "clamp(18px, 4vw, 26px)", fontWeight: 800, margin: "0 0 16px" }}>{event.title} — Select Your Seats</h1>
        )}

        {/* Seat Map */}
        <div style={{ height: "calc(100vh - 240px)", minHeight: 300, borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)", marginBottom: 16 }}>
          <SeatMap
            sections={sections}
            roomWidthFt={roomW}
            roomHeightFt={roomH}
            interactive={true}
            selectedSeatIds={selectedIds}
            onSeatClick={handleSeatClick}
          />
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 16, justifyContent: "center", marginBottom: 16 }}>
          {sections.map((s) => (
            <span key={s.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, display: "inline-block" }} />
              {s.name} — ${(s.price_cents / 100).toFixed(2)}
            </span>
          ))}
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: "rgba(255,255,255,0.06)", display: "inline-block" }} /> Sold
          </span>
        </div>

        {/* Selected */}
        {selected.length > 0 && (
          <div style={{ background: "#111118", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", padding: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 0, marginBottom: 12 }}>Selected Seats ({selected.length})</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
              {selected.map((s) => (
                <span key={s.id} style={{ padding: "4px 10px", borderRadius: 6, background: `${s.color}20`, border: `1px solid ${s.color}40`, color: "rgba(255,255,255,0.8)", fontSize: 12 }}>
                  {s.sectionName} · {s.rowLabel} · #{s.seatNumber} — ${(s.priceCents / 100).toFixed(2)}
                </span>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>Total: ${(totalCents / 100).toFixed(2)}</span>
              <button onClick={handleCheckout} disabled={reserving} style={{
                padding: "10px 28px", background: reserving ? "rgba(99,102,241,0.3)" : "#6366f1",
                border: "none", borderRadius: 8, color: "#fff", fontSize: 14, fontWeight: 700, cursor: reserving ? "wait" : "pointer",
              }}>
                {reserving ? "Reserving…" : "Proceed to Checkout"}
              </button>
            </div>
            {reserveError && <p style={{ color: "#f87171", fontSize: 13, marginTop: 8 }}>{reserveError}</p>}
          </div>
        )}
      </div>
    </main>
  );
}
