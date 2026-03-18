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
const GRID_FT = 1;

export default function SeatMap({
  sections, roomWidthFt, roomHeightFt, interactive, selectedSeatIds, onSeatClick,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0, px: 0, py: 0 });
  const [hovered, setHovered] = useState<string | null>(null);

  const ppf = PPF;
  const cw = roomWidthFt * ppf;
  const ch = roomHeightFt * ppf;
  const ft = useCallback((v: number) => v * ppf, [ppf]);
  const seatR = ft(SEAT_R_FT);

  // Auto-fit
  useEffect(() => {
    if (!containerRef.current) return;
    const w = containerRef.current.clientWidth;
    const h = containerRef.current.clientHeight;
    const z = Math.min(w / cw, h / ch, 1) * 0.92;
    setZoom(z);
    setPan({ x: (w - cw * z) / 2, y: Math.max(8, (h - ch * z) / 2) });
  }, [cw, ch]);

  const handleBgDown = useCallback((e: React.MouseEvent) => {
    setIsPanning(true);
    setPanStart({ x: e.clientX, y: e.clientY, px: pan.x, py: pan.y });
  }, [pan]);
  const handleMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    setPan({ x: panStart.px + (e.clientX - panStart.x), y: panStart.py + (e.clientY - panStart.y) });
  }, [isPanning, panStart]);
  const handleUp = useCallback(() => setIsPanning(false), []);
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.max(0.15, Math.min(4, z + (e.deltaY > 0 ? -0.08 : 0.08))));
  }, []);

  // Grid
  const grid = useMemo(() => {
    const lines: React.ReactNode[] = [];
    for (let x = 0; x <= roomWidthFt; x += GRID_FT) {
      const m = x % 5 === 0;
      lines.push(<line key={`gv${x}`} x1={ft(x)} y1={0} x2={ft(x)} y2={ch} stroke={m ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.02)"} strokeWidth={m ? 0.7 : 0.3} />);
    }
    for (let y = 0; y <= roomHeightFt; y += GRID_FT) {
      const m = y % 5 === 0;
      lines.push(<line key={`gh${y}`} x1={0} y1={ft(y)} x2={cw} y2={ft(y)} stroke={m ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.02)"} strokeWidth={m ? 0.7 : 0.3} />);
    }
    for (let x = 0; x <= roomWidthFt; x += 10) {
      lines.push(<text key={`lx${x}`} x={ft(x)+2} y={10} fill="rgba(255,255,255,0.12)" fontSize={8} fontFamily="system-ui">{x}ft</text>);
    }
    return lines;
  }, [roomWidthFt, roomHeightFt, cw, ch, ft]);

  return (
    <div ref={containerRef} style={{ flex: 1, overflow: "hidden", background: "#0c0c12", position: "relative" }}>
      {/* Controls */}
      <div style={{ position: "absolute", bottom: 10, right: 10, zIndex: 10, display: "flex", gap: 3, background: "rgba(0,0,0,0.6)", borderRadius: 6, padding: 3 }}>
        <button onClick={() => setZoom(z => Math.max(0.15, z - 0.1))} style={{ width: 24, height: 24, background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 3, color: "#e5e7eb", fontSize: 13, cursor: "pointer" }}>−</button>
        <span style={{ padding: "0 5px", lineHeight: "24px", fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{Math.round(zoom*100)}%</span>
        <button onClick={() => setZoom(z => Math.min(4, z + 0.1))} style={{ width: 24, height: 24, background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 3, color: "#e5e7eb", fontSize: 13, cursor: "pointer" }}>+</button>
      </div>
      <div style={{ position: "absolute", bottom: 10, left: 10, zIndex: 10, fontSize: 10, color: "rgba(255,255,255,0.2)" }}>
        {sections.reduce((s, sec) => s + sec.seats.length, 0)} seats · Drag to pan · Scroll to zoom
      </div>

      <svg ref={svgRef} width="100%" height="100%" style={{ display: "block", cursor: isPanning ? "grabbing" : "grab" }}
        onMouseDown={handleBgDown} onMouseMove={handleMove} onMouseUp={handleUp} onMouseLeave={handleUp} onWheel={handleWheel}>
        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          <rect width={cw} height={ch} fill="#111118" rx={2} />
          {grid}

          {/* Render objects */}
          {sections.map((sec) => (
            <g key={sec.id}>
              {sec.objects.map((obj) => {
                const px = ft(obj.x_ft), py = ft(obj.y_ft), pw = ft(obj.width_ft), ph = ft(obj.height_ft);
                const pcx = px + pw/2, pcy = py + ph/2;

                if (obj.type === "table_group") {
                  const meta = obj.metadata as { table_number?: number; diameter_inches?: number };
                  return (
                    <g key={obj.id} transform={`rotate(${obj.rotation} ${pcx} ${pcy})`}>
                      <ellipse cx={pcx} cy={pcy} rx={pw/2} ry={ph/2} fill={`${sec.color}12`} stroke={`${sec.color}40`} strokeWidth={0.8} />
                      <text x={pcx} y={pcy+3} fill={`${sec.color}80`} fontSize={Math.max(7, pw/7)} fontWeight={700} textAnchor="middle" fontFamily="system-ui" style={{pointerEvents:"none"}}>T{meta.table_number}</text>
                    </g>
                  );
                }
                if (obj.type === "row_block") {
                  const meta = obj.metadata as { row_label?: string };
                  return (
                    <g key={obj.id}>
                      <rect x={px} y={py} width={pw} height={ph} rx={2} fill={`${sec.color}06`} stroke={`${sec.color}20`} strokeWidth={0.5} strokeDasharray="3 2" />
                      <text x={px+2} y={py-2} fill={`${sec.color}50`} fontSize={7} fontWeight={600} fontFamily="system-ui" style={{pointerEvents:"none"}}>{meta.row_label}</text>
                    </g>
                  );
                }
                if (obj.type === "ga_zone") {
                  const meta = obj.metadata as { capacity?: number };
                  return (
                    <g key={obj.id}>
                      <rect x={px} y={py} width={pw} height={ph} rx={6} fill={`${sec.color}14`} stroke={`${sec.color}30`} strokeWidth={1} />
                      <text x={pcx} y={pcy-4} fill={`${sec.color}80`} fontSize={11} fontWeight={700} textAnchor="middle" fontFamily="system-ui" style={{pointerEvents:"none"}}>{sec.name}</text>
                      <text x={pcx} y={pcy+10} fill={`${sec.color}50`} fontSize={8} textAnchor="middle" fontFamily="system-ui" style={{pointerEvents:"none"}}>GA · {meta.capacity} cap</text>
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
                else if (isSelected) { fill = sec.color; opacity = 1; stroke = "#fff"; sw = 1.5; }
                if (isHovered && !isSold && !isHeld) { opacity = 1; stroke = "#fff"; sw = 1; }

                return (
                  <circle
                    key={seat.id} cx={sx} cy={sy} r={seatR * (isHovered ? 1.1 : 1)}
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
        </g>
      </svg>
    </div>
  );
}
