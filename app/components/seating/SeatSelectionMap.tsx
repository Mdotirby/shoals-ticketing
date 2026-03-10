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
const AISLE_GAP = 40;
const ROW_LABEL_WIDTH = 24;

function isTableSection(section: SectionData): boolean {
  return section.rows.length > 0 && section.rows[0].row_label.startsWith("T");
}

function SectionHeader({ section }: { section: SectionData }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
      <div style={{ width: 10, height: 10, borderRadius: 3, background: section.color }} />
      <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 600 }}>
        {section.section_name} — ${section.price_tier}
      </span>
    </div>
  );
}

function SeatButton({
  seat, section, row, isSelected, onSeatClick,
}: {
  seat: SeatData; section: SectionData; row: RowData;
  isSelected: boolean; onSeatClick: Props["onSeatClick"];
}) {
  const isSold = seat.status === "sold";
  const isHeld = seat.status === "held" && !isSelected;
  const isAvailable = seat.status === "available";

  let bg = section.color;
  let opacity = 0.8;
  let border = "2px solid transparent";
  let cursor = "pointer";

  if (isSold) { bg = "rgba(255,255,255,0.08)"; opacity = 0.4; cursor = "not-allowed"; }
  else if (isHeld) { bg = "#f59e0b"; opacity = 0.6; cursor = "not-allowed"; }
  else if (isSelected) { bg = section.color; opacity = 1; border = "2px solid #fff"; }

  return (
    <button
      onClick={() => { if (isAvailable || isSelected) onSeatClick(seat, section, row); }}
      disabled={isSold || isHeld}
      title={`${section.section_name} · ${isTableSection(section) ? "" : "Row "}${row.row_label} · Seat ${seat.seat_number}${isSold ? " (Sold)" : isHeld ? " (Held)" : ""}`}
      style={{
        width: SEAT_SIZE, height: SEAT_SIZE, borderRadius: isTableSection(section) ? "50%" : 4,
        background: bg, opacity, border, cursor,
        padding: 0, fontSize: 8,
        color: isSelected ? "#fff" : "rgba(255,255,255,0.5)",
        fontWeight: 600, transition: "all 0.15s ease", flexShrink: 0,
      }}
    >
      {seat.seat_number}
    </button>
  );
}

