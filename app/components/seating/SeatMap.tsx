"use client";

import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import type { SectionFull } from "@/lib/seating/types";
import { PPF } from "@/lib/seating/types";

type Props = {
  sections: SectionFull[];
  roomWidthFt: number;
  roomHeightFt: number;
  interactive: boolean;
  selectedSeatIds: Set<string>;
  onSeatClick: (seatId: string, sectionId: string) => void;
};

const SEAT_R_FT = 0.6;

export default function SeatMap({
  sections, roomWidthFt, roomHeightFt, interactive, selectedSeatIds, onSeatClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [viewBox, setViewBox] = useState("0 0 1000 800");

  const ppf = PPF;
  const ft = useCallback((v: number) => v * ppf, [ppf]);
  const seatR = ft(SEAT_R_FT);

  // Calculate content bounds and set viewBox to fit content exactly
  useEffect(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const sec of sections) {
      for (const obj of sec.objects) {
        minX = Math.min(minX, obj.x_ft);
        minY = Math.min(minY, obj.y_ft);
        maxX = Math.max(maxX, obj.x_ft + obj.width_ft);
        maxY = Math.max(maxY, obj.y_ft + obj.height_ft);
      }
      for (const seat of sec.seats) {
        minX = Math.min(minX, seat.x_ft - SEAT_R_FT * 2);
        minY = Math.min(minY, seat.y_ft - SEAT_R_FT * 2);
        maxX = Math.max(maxX, seat.x_ft + SEAT_R_FT * 2);
        maxY = Math.max(maxY, seat.y_ft + SEAT_R_FT * 2);
      }
    }

    if (!isFinite(minX)) {
      minX = 0; minY = 0; maxX = roomWidthFt; maxY = roomHeightFt;
    }

    // Add padding (8% of content size on each side, min 2ft)
    const w = maxX - minX;
    const h = maxY - minY;
    const padX = Math.max(2, w * 0.08);
    const padY = Math.max(2, h * 0.08);
    minX -= padX;
    minY -= padY;
    maxX += padX;
    maxY += padY;

    // Convert to pixels
    const vbX = minX * ppf;
    const vbY = minY * ppf;
    const vbW = (maxX - minX) * ppf;
    const vbH = (maxY - minY) * ppf;

    setViewBox(`${vbX} ${vbY} ${vbW} ${vbH}`);
  }, [sections, roomWidthFt, roomHeightFt, ppf]);

  return (
    <div ref={containerRef} style={{ flex: 1, width: "100%", height: "100%", overflow: "hidden", background: "#111118", position: "relative" }}>
      {/* Info */}
      <div style={{ position: "absolute", bottom: 8, left: 8, zIndex: 10, fontSize: 10, color: "rgba(255,255,255,0.2)" }}>
        {sections.reduce((s, sec) => s + sec.seats.length, 0)} seats {interactive ? "· Tap seats to select" : ""}
      </div>

      <svg
        width="100%" height="100%"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        style={{ display: "block" }}
      >
        {/* Render objects */}
        {sections.map((sec) => (
          <g key={sec.id}>
            {sec.objects.map((obj) => {
              const px = ft(obj.x_ft), py = ft(obj.y_ft), pw = ft(obj.width_ft), ph = ft(obj.height_ft);
              const pcx = px + pw/2, pcy = py + ph/2;

              if (obj.type === "table_group") {
                const meta = obj.metadata as { table_number?: number };
                return (
                  <g key={obj.id} transform={`rotate(${obj.rotation} ${pcx} ${pcy})`}>
                    <ellipse cx={pcx} cy={pcy} rx={pw/2} ry={ph/2} fill={`${sec.color}15`} stroke={`${sec.color}50`} strokeWidth={1} />
                    <text x={pcx} y={pcy+4} fill={`${sec.color}cc`} fontSize={Math.max(10, pw/5)} fontWeight={700} textAnchor="middle" fontFamily="system-ui" style={{pointerEvents:"none"}}>T{meta.table_number}</text>
                  </g>
                );
              }
              if (obj.type === "row_block") {
                const meta = obj.metadata as { row_label?: string };
                return (
                  <g key={obj.id}>
                    <rect x={px} y={py} width={pw} height={ph} rx={3} fill={`${sec.color}08`} stroke={`${sec.color}25`} strokeWidth={0.5} strokeDasharray="3 2" />
                    <text x={px+3} y={py-3} fill={`${sec.color}70`} fontSize={9} fontWeight={600} fontFamily="system-ui" style={{pointerEvents:"none"}}>{meta.row_label}</text>
                  </g>
                );
              }
              if (obj.type === "ga_zone") {
                const meta = obj.metadata as { capacity?: number };
                return (
                  <g key={obj.id}>
                    <rect x={px} y={py} width={pw} height={ph} rx={8} fill={`${sec.color}18`} stroke={`${sec.color}40`} strokeWidth={1.5} />
                    <text x={pcx} y={pcy-6} fill={`${sec.color}cc`} fontSize={14} fontWeight={700} textAnchor="middle" fontFamily="system-ui" style={{pointerEvents:"none"}}>{sec.name}</text>
                    <text x={pcx} y={pcy+12} fill={`${sec.color}70`} fontSize={10} textAnchor="middle" fontFamily="system-ui" style={{pointerEvents:"none"}}>GA · {meta.capacity} cap</text>
                  </g>
                );
              }
              if (obj.type === "stage") {
                return (
                  <g key={obj.id}>
                    <rect x={px} y={py} width={pw} height={ph} rx={4} fill="rgba(113,113,122,0.2)" stroke="rgba(113,113,122,0.5)" strokeWidth={1.5} />
                    <text x={pcx} y={pcy+5} fill="rgba(255,255,255,0.5)" fontSize={14} fontWeight={700} textAnchor="middle" fontFamily="system-ui" style={{pointerEvents:"none"}}>STAGE</text>
                  </g>
                );
              }
              return null;
            })}

            {/* Seats */}
            {sec.seats.map((seat) => {
              const sx = ft(seat.x_ft), sy = ft(seat.y_ft);
              const isSelected = selectedSeatIds.has(seat.id);
              const isHovered = hovered === seat.id;
              const isSold = seat.status === "sold";
              const isHeld = seat.status === "held" && !isSelected;

              let fill = sec.color;
              let opacity = 0.8;
              let stroke = "none";
              let sw = 0;
              let cursor = interactive ? "pointer" : "default";

              if (isSold) { fill = "rgba(255,255,255,0.06)"; opacity = 0.4; cursor = "not-allowed"; }
              else if (isHeld) { fill = "#f59e0b"; opacity = 0.6; cursor = "not-allowed"; }
              else if (isSelected) { fill = sec.color; opacity = 1; stroke = "#fff"; sw = 2; }
              if (isHovered && !isSold && !isHeld) { opacity = 1; stroke = "#fff"; sw = 1.5; }

              return (
                <circle
                  key={seat.id} cx={sx} cy={sy} r={seatR * (isHovered ? 1.15 : 1)}
                  fill={fill} opacity={opacity} stroke={stroke} strokeWidth={sw}
                  style={{ cursor, transition: "all 0.1s" }}
                  onMouseEnter={() => setHovered(seat.id)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (interactive && (seat.status === "available" || isSelected)) {
                      onSeatClick(seat.id, sec.id);
                    }
                  }}
                >
                  <title>{sec.name} · {seat.row_label} · Seat {seat.seat_number} · ${(sec.price_cents/100).toFixed(2)}{isSold ? " (Sold)" : isHeld ? " (Held)" : ""}</title>
                </circle>
              );
            })}
          </g>
        ))}
      </svg>
    </div>
  );
}
