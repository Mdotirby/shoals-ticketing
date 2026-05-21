"use client";

import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import type { SectionFull, LayoutObject } from "@/lib/seating/types";
import { PPF } from "@/lib/seating/types";

type Props = {
  sections: SectionFull[];
  roomWidthFt: number;
  roomHeightFt: number;
  /** Customer seat selection mode */
  interactive: boolean;
  selectedSeatIds: Set<string>;
  onSeatClick: (seatId: string, sectionId: string) => void;
  /**
   * Called when a customer clicks a table in a section where sells_as_table=true.
   * Receives all seat IDs belonging to that table object.
   */
  onTableClick?: (seatIds: string[], sectionId: string, objectId: string) => void;
  /** Admin drag-to-move mode */
  draggable?: boolean;
  onObjectMoved?: (objectId: string, newXFt: number, newYFt: number) => void;
};

const SEAT_R_FT = 0.6;

type Vb = { x: number; y: number; w: number; h: number };
type DragState = {
  objectId: string;
  startSvgX: number;
  startSvgY: number;
  startObjXFt: number;
  startObjYFt: number;
};
type Tooltip = { screenX: number; screenY: number; text: string };

export default function SeatMap({
  sections,
  roomWidthFt,
  roomHeightFt,
  interactive,
  selectedSeatIds,
  onSeatClick,
  onTableClick,
  draggable = false,
  onObjectMoved,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const [vb, setVb] = useState<Vb>({ x: 0, y: 0, w: 1000, h: 800 });
  const vbRef = useRef<Vb>(vb); // always-current vb for use inside native listeners

  const baseVb = useRef<Vb>({ x: 0, y: 0, w: 1000, h: 800 });
  const [isPanning, setIsPanning] = useState(false);
  const [hoveredObjId, setHoveredObjId] = useState<string | null>(null);
  const panRef = useRef<{ x: number; y: number; vbx: number; vby: number } | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [dragOffset, setDragOffset] = useState<{ objectId: string; dxFt: number; dyFt: number } | null>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  // Touch state
  const touchRef = useRef<{ id0: number; id1?: number; x0: number; y0: number; x1?: number; y1?: number; lastDist?: number } | null>(null);

  const ppf = PPF;
  const ft = useCallback((v: number) => v * ppf, [ppf]);
  const seatR = ft(SEAT_R_FT);

  // ─── sync vbRef whenever vb changes ──────────────────────────────────────
  useEffect(() => { vbRef.current = vb; }, [vb]);

  // ─── fit viewBox to content ───────────────────────────────────────────────
  useEffect(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const sec of sections) {
      for (const obj of sec.objects) {
        // Account for rotation by computing all 4 corners
        const cx = (obj.x_ft + obj.width_ft / 2) * ppf;
        const cy = (obj.y_ft + obj.height_ft / 2) * ppf;
        const hw = (obj.width_ft / 2) * ppf;
        const hh = (obj.height_ft / 2) * ppf;
        const angle = (obj.rotation * Math.PI) / 180;
        const cos = Math.abs(Math.cos(angle));
        const sin = Math.abs(Math.sin(angle));
        const rx = hw * cos + hh * sin;
        const ry = hw * sin + hh * cos;
        minX = Math.min(minX, cx - rx);
        minY = Math.min(minY, cy - ry);
        maxX = Math.max(maxX, cx + rx);
        maxY = Math.max(maxY, cy + ry);
      }
      for (const seat of sec.seats) {
        const px = seat.x_ft * ppf;
        const py = seat.y_ft * ppf;
        minX = Math.min(minX, px - seatR * 2);
        minY = Math.min(minY, py - seatR * 2);
        maxX = Math.max(maxX, px + seatR * 2);
        maxY = Math.max(maxY, py + seatR * 2);
      }
    }

    if (!isFinite(minX)) {
      minX = 0; minY = 0;
      maxX = roomWidthFt * ppf; maxY = roomHeightFt * ppf;
    }

    const w = maxX - minX;
    const h = maxY - minY;
    const padX = Math.max(ppf * 2, w * 0.08);
    const padY = Math.max(ppf * 2, h * 0.08);
    const newVb: Vb = { x: minX - padX, y: minY - padY, w: w + padX * 2, h: h + padY * 2 };
    baseVb.current = newVb;
    vbRef.current = newVb;
    setVb(newVb);
  }, [sections, roomWidthFt, roomHeightFt, ppf, seatR]);

  // ─── native wheel listener (passive: false) ───────────────────────────────
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.15 : 0.87;
      const rect = svg.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / rect.width;
      const my = (e.clientY - rect.top) / rect.height;
      setVb((prev) => {
        const newW = prev.w * factor;
        const newH = prev.h * factor;
        if (newW > baseVb.current.w * 3) return prev; // max zoom out
        if (newW < baseVb.current.w * 0.05) return prev; // max zoom in
        return {
          x: prev.x + (prev.w - newW) * mx,
          y: prev.y + (prev.h - newH) * my,
          w: newW,
          h: newH,
        };
      });
    };

    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  // ─── helpers ──────────────────────────────────────────────────────────────
  const clientToSvg = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const cur = vbRef.current;
    return {
      x: cur.x + (clientX - rect.left) / rect.width * cur.w,
      y: cur.y + (clientY - rect.top) / rect.height * cur.h,
    };
  }, []);

  const resetView = useCallback(() => {
    setVb(baseVb.current);
  }, []);

  // ─── mouse pan / drag ────────────────────────────────────────────────────
  const onMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;

    // Check if clicking on a draggable object (data-object-id set on the group)
    const el = e.target as SVGElement;
    const objectGroup = el.closest("[data-object-id]") as SVGElement | null;

    if (draggable && objectGroup) {
      const objectId = objectGroup.dataset.objectId!;
      // Find object coords
      let startObjXFt = 0, startObjYFt = 0;
      outer: for (const sec of sections) {
        for (const obj of sec.objects) {
          if (obj.id === objectId) { startObjXFt = obj.x_ft; startObjYFt = obj.y_ft; break outer; }
        }
      }
      const svgPos = clientToSvg(e.clientX, e.clientY);
      dragRef.current = { objectId, startSvgX: svgPos.x, startSvgY: svgPos.y, startObjXFt, startObjYFt };
      e.stopPropagation();
    } else {
      setIsPanning(true);
      panRef.current = { x: e.clientX, y: e.clientY, vbx: vbRef.current.x, vby: vbRef.current.y };
    }
  }, [draggable, sections, clientToSvg]);

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (dragRef.current) {
      const svgPos = clientToSvg(e.clientX, e.clientY);
      const dxFt = (svgPos.x - dragRef.current.startSvgX) / ppf;
      const dyFt = (svgPos.y - dragRef.current.startSvgY) / ppf;
      setDragOffset({ objectId: dragRef.current.objectId, dxFt, dyFt });
      return;
    }
    if (!panRef.current) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const cur = vbRef.current;
    const dx = (e.clientX - panRef.current.x) / rect.width * cur.w;
    const dy = (e.clientY - panRef.current.y) / rect.height * cur.h;
    setVb((prev) => ({ ...prev, x: panRef.current!.vbx - dx, y: panRef.current!.vby - dy }));
  }, [clientToSvg, ppf]);

  const onMouseUp = useCallback(() => {
    if (dragRef.current && dragOffset) {
      const { objectId, startObjXFt, startObjYFt } = dragRef.current;
      const newX = parseFloat((startObjXFt + dragOffset.dxFt).toFixed(4));
      const newY = parseFloat((startObjYFt + dragOffset.dyFt).toFixed(4));
      onObjectMoved?.(objectId, newX, newY);
    }
    dragRef.current = null;
    setDragOffset(null);
    setIsPanning(false);
    panRef.current = null;
  }, [dragOffset, onObjectMoved]);

  // ─── touch handlers ───────────────────────────────────────────────────────
  const onTouchStart = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      touchRef.current = { id0: t.identifier, x0: t.clientX, y0: t.clientY };
    } else if (e.touches.length === 2) {
      const t0 = e.touches[0], t1 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      touchRef.current = {
        id0: t0.identifier, id1: t1.identifier,
        x0: t0.clientX, y0: t0.clientY,
        x1: t1.clientX, y1: t1.clientY,
        lastDist: dist,
      };
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    e.preventDefault();
    if (!touchRef.current) return;

    if (e.touches.length === 1 && touchRef.current.id1 === undefined) {
      const t = e.touches[0];
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const cur = vbRef.current;
      const dx = (t.clientX - touchRef.current.x0) / rect.width * cur.w;
      const dy = (t.clientY - touchRef.current.y0) / rect.height * cur.h;
      setVb((prev) => ({
        ...prev,
        x: prev.x - dx,
        y: prev.y - dy,
      }));
      touchRef.current.x0 = t.clientX;
      touchRef.current.y0 = t.clientY;
    } else if (e.touches.length === 2 && touchRef.current.lastDist !== undefined) {
      const t0 = e.touches[0], t1 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      const factor = touchRef.current.lastDist / dist;
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const midX = (t0.clientX + t1.clientX) / 2;
      const midY = (t0.clientY + t1.clientY) / 2;
      const mx = (midX - rect.left) / rect.width;
      const my = (midY - rect.top) / rect.height;
      setVb((prev) => {
        const newW = prev.w * factor;
        const newH = prev.h * factor;
        if (newW > baseVb.current.w * 3 || newW < baseVb.current.w * 0.05) return prev;
        return {
          x: prev.x + (prev.w - newW) * mx,
          y: prev.y + (prev.h - newH) * my,
          w: newW,
          h: newH,
        };
      });
      touchRef.current.lastDist = dist;
    }
  }, []);

  const onTouchEnd = useCallback(() => { touchRef.current = null; }, []);

  // ─── build lookup: objectId → drag-offset position ───────────────────────
  const draggedObjectId = dragOffset?.objectId ?? null;

  const getObjPos = useCallback((obj: LayoutObject) => {
    if (dragOffset && obj.id === draggedObjectId) {
      return { x: obj.x_ft + dragOffset.dxFt, y: obj.y_ft + dragOffset.dyFt };
    }
    return { x: obj.x_ft, y: obj.y_ft };
  }, [dragOffset, draggedObjectId]);

  // ─── total seat count for display ─────────────────────────────────────────
  const totalSeats = useMemo(
    () => sections.reduce((s, sec) => s + sec.seats.length, 0),
    [sections]
  );

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, width: "100%", height: "100%", overflow: "hidden", background: "#111118", position: "relative" }}
    >
      {/* Reset zoom button */}
      <button
        onClick={resetView}
        title="Reset view"
        style={{
          position: "absolute", top: 8, right: 8, zIndex: 10,
          background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 6, color: "rgba(255,255,255,0.5)", fontSize: 11,
          padding: "4px 8px", cursor: "pointer",
        }}
      >
        ⌖ Reset
      </button>

      {/* Seat count label */}
      <div style={{ position: "absolute", bottom: 8, left: 8, zIndex: 10, fontSize: 10, color: "rgba(255,255,255,0.2)" }}>
        {interactive ? "Tap seats to select" : `${totalSeats} seats`}
      </div>

      {/* Custom tooltip */}
      {tooltip && (
        <div
          style={{
            position: "absolute",
            left: tooltip.screenX + 12,
            top: tooltip.screenY - 8,
            background: "rgba(17,17,24,0.95)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 6,
            padding: "4px 8px",
            fontSize: 11,
            color: "rgba(255,255,255,0.85)",
            pointerEvents: "none",
            zIndex: 20,
            whiteSpace: "nowrap",
          }}
        >
          {tooltip.text}
        </div>
      )}

      <svg
        ref={svgRef}
        width="100%" height="100%"
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ display: "block", cursor: dragOffset ? "grabbing" : isPanning ? "grabbing" : draggable ? "grab" : interactive ? "default" : "grab" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {sections.map((sec) => (
          <g key={sec.id}>
            {sec.objects.map((obj) => {
              const pos = getObjPos(obj);
              const px = ft(pos.x), py = ft(pos.y), pw = ft(obj.width_ft), ph = ft(obj.height_ft);
              const pcx = px + pw / 2, pcy = py + ph / 2;
              const isDragging = dragOffset?.objectId === obj.id;
              const dragAttr = draggable ? { "data-object-id": obj.id } : {};

              if (obj.type === "table_group") {
                const meta = obj.metadata as { table_number?: number };

                if (sec.sells_as_table && interactive) {
                  const tableSeats = sec.seats.filter((s) => s.object_id === obj.id);
                  const seatIds = tableSeats.map((s) => s.id);
                  const isTableSelected = seatIds.length > 0 && seatIds.every((id) => selectedSeatIds.has(id));
                  const isTableHeld = tableSeats.some((s) => s.status === "held");
                  const isTableSold = tableSeats.some((s) => s.status === "sold");
                  const isHovered = hoveredObjId === obj.id;
                  const isAvailable = !isTableHeld && !isTableSold;

                  const ellipseFill = isTableSold ? `${sec.color}06`
                    : isTableHeld ? "#f59e0b18"
                    : isTableSelected ? `${sec.color}45`
                    : isHovered ? `${sec.color}28`
                    : `${sec.color}15`;
                  const ellipseStroke = isTableSelected ? "#fff"
                    : isTableHeld ? "#f59e0b60"
                    : isTableSold ? `${sec.color}20`
                    : isHovered ? `${sec.color}cc`
                    : `${sec.color}50`;
                  const labelFill = isTableSelected ? "#fff"
                    : isTableSold ? `${sec.color}40`
                    : `${sec.color}cc`;
                  const tableCursor = isAvailable || isTableSelected ? "pointer" : "not-allowed";
                  const fontSize = Math.max(10, pw / 5);
                  const tooltipText = `${sec.name} · T${meta.table_number} · ${seatIds.length} seats — $${(sec.price_cents / 100).toFixed(2)}${isTableSelected ? " (Selected)" : isTableHeld ? " (Held)" : isTableSold ? " (Sold)" : ""}`;

                  return (
                    // NOTE: seat circles for this table are rendered INSIDE this group (not in the
                    // seat loop below) so that clicking any seat dot also triggers the table handler.
                    <g key={obj.id}
                      style={{ cursor: tableCursor }}
                      onMouseEnter={(e) => {
                        setHoveredObjId(obj.id);
                        const rect = containerRef.current?.getBoundingClientRect();
                        setTooltip({ screenX: e.clientX - (rect?.left ?? 0), screenY: e.clientY - (rect?.top ?? 0), text: tooltipText });
                      }}
                      onMouseMove={(e) => {
                        const rect = containerRef.current?.getBoundingClientRect();
                        setTooltip((prev) => prev ? { ...prev, screenX: e.clientX - (rect?.left ?? 0), screenY: e.clientY - (rect?.top ?? 0) } : null);
                      }}
                      onMouseLeave={() => { setHoveredObjId(null); setTooltip(null); }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isAvailable || isTableSelected) onTableClick?.(seatIds, sec.id, obj.id);
                      }}
                    >
                      {/* Invisible hit-area ellipse covering the full seat orbit radius so
                          clicking anywhere in the table unit (including between seat dots)
                          is captured here rather than falling through to the SVG pan handler */}
                      <ellipse cx={pcx} cy={pcy}
                        rx={pw / 2 + seatR * 2.2} ry={ph / 2 + seatR * 2.2}
                        fill="rgba(0,0,0,0)" stroke="none"
                        style={{ pointerEvents: "all" }}
                      />
                      {/* Visible table ellipse */}
                      <g transform={`rotate(${obj.rotation} ${pcx} ${pcy})`}>
                        <ellipse cx={pcx} cy={pcy} rx={pw / 2} ry={ph / 2}
                          fill={ellipseFill} stroke={ellipseStroke}
                          strokeWidth={isTableSelected || isHovered ? 2 : 1}
                          style={{ pointerEvents: "none" }}
                        />
                        <text x={pcx} y={pcy + 1} fill={labelFill} fontSize={fontSize} fontWeight={700} textAnchor="middle" dominantBaseline="middle" fontFamily="system-ui" style={{ pointerEvents: "none" }}>
                          T{meta.table_number}
                        </text>
                        <text x={pcx} y={pcy + fontSize + 3} fill={isTableSelected ? "rgba(255,255,255,0.7)" : `${sec.color}80`} fontSize={Math.max(7, fontSize * 0.65)} textAnchor="middle" fontFamily="system-ui" style={{ pointerEvents: "none" }}>
                          ${(sec.price_cents / 100).toFixed(0)}
                        </text>
                      </g>
                      {/* Seat dots — rendered inside the group so all clicks bubble to the handler above */}
                      {tableSeats.map((seat) => {
                        const sx = ft(seat.x_ft), sy = ft(seat.y_ft);
                        const isSeatSelected = selectedSeatIds.has(seat.id);
                        const isSeatHeld = seat.status === "held";
                        const isSeatSold = seat.status === "sold";
                        return (
                          <circle key={seat.id} cx={sx} cy={sy} r={seatR * 0.75}
                            fill={isSeatSold ? "rgba(255,255,255,0.08)" : isSeatHeld ? "#f59e0b" : isSeatSelected ? "#fff" : sec.color}
                            opacity={isSeatSold ? 0.3 : isSeatHeld ? 0.5 : isSeatSelected ? 0.9 : 0.5}
                            stroke={isSeatSelected ? sec.color : "none"}
                            strokeWidth={isSeatSelected ? 1 : 0}
                            style={{ pointerEvents: "none" }}
                          />
                        );
                      })}
                    </g>
                  );
                }

                // Builder / non-table-sale mode
                return (
                  <g key={obj.id} {...dragAttr}
                    transform={`rotate(${obj.rotation} ${pcx} ${pcy})`}
                    style={{ cursor: draggable ? "grab" : "default", opacity: isDragging ? 0.7 : 1 }}
                  >
                    <ellipse cx={pcx} cy={pcy} rx={pw / 2} ry={ph / 2} fill={`${sec.color}15`} stroke={`${sec.color}50`} strokeWidth={isDragging ? 2 : 1} />
                    <text x={pcx} y={pcy + 4} fill={`${sec.color}cc`} fontSize={Math.max(10, pw / 5)} fontWeight={700} textAnchor="middle" fontFamily="system-ui" style={{ pointerEvents: "none" }}>T{meta.table_number}</text>
                  </g>
                );
              }
              if (obj.type === "row_block") {
                const meta = obj.metadata as { row_label?: string };
                return (
                  <g key={obj.id} {...dragAttr}
                    style={{ cursor: draggable ? "grab" : "default", opacity: isDragging ? 0.7 : 1 }}
                  >
                    <rect x={px} y={py} width={pw} height={ph} rx={3} fill={`${sec.color}08`} stroke={`${sec.color}25`} strokeWidth={isDragging ? 1.5 : 0.5} strokeDasharray="3 2" />
                    <text x={px + 3} y={py - 3} fill={`${sec.color}70`} fontSize={9} fontWeight={600} fontFamily="system-ui" style={{ pointerEvents: "none" }}>{meta.row_label}</text>
                  </g>
                );
              }
              if (obj.type === "ga_zone") {
                const meta = obj.metadata as { capacity?: number };
                return (
                  <g key={obj.id} {...dragAttr}
                    style={{ cursor: draggable ? "grab" : "default", opacity: isDragging ? 0.7 : 1 }}
                  >
                    <rect x={px} y={py} width={pw} height={ph} rx={8} fill={`${sec.color}18`} stroke={`${sec.color}40`} strokeWidth={1.5} />
                    <text x={pcx} y={pcy - 6} fill={`${sec.color}cc`} fontSize={14} fontWeight={700} textAnchor="middle" fontFamily="system-ui" style={{ pointerEvents: "none" }}>{sec.name}</text>
                    {!interactive && <text x={pcx} y={pcy + 12} fill={`${sec.color}70`} fontSize={10} textAnchor="middle" fontFamily="system-ui" style={{ pointerEvents: "none" }}>GA · {meta.capacity} cap</text>}
                  </g>
                );
              }
              if (obj.type === "stage") {
                const meta = obj.metadata as { label?: string };
                return (
                  <g key={obj.id} {...dragAttr}
                    style={{ cursor: draggable ? "grab" : "default", opacity: isDragging ? 0.7 : 1 }}
                  >
                    <rect x={px} y={py} width={pw} height={ph} rx={4} fill="rgba(113,113,122,0.2)" stroke={isDragging ? "rgba(113,113,122,0.9)" : "rgba(113,113,122,0.5)"} strokeWidth={isDragging ? 2 : 1.5} />
                    <text x={pcx} y={pcy + 5} fill="rgba(255,255,255,0.6)" fontSize={Math.min(14, ph * ppf * 0.4)} fontWeight={700} textAnchor="middle" fontFamily="system-ui" style={{ pointerEvents: "none" }}>{meta.label || sec.name}</text>
                  </g>
                );
              }
              return null;
            })}

            {/* Seats — skip sells_as_table sections in interactive mode; those seats are
                already rendered inside their table group above for correct z-order / click handling */}
            {sec.seats.map((seat) => {
              if (sec.sells_as_table && interactive) return null;

              // Apply drag offset to seats belonging to dragged object
              let sx = ft(seat.x_ft), sy = ft(seat.y_ft);
              if (dragOffset && seat.object_id === dragOffset.objectId) {
                sx += ft(dragOffset.dxFt);
                sy += ft(dragOffset.dyFt);
              }

              const isSelected = selectedSeatIds.has(seat.id);
              const isSold = seat.status === "sold";
              const isHeld = seat.status === "held" && !isSelected;

              let fill = sec.color;
              let opacity = 0.8;
              let stroke = "none";
              let sw = 0;
              const cursor = interactive ? (isSold || isHeld ? "not-allowed" : "pointer") : "default";

              if (isSold) { fill = "rgba(255,255,255,0.06)"; opacity = 0.4; }
              else if (isHeld) { fill = "#f59e0b"; opacity = 0.6; }
              else if (isSelected) { fill = sec.color; opacity = 1; stroke = "#fff"; sw = 2; }

              return (
                <circle
                  key={seat.id}
                  cx={sx} cy={sy} r={seatR}
                  fill={fill} opacity={opacity} stroke={stroke} strokeWidth={sw}
                  style={{ cursor }}
                  onMouseEnter={(e) => {
                    if (isSold || isHeld || !interactive) return;
                    const status = isSold ? " (Sold)" : isHeld ? " (Held)" : "";
                    setTooltip({
                      screenX: e.clientX - (containerRef.current?.getBoundingClientRect().left ?? 0),
                      screenY: e.clientY - (containerRef.current?.getBoundingClientRect().top ?? 0),
                      text: `${sec.name} · ${seat.row_label} · #${seat.seat_number} — $${(sec.price_cents / 100).toFixed(2)}${status}`,
                    });
                  }}
                  onMouseMove={(e) => {
                    if (!tooltip) return;
                    setTooltip((prev) => prev ? {
                      ...prev,
                      screenX: e.clientX - (containerRef.current?.getBoundingClientRect().left ?? 0),
                      screenY: e.clientY - (containerRef.current?.getBoundingClientRect().top ?? 0),
                    } : null);
                  }}
                  onMouseLeave={() => setTooltip(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (interactive && !isSold && !isHeld) {
                      onSeatClick(seat.id, sec.id);
                    }
                  }}
                />
              );
            })}
          </g>
        ))}
      </svg>
    </div>
  );
}
