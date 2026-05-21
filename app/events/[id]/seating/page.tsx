"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import SeatMap from "@/app/components/seating/SeatMap";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import type { SectionFull } from "@/lib/seating/types";

type SelectedSeat = {
  kind: "seat";
  id: string;
  sectionName: string;
  rowLabel: string;
  seatNumber: number;
  priceCents: number;
  color: string;
};

type SelectedTable = {
  kind: "table";
  objectId: string;
  seatIds: string[];
  tableLabel: string;
  seatCount: number;
  sectionName: string;
  priceCents: number;
  color: string;
};

type SelectedItem = SelectedSeat | SelectedTable;

export default function EventSeatingPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;

  const [event, setEvent] = useState<{ id: string; title: string; venue: string; date: string } | null>(null);
  const [sections, setSections] = useState<SectionFull[]>([]);
  const [roomW, setRoomW] = useState(100);
  const [roomH, setRoomH] = useState(60);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedItem[]>([]);
  const [reserving, setReserving] = useState(false);
  const [reserveError, setReserveError] = useState<string | null>(null);

  const sectionsRef = useRef(sections);
  useEffect(() => { sectionsRef.current = sections; }, [sections]);

  // All seat IDs currently in the selection (for the map)
  const selectedIds = new Set(
    selected.flatMap((item) => (item.kind === "table" ? item.seatIds : [item.id]))
  );

  // ─── load ─────────────────────────────────────────────────────────────────
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

  // ─── realtime seat status ─────────────────────────────────────────────────
  useEffect(() => {
    if (!sections.length) return;
    const supabase = getSupabaseBrowser();
    const channel = supabase
      .channel(`seats-event-${eventId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "seats" },
        (payload: { new: Record<string, unknown> }) => {
          const updated = payload.new as { id: string; status: string; held_until: string | null };
          setSections((prev) =>
            prev.map((sec) => ({
              ...sec,
              seats: sec.seats.map((seat) =>
                seat.id === updated.id
                  ? { ...seat, status: updated.status as "available" | "held" | "sold", held_until: updated.held_until }
                  : seat
              ),
            }))
          );
          // Deselect any individual seat that was grabbed by someone else
          if (updated.status !== "available") {
            setSelected((prev) => prev.filter((item) => {
              if (item.kind === "seat") return item.id !== updated.id;
              // For tables: deselect the whole table if any of its seats went unavailable
              return !item.seatIds.includes(updated.id);
            }));
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sections.length, eventId]);

  // ─── individual seat click ────────────────────────────────────────────────
  const handleSeatClick = useCallback((seatId: string, sectionId: string) => {
    setSelected((prev) => {
      const exists = prev.find((item) => item.kind === "seat" && item.id === seatId);
      if (exists) return prev.filter((item) => !(item.kind === "seat" && item.id === seatId));

      const sec = sectionsRef.current.find((s) => s.id === sectionId);
      if (!sec) return prev;
      const seat = sec.seats.find((s) => s.id === seatId);
      if (!seat) return prev;

      return [...prev, {
        kind: "seat" as const,
        id: seat.id,
        sectionName: sec.name,
        rowLabel: seat.row_label,
        seatNumber: seat.seat_number,
        priceCents: sec.price_cents,
        color: sec.color,
      }];
    });
  }, []);

  // ─── whole-table click ────────────────────────────────────────────────────
  const handleTableClick = useCallback((seatIds: string[], sectionId: string, objectId: string) => {
    setSelected((prev) => {
      const existingIdx = prev.findIndex((item) => item.kind === "table" && item.objectId === objectId);
      if (existingIdx !== -1) {
        // Toggle off
        return prev.filter((_, i) => i !== existingIdx);
      }

      const sec = sectionsRef.current.find((s) => s.id === sectionId);
      if (!sec) return prev;
      const obj = sec.objects.find((o) => o.id === objectId);
      const tableNum = (obj?.metadata as { table_number?: number })?.table_number ?? "?";

      return [...prev, {
        kind: "table" as const,
        objectId,
        seatIds,
        tableLabel: `Table ${tableNum}`,
        seatCount: seatIds.length,
        sectionName: sec.name,
        priceCents: sec.price_cents,
        color: sec.color,
      }];
    });
  }, []);

  const totalCents = selected.reduce((s, item) => s + item.priceCents, 0);
  const allSeatIds = selected.flatMap((item) => (item.kind === "table" ? item.seatIds : [item.id]));

  // Ticketable sections only — stage is shown on the map for orientation but is never purchasable
  const ticketableSections = sections.filter((s) => s.type !== "stage" && s.price_cents > 0);

  // ─── checkout ─────────────────────────────────────────────────────────────
  const handleCheckout = async () => {
    if (allSeatIds.length === 0) return;
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
        body: JSON.stringify({ seat_ids: allSeatIds, session_id: sessionId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to reserve seats");
      }
      router.push(`/checkout?event=${eventId}&seat_ids=${allSeatIds.join(",")}&qty=${selected.length}`);
    } catch (err) {
      setReserveError(err instanceof Error ? err.message : "Failed to reserve seats");
    } finally {
      setReserving(false);
    }
  };

  if (loading) return (
    <main style={{ minHeight: "100vh", background: "#0a0a0f", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p>Loading seating…</p>
    </main>
  );
  if (error) return (
    <main style={{ minHeight: "100vh", background: "#0a0a0f", color: "#f87171", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p>{error}</p>
    </main>
  );

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
            onTableClick={handleTableClick}
          />
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", marginBottom: 16 }}>
          {ticketableSections.map((s) => (
            <span key={s.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: s.color, display: "inline-block" }} />
              {s.name}{s.sells_as_table ? " (full table)" : ""} — ${(s.price_cents / 100).toFixed(2)}
            </span>
          ))}
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#f59e0b", display: "inline-block" }} />
            Held (temporary)
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", display: "inline-block" }} />
            Sold
          </span>
        </div>

        {/* Selected items */}
        {selected.length > 0 && (
          <div style={{ background: "#111118", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", padding: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 0, marginBottom: 12 }}>
              Your Selection ({selected.length} {selected.length === 1 ? "item" : "items"})
            </h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
              {selected.map((item) => {
                const key = item.kind === "table" ? item.objectId : item.id;
                const label = item.kind === "table"
                  ? `${item.tableLabel} (${item.seatCount} seats) — $${(item.priceCents / 100).toFixed(2)}`
                  : `${item.sectionName} · ${item.rowLabel} · #${item.seatNumber} — $${(item.priceCents / 100).toFixed(2)}`;
                return (
                  <span key={key} style={{ padding: "4px 10px", borderRadius: 6, background: `${item.color}20`, border: `1px solid ${item.color}40`, color: "rgba(255,255,255,0.8)", fontSize: 12 }}>
                    {label}
                  </span>
                );
              })}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>Total: ${(totalCents / 100).toFixed(2)}</span>
              <button
                onClick={handleCheckout}
                disabled={reserving}
                style={{ padding: "10px 28px", background: reserving ? "rgba(99,102,241,0.3)" : "#6366f1", border: "none", borderRadius: 8, color: "#fff", fontSize: 14, fontWeight: 700, cursor: reserving ? "wait" : "pointer" }}
              >
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
