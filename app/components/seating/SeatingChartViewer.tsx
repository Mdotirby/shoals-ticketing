"use client";

import { useEffect, useState, useCallback } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import SeatSelectionMap from "./SeatSelectionMap";
import LayoutSeatPicker from "./LayoutSeatPicker";

type SeatData = {
  id: string;
  seat_number: string;
  x_position: number;
  y_position: number;
  status: "available" | "held" | "sold";
};

type RowData = {
  id: string;
  row_label: string;
  seats: SeatData[];
};

type SectionData = {
  id: string;
  section_name: string;
  color: string;
  price_tier: number;
  rows: RowData[];
};

type ChartData = {
  id: string;
  name: string;
  sections: SectionData[];
};

type LayoutData = {
  id: string;
  name: string;
  background_image_url: string | null;
  room_width_ft: number;
  room_height_ft: number;
  scale_pixels_per_foot: number;
};

type LayoutObjectData = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  diameter_inches: number;
  rotation: number;
  label: string;
  capacity: number;
  seat_count: number;
  price_tier: string;
  color: string;
};

type Props = {
  eventId: string;
  onSelectionChange: (selectedSeats: SelectedSeat[]) => void;
};

export type SelectedSeat = {
  seatId: string;
  sectionName: string;
  rowLabel: string;
  seatNumber: string;
  price: number;
  color: string;
  totalTableSeats?: number;
};

