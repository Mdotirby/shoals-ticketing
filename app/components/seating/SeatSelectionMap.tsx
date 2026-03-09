"use client";

import { SelectedSeat } from "./SeatingChartViewer";

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

type Props = {
  chart: ChartData;
  selectedSeats: SelectedSeat[];
  onSeatClick: (seat: SeatData, section: SectionData, row: RowData) => void;
};

const SEAT_SIZE = 22;
const SEAT_GAP = 4;
const ROW_GAP = 4;
const SECTION_GAP = 32;
const ROW_LABEL_WIDTH = 24;

export default function SeatSelectionMap({ chart, selectedSeats, onSeatClick }: Props) {
  const selectedIds = new Set(selectedSeats.map((s) => s.seatId));

  return (
    <div style={{ overflowX: "auto" }}>
      {/* Stage indicator */}
      <div
        style={{
          margin: "0 auto 20px",
          padding: "8px 32px",
          borderRadius: "0 0 40px 40px",
          background: "rgba(208,194,144,0.08)",
          border: "1px solid rgba(208,194,144,0.15)",
          borderTop: "none",
          textAlign: "center",
          color: "rgba(208,194,144,0.5)",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 2,
          textTransform: "uppercase",
          maxWidth: 200,
        }}
      >
        STAGE
      </div>

      {/* Sections */}
      <div style={{ display: "flex", flexDirection: "column", gap: SECTION_GAP, alignItems: "center" }}>
        {chart.sections.map((section) => (
          <div key={section.id}>
            {/* Section header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 3,
                  background: section.color,
                }}
              />
              <span
                style={{
                  color: "rgba(255,255,255,0.6)",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {section.section_name} — ${section.price_tier}
              </span>
            </div>

            {/* Rows */}
            <div style={{ display: "flex", flexDirection: "column", gap: ROW_GAP }}>
              {section.rows.map((row) => (
                <div
                  key={row.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: SEAT_GAP,
                  }}
                >
                  {/* Row label */}
                  <span
                    style={{
                      width: ROW_LABEL_WIDTH,
                      textAlign: "right",
                      color: "rgba(255,255,255,0.3)",
                      fontSize: 10,
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    {row.row_label}
                  </span>

                  {/* Seats */}
                  {row.seats.map((seat) => {
                    const isSelected = selectedIds.has(seat.id);
                    const isSold = seat.status === "sold";
                    const isHeld = seat.status === "held" && !isSelected;
                    const isAvailable = seat.status === "available";

                    let bg = section.color;
                    let opacity = 0.8;
                    let border = "2px solid transparent";
                    let cursor = "pointer";

                    if (isSold) {
                      bg = "rgba(255,255,255,0.08)";
                      opacity = 0.4;
                      cursor = "not-allowed";
                    } else if (isHeld) {
                      bg = "#f59e0b";
                      opacity = 0.6;
                      cursor = "not-allowed";
                    } else if (isSelected) {
                      bg = section.color;
                      opacity = 1;
                      border = "2px solid #fff";
                    }

                    return (
                      <button
                        key={seat.id}
                        onClick={() => {
                          if (isAvailable || isSelected) {
                            onSeatClick(seat, section, row);
                          }
                        }}
                        disabled={isSold || isHeld}
                        title={`${section.section_name} · Row ${row.row_label} · Seat ${seat.seat_number}${isSold ? " (Sold)" : isHeld ? " (Held)" : ""}`}
                        style={{
                          width: SEAT_SIZE,
                          height: SEAT_SIZE,
                          borderRadius: 4,
                          background: bg,
                          opacity,
                          border,
                          cursor,
                          padding: 0,
                          fontSize: 8,
                          color: isSelected ? "#fff" : "rgba(255,255,255,0.5)",
                          fontWeight: 600,
                          transition: "all 0.15s ease",
                          flexShrink: 0,
                        }}
                      >
                        {seat.seat_number}
                      </button>
                    );
                  })}

                  {/* Row label (right side) */}
                  <span
                    style={{
                      width: ROW_LABEL_WIDTH,
                      textAlign: "left",
                      color: "rgba(255,255,255,0.3)",
                      fontSize: 10,
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    {row.row_label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