export default function SeatSelectionMap({ chart, selectedSeats, onSeatClick }: Props) {
  const selectedIds = new Set(selectedSeats.map((s) => s.seatId));

  // Group sections: consecutive row-type sections go side-by-side; table sections standalone
  type SectionGroup = { type: "row-group" | "table"; sections: SectionData[] };
  const groups: SectionGroup[] = [];

  for (const section of chart.sections) {
    if (isTableSection(section)) {
      groups.push({ type: "table", sections: [section] });
    } else {
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.type === "row-group") {
        lastGroup.sections.push(section);
      } else {
        groups.push({ type: "row-group", sections: [section] });
      }
    }
  }

  return (
    <div style={{ overflowX: "auto" }}>
      {/* Stage indicator */}
      <div
        style={{
          margin: "0 auto 20px", padding: "8px 32px",
          borderRadius: "0 0 40px 40px",
          background: "rgba(208,194,144,0.08)",
          border: "1px solid rgba(208,194,144,0.15)", borderTop: "none",
          textAlign: "center", color: "rgba(208,194,144,0.5)",
          fontSize: 11, fontWeight: 700, letterSpacing: 2,
          textTransform: "uppercase", maxWidth: 200,
        }}
      >
        STAGE
      </div>

      {/* Render grouped sections */}
      <div style={{ display: "flex", flexDirection: "column", gap: SECTION_GAP, alignItems: "center" }}>
        {groups.map((group, gIdx) => {
          if (group.type === "table") {
            const section = group.sections[0];
            const TABLE_RADIUS = 28;
            const CHAIR_ORBIT = 48;
            const CHAIR_SIZE = 24;
            const containerSize = (CHAIR_ORBIT + CHAIR_SIZE) * 2 + 8;

            return (
              <div key={`g-${gIdx}`}>
                <SectionHeader section={section} />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 20, justifyContent: "center" }}>
                  {section.rows.map((table) => {
                    const allAvailableForTable = table.seats.every(
                      (s) => s.status === "available" || selectedIds.has(s.id)
                    );
                    const allSelected = table.seats.every((s) => selectedIds.has(s.id));

                    return (
                    <div key={table.id} style={{ position: "relative", width: containerSize, height: containerSize }}>
                      {/* Round table center — click to buy/deselect full table */}
                      <div
                        onClick={() => {
                          if (!allAvailableForTable) return;
                          if (allSelected) {
                            table.seats.forEach((seat) => {
                              if (selectedIds.has(seat.id)) onSeatClick(seat, section, table);
                            });
                          } else {
                            table.seats.forEach((seat) => {
                              if (!selectedIds.has(seat.id) && seat.status === "available") {
                                onSeatClick(seat, section, table);
                              }
                            });
                          }
                        }}
                        style={{
                          position: "absolute", left: "50%", top: "50%",
                          transform: "translate(-50%, -50%)",
                          width: TABLE_RADIUS * 2, height: TABLE_RADIUS * 2,
                          borderRadius: "50%",
                          background: section.color + "18",
                          border: `1.5px solid ${section.color}40`,
                          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                          cursor: allAvailableForTable ? "pointer" : "not-allowed",
                          transition: "background 0.15s ease",
                        }}
                        title={allAvailableForTable ? (allSelected ? "Deselect full table" : "Buy full table") : "Some seats are unavailable"}
                      >
                        <span style={{ color: section.color, fontSize: 11, fontWeight: 700 }}>
                          {table.row_label}
                        </span>
                        {allAvailableForTable && (
                          <span style={{ color: section.color, fontSize: 7, marginTop: 2, opacity: 0.8 }}>
                            {allSelected ? "Deselect" : "Buy Table"}
                          </span>
                        )}
                      </div>
                      {/* Orbiting chairs */}
                      {table.seats.map((seat, seatIdx) => {
                        const angle = (2 * Math.PI * seatIdx) / table.seats.length - Math.PI / 2;
                        const cx = containerSize / 2 + CHAIR_ORBIT * Math.cos(angle) - CHAIR_SIZE / 2;
                        const cy = containerSize / 2 + CHAIR_ORBIT * Math.sin(angle) - CHAIR_SIZE / 2;
                        const isSelected = selectedIds.has(seat.id);
                        const isSold = seat.status === "sold";
                        const isHeld = seat.status === "held" && !isSelected;
                        const isAvailable = seat.status === "available";

                        let bg = section.color;
                        let opacity = 0.8;
                        let border = "2px solid transparent";
                        let cursor = "pointer";
                        if (isSold) { bg = "rgba(255,255,255,0.08)"; opacity = 0.4; cursor = "not-allowed"; }
                        else if (isHeld) { bg = "#f59e0b"; opacity = 0.6; cursor = "not-allowed"; }
                        else if (isSelected) { bg = section.color; opacity = 1; border = "2px solid #fff"; }

                        return (
                          <button
                            key={seat.id}
                            onClick={() => { if (isAvailable || isSelected) onSeatClick(seat, section, table); }}
                            disabled={isSold || isHeld}
                            title={`${section.section_name} · ${table.row_label} · Seat ${seat.seat_number}`}
                            style={{
                              position: "absolute", left: cx, top: cy,
                              width: CHAIR_SIZE, height: CHAIR_SIZE, borderRadius: "50%",
                              background: bg, opacity, border, cursor,
                              padding: 0, fontSize: 8,
                              color: isSelected ? "#fff" : "rgba(255,255,255,0.5)",
                              fontWeight: 600, transition: "all 0.15s ease",
                            }}
                          >
                            {seat.seat_number}
                          </button>
                        );
                      })}
                    </div>
                    );
                  })}
                </div>
              </div>
            );
          }

          // Row group: render sections side-by-side with aisle gap
          return (
            <div key={`g-${gIdx}`} style={{ display: "flex", gap: AISLE_GAP, justifyContent: "center" }}>
              {group.sections.map((section) => (
                <div key={section.id}>
                  <SectionHeader section={section} />
                  <div style={{ display: "flex", flexDirection: "column", gap: ROW_GAP }}>
                    {section.rows.map((row) => (
                      <div key={row.id} style={{ display: "flex", alignItems: "center", gap: SEAT_GAP }}>
                        <span style={{
                          width: ROW_LABEL_WIDTH, textAlign: "right",
                          color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 600, flexShrink: 0,
                        }}>
                          {row.row_label}
                        </span>
                        {[...row.seats].sort((a, b) => parseInt(a.seat_number) - parseInt(b.seat_number)).map((seat) => (
                          <SeatButton
                            key={seat.id}
                            seat={seat} section={section} row={row}
                            isSelected={selectedIds.has(seat.id)}
                            onSeatClick={onSeatClick}
                          />
                        ))}
                        <span style={{
                          width: ROW_LABEL_WIDTH, textAlign: "left",
                          color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 600, flexShrink: 0,
                        }}>
                          {row.row_label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