export default function SeatingChartViewer({ eventId, onSelectionChange }: Props) {
  const [chart, setChart] = useState<ChartData | null>(null);
  const [layout, setLayout] = useState<LayoutData | null>(null);
  const [layoutObjects, setLayoutObjects] = useState<LayoutObjectData[]>([]);
  const [chartType, setChartType] = useState<"classic" | "layout">("classic");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSeats, setSelectedSeats] = useState<SelectedSeat[]>([]);

  // Fetch seating data
  useEffect(() => {
    fetch(`/api/seating/events/${eventId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.chart) {
          setChart(data.chart);
          // Detect layout-based chart
          if (data.type === "layout" && data.layout && data.layout_objects) {
            setChartType("layout");
            setLayout(data.layout);
            setLayoutObjects(data.layout_objects);
          } else {
            setChartType("classic");
          }
        } else {
          setError("No seating chart available for this event.");
        }
      })
      .catch(() => setError("Failed to load seating chart"))
      .finally(() => setLoading(false));
  }, [eventId]);

  // Supabase realtime for live seat status updates
  useEffect(() => {
    if (!chart) return;

    const supabase = getSupabaseBrowser();
    const allRowIds = new Set<string>();
    chart.sections.forEach((sec) =>
      sec.rows.forEach((row) => allRowIds.add(row.id))
    );

    const channel = supabase
      .channel(`seats-${eventId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "seating_seats" },
        (payload: { new: Record<string, unknown> }) => {
          const updated = payload.new as { id: string; row_id: string; status: string };
          if (!allRowIds.has(updated.row_id)) return;

          setChart((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              sections: prev.sections.map((sec) => ({
                ...sec,
                rows: sec.rows.map((row) => ({
                  ...row,
                  seats: row.seats.map((seat) =>
                    seat.id === updated.id
                      ? { ...seat, status: updated.status as SeatData["status"] }
                      : seat
                  ),
                })),
              })),
            };
          });

          if (updated.status !== "available" && updated.status !== "held") {
            setSelectedSeats((prev) => {
              const filtered = prev.filter((s) => s.seatId !== updated.id);
              if (filtered.length !== prev.length) onSelectionChange(filtered);
              return filtered;
            });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [chart, eventId, onSelectionChange]);

  const handleSeatClick = useCallback(
    (seat: SeatData, section: SectionData, row: RowData) => {
      if (seat.status === "sold") return;

      setSelectedSeats((prev) => {
        const exists = prev.find((s) => s.seatId === seat.id);
        let next: SelectedSeat[];

        if (exists) {
          next = prev.filter((s) => s.seatId !== seat.id);
        } else {
          next = [
            ...prev,
            {
              seatId: seat.id,
              sectionName: section.section_name,
              rowLabel: row.row_label,
              seatNumber: seat.seat_number,
              price: section.price_tier,
              color: section.color,
              ...(row.row_label.startsWith("T") ? { totalTableSeats: row.seats.length } : {}),
            },
          ];
        }

        onSelectionChange(next);
        return next;
      });
    },
    [onSelectionChange]
  );

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "rgba(255,255,255,0.5)" }}>
        Loading seating chart...
      </div>
    );
  }

  if (error || !chart) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "rgba(255,107,107,0.8)" }}>
        {error || "No seating chart found."}
      </div>
    );
  }

  return (
    <div>
      {/* Render layout-based or classic seat picker */}
      {chartType === "layout" && layout && layoutObjects.length > 0 ? (
        <LayoutSeatPicker
          layout={layout}
          layoutObjects={layoutObjects}
          sections={chart.sections}
          selectedSeats={selectedSeats}
          onSeatClick={handleSeatClick}
        />
      ) : (
        <SeatSelectionMap
          chart={chart}
          selectedSeats={selectedSeats}
          onSeatClick={handleSeatClick}
        />
      )}

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginTop: 12, justifyContent: "center" }}>
        <LegendItem color="#6366f1" label="Available" />
        <LegendItem color="#818cf8" label="Selected" outline />
        <LegendItem color="#f59e0b" label="Held" />
        <LegendItem color="rgba(255,255,255,0.15)" label="Sold" />
      </div>

      {/* Selection summary */}
      {selectedSeats.length > 0 && (() => {
        const tableGroups = new Map<string, SelectedSeat[]>();
        const individualSeats: SelectedSeat[] = [];
        for (const s of selectedSeats) {
          if (s.rowLabel.startsWith("T")) {
            const key = `${s.sectionName}-${s.rowLabel}`;
            if (!tableGroups.has(key)) tableGroups.set(key, []);
            tableGroups.get(key)!.push(s);
          } else {
            individualSeats.push(s);
          }
        }

        const tableSeatCounts = new Map<string, number>();
        for (const sec of chart.sections) {
          for (const row of sec.rows) {
            if (row.row_label.startsWith("T")) {
              tableSeatCounts.set(`${sec.section_name}-${row.row_label}`, row.seats.length);
            }
          }
        }

        return (
          <div style={{
            marginTop: 16, padding: "12px 16px", borderRadius: 10,
            background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)",
          }}>
            <div style={{ color: "#818cf8", fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
              Selected Seats ({selectedSeats.length})
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {Array.from(tableGroups.entries()).map(([key, seats]) => {
                const totalForTable = tableSeatCounts.get(key) || 0;
                const isFullTable = seats.length === totalForTable && totalForTable > 0;
                const tableTotal = seats.reduce((sum, s) => sum + s.price, 0);
                if (isFullTable) {
                  return (
                    <span key={key} style={{
                      padding: "4px 10px", borderRadius: 6,
                      background: seats[0].color + "20", border: `1px solid ${seats[0].color}40`,
                      color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: 600,
                    }}>
                      {seats[0].sectionName} · {seats[0].rowLabel} (Full Table) — ${tableTotal.toFixed(2)}
                    </span>
                  );
                }
                return seats.map((s) => (
                  <span key={s.seatId} style={{
                    padding: "4px 10px", borderRadius: 6,
                    background: s.color + "20", border: `1px solid ${s.color}40`,
                    color: "rgba(255,255,255,0.8)", fontSize: 12,
                  }}>
                    {s.sectionName} · {s.rowLabel} · Seat {s.seatNumber} — ${s.price}
                  </span>
                ));
              })}
              {individualSeats.map((s) => (
                <span key={s.seatId} style={{
                  padding: "4px 10px", borderRadius: 6,
                  background: s.color + "20", border: `1px solid ${s.color}40`,
                  color: "rgba(255,255,255,0.8)", fontSize: 12,
                }}>
                  {s.sectionName} · Row {s.rowLabel} · Seat {s.seatNumber} — ${s.price}
                </span>
              ))}
            </div>
            <div style={{ marginTop: 8, color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
              Total: ${selectedSeats.reduce((sum, s) => sum + s.price, 0).toFixed(2)}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function LegendItem({ color, label, outline }: { color: string; label: string; outline?: boolean }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
      <div style={{
        width: 12, height: 12, borderRadius: 3,
        background: outline ? "transparent" : color,
        border: outline ? `2px solid ${color}` : "none",
      }} />
      {label}
    </span>
  );
}
