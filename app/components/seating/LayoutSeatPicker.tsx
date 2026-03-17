"use client";

import { useRef, useState, useCallback, useEffect } from "react";
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
  [key: string]: unknown;
};

type SectionData = {
  id: string;
  section_name: string;
  color: string;
  price_tier: number;
  rows: RowData[];
  [key: string]: unknown;
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

type LayoutData = {
  id: string;
  name: string;
  background_image_url: string | null;
  room_width_ft: number;
  room_height_ft: number;
  scale_pixels_per_foot: number;
};

type Props = {
  layout: LayoutData;
  layoutObjects: LayoutObjectData[];
  sections: SectionData[];
  selectedSeats: SelectedSeat[];
  onSeatClick: (seat: SeatData, section: SectionData, row: RowData) => void;
};

const SEAT_RADIUS_FT = 0.75;
const PPF = 10; // pixels per foot for rendering

/**
 * LayoutSeatPicker — customer-facing SVG seat picker that renders the exact
 * layout diagram the venue designed, with clickable seats showing real-time status.
 */
export default function LayoutSeatPicker({
  layout,
  layoutObjects,
  sections,
  selectedSeats,
  onSeatClick,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0, panX: 0, panY: 0 });
  const [hoveredSeat, setHoveredSeat] = useState<string | null>(null);

  const selectedIds = new Set(selectedSeats.map((s) => s.seatId));

  const ppf = layout.scale_pixels_per_foot || PPF;
  const canvasW = (layout.room_width_ft || 100) * ppf;
  const canvasH = (layout.room_height_ft || 60) * ppf;
  const seatRadiusPx = SEAT_RADIUS_FT * ppf;

  const ft2px = useCallback((ft: number) => ft * ppf, [ppf]);

  // Auto-fit zoom on mount
  useEffect(() => {
    if (!containerRef.current) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    const fitZoom = Math.min(cw / canvasW, ch / canvasH, 1) * 0.95;
    setZoom(fitZoom);
    setPan({
      x: (cw - canvasW * fitZoom) / 2,
      y: Math.max(10, (ch - canvasH * fitZoom) / 2),
    });
  }, [canvasW, canvasH]);

  // Build a map from section_name → section data (for matching layout objects to sections)
  const sectionMap = new Map<string, SectionData>();
  sections.forEach((s) => sectionMap.set(s.section_name, s));

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only pan on background click (not on seats)
    if ((e.target as SVGElement).tagName === "svg" || (e.target as SVGElement).closest("[data-bg]")) {
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y });
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: panStart.panX + (e.clientX - panStart.x),
        y: panStart.panY + (e.clientY - panStart.y),
      });
    }
  }, [isPanning, panStart]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setZoom((z) => Math.max(0.2, Math.min(3, z + delta)));
  }, []);

  // Render a layout object
  const renderObject = (obj: LayoutObjectData) => {
    const section = sectionMap.get(obj.label);
    const color = obj.color || "#6366f1";
    const px = ft2px(obj.x);
    const py = ft2px(obj.y);
    const pw = ft2px(obj.width);
    const ph = ft2px(obj.height);
    const pcx = px + pw / 2;
    const pcy = py + ph / 2;

    return (
      <g key={obj.id} transform={`rotate(${obj.rotation} ${pcx} ${pcy})`}>
        {/* Object body */}
        {obj.type === "table" && (
          <>
            <ellipse cx={pcx} cy={pcy} rx={pw / 2} ry={ph / 2}
              fill={`${color}12`} stroke={`${color}40`} strokeWidth={1} />
            <text x={pcx} y={pcy + 3} fill={`${color}90`}
              fontSize={Math.max(8, pw / 7)} fontWeight={700} textAnchor="middle"
              fontFamily="system-ui, sans-serif" style={{ pointerEvents: "none" }}>
              {obj.label}
            </text>
            {/* "Buy Table" center button when all seats available */}
            {section && (() => {
              const allSeats = section.rows.flatMap((r) => r.seats);
              const allAvail = allSeats.every((s) => s.status === "available" || selectedIds.has(s.id));
              const allSelected = allSeats.length > 0 && allSeats.every((s) => selectedIds.has(s.id));
              if (!allAvail || allSeats.length === 0) return null;
              return (
                <text x={pcx} y={pcy + 3 + Math.max(8, pw / 7)}
                  fill={`${color}70`} fontSize={Math.max(6, pw / 10)}
                  textAnchor="middle" fontFamily="system-ui, sans-serif"
                  style={{ pointerEvents: "none" }}>
                  {allSelected ? "Deselect" : "Buy Table"}
                </text>
              );
            })()}
          </>
        )}

        {obj.type === "row" && (
          <>
            <rect x={px} y={py} width={pw} height={ph} rx={3}
              fill={`${color}06`} stroke={`${color}25`} strokeWidth={0.8}
              strokeDasharray="3 2" />
            <text x={px + 3} y={py - 2} fill={`${color}60`}
              fontSize={8} fontWeight={600} fontFamily="system-ui, sans-serif"
              style={{ pointerEvents: "none" }}>
              {obj.label}
            </text>
          </>
        )}

        {obj.type === "ga_section" && (
          <>
            <rect x={px} y={py} width={pw} height={ph} rx={6}
              fill={`${color}14`} stroke={`${color}30`} strokeWidth={1} />
            <text x={pcx} y={pcy - 4} fill={`${color}80`}
              fontSize={11} fontWeight={700} textAnchor="middle"
              fontFamily="system-ui, sans-serif" style={{ pointerEvents: "none" }}>
              {obj.label}
            </text>
            <text x={pcx} y={pcy + 10} fill={`${color}60`}
              fontSize={9} textAnchor="middle" fontFamily="system-ui, sans-serif"
              style={{ pointerEvents: "none" }}>
              General Admission
            </text>
          </>
        )}

        {obj.type === "stage" && (
          <>
            <rect x={px} y={py} width={pw} height={ph} rx={3}
              fill={`${color}20`} stroke={`${color}50`} strokeWidth={1.5} />
            <text x={pcx} y={pcy + 5} fill="rgba(255,255,255,0.5)"
              fontSize={13} fontWeight={700} textAnchor="middle"
              fontFamily="system-ui, sans-serif" style={{ pointerEvents: "none" }}>
              {obj.label}
            </text>
          </>
        )}

        {obj.type === "custom_zone" && (
          <>
            <rect x={px} y={py} width={pw} height={ph} rx={5}
              fill={`${color}0a`} stroke={`${color}25`} strokeWidth={1}
              strokeDasharray="5 3" />
            <text x={pcx} y={pcy + 4} fill={`${color}60`}
              fontSize={10} fontWeight={600} textAnchor="middle"
              fontFamily="system-ui, sans-serif" style={{ pointerEvents: "none" }}>
              {obj.label}
            </text>
          </>
        )}

        {/* Render seats from section data (with real-time status) */}
        {section && section.rows.flatMap((row) =>
          row.seats.map((seat) => {
            const sx = ft2px(seat.x_position);
            const sy = ft2px(seat.y_position);
            const isSelected = selectedIds.has(seat.id);
            const isSold = seat.status === "sold";
            const isHeld = seat.status === "held" && !isSelected;
            const isAvailable = seat.status === "available";
            const isHovered = hoveredSeat === seat.id;

            let fill = color;
            let opacity = 0.8;
            let strokeColor = "none";
            let strokeW = 0;
            let cursor = "pointer";

            if (isSold) { fill = "rgba(255,255,255,0.08)"; opacity = 0.4; cursor = "not-allowed"; }
            else if (isHeld) { fill = "#f59e0b"; opacity = 0.6; cursor = "not-allowed"; }
            else if (isSelected) { fill = color; opacity = 1; strokeColor = "#fff"; strokeW = 2; }

            if (isHovered && isAvailable) { opacity = 1; strokeColor = "#fff"; strokeW = 1.5; }

            return (
              <circle
                key={seat.id}
                cx={sx} cy={sy}
                r={seatRadiusPx * (isHovered ? 1.15 : 1)}
                fill={fill}
                opacity={opacity}
                stroke={strokeColor}
                strokeWidth={strokeW}
                style={{ cursor, transition: "all 0.12s ease" }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isAvailable || isSelected) onSeatClick(seat, section, row);
                }}
                onMouseEnter={() => setHoveredSeat(seat.id)}
                onMouseLeave={() => setHoveredSeat(null)}
              >
                <title>
                  {section.section_name} · {row.row_label.startsWith("T") ? "" : "Row "}{row.row_label} · Seat {seat.seat_number}
                  {isSold ? " (Sold)" : isHeld ? " (Held)" : isSelected ? " (Selected)" : ` · $${section.price_tier}`}
                </title>
              </circle>
            );
          })
        )}

        {/* Table center click zone for "buy full table" */}
        {obj.type === "table" && section && (() => {
          const allSeats = section.rows.flatMap((r) => r.seats);
          const allAvail = allSeats.every((s) => s.status === "available" || selectedIds.has(s.id));
          if (!allAvail || allSeats.length === 0) return null;
          const allSelected = allSeats.every((s) => selectedIds.has(s.id));
          return (
            <circle
              cx={pcx} cy={pcy}
              r={Math.min(pw, ph) / 3}
              fill="transparent"
              style={{ cursor: "pointer" }}
              onClick={(e) => {
                e.stopPropagation();
                const row = section.rows[0];
                if (!row) return;
                if (allSelected) {
                  // Deselect all
                  row.seats.forEach((seat) => {
                    if (selectedIds.has(seat.id)) onSeatClick(seat, section, row);
                  });
                } else {
                  // Select all available
                  row.seats.forEach((seat) => {
                    if (!selectedIds.has(seat.id) && seat.status === "available") {
                      onSeatClick(seat, section, row);
                    }
                  });
                }
              }}
            />
          );
        })()}
      </g>
    );
  };

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "min(70vh, 600px)",
        overflow: "hidden",
        borderRadius: 12,
        background: "#0c0c12",
        position: "relative",
      }}
    >
      {/* Zoom controls */}
      <div style={{
        position: "absolute", bottom: 10, right: 10, zIndex: 10,
        display: "flex", gap: 3, background: "rgba(0,0,0,0.6)", borderRadius: 6, padding: 3,
      }}>
        <button onClick={() => setZoom((z) => Math.max(0.2, z - 0.1))}
          style={{ width: 24, height: 24, background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 3, color: "#e5e7eb", fontSize: 13, cursor: "pointer" }}>−</button>
        <span style={{ padding: "0 5px", lineHeight: "24px", fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => Math.min(3, z + 0.1))}
          style={{ width: 24, height: 24, background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 3, color: "#e5e7eb", fontSize: 13, cursor: "pointer" }}>+</button>
      </div>

      {/* Drag hint */}
      <div style={{
        position: "absolute", bottom: 10, left: 10, zIndex: 10,
        fontSize: 10, color: "rgba(255,255,255,0.2)",
      }}>
        Drag to pan · Scroll to zoom · Click seats to select
      </div>

      <svg
        ref={svgRef}
        width="100%" height="100%"
        style={{ display: "block", cursor: isPanning ? "grabbing" : "grab" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Canvas background */}
          <rect data-bg="true" width={canvasW} height={canvasH} fill="#111118" rx={4} />

          {/* Background image (no grid for customer view) */}
          {layout.background_image_url && (
            <image
              data-bg="true"
              href={layout.background_image_url}
              x={0} y={0} width={canvasW} height={canvasH}
              preserveAspectRatio="xMidYMid meet"
              opacity={0.25}
              style={{ pointerEvents: "none" }}
            />
          )}

          {/* Layout objects + seats */}
          {layoutObjects.map(renderObject)}
        </g>
      </svg>
    </div>
  );
}
