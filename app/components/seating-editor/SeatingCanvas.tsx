"use client";

import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { LayoutObject, SnapGuide, DEFAULT_PPF } from "@/lib/types/layout";
import { generateSeats, SEAT_RADIUS_FT } from "@/lib/seating/seatGenerator";
import { snapPosition, GRID_SPACING_FT } from "@/lib/seating/snapEngine";

type Props = {
  objects: LayoutObject[];
  backgroundUrl: string | null;
  selectedId: string | null;
  roomWidthFt: number;
  roomHeightFt: number;
  pixelsPerFoot: number;
  onSelectObject: (id: string | null) => void;
  onMoveObject: (id: string, x: number, y: number) => void;
  onResizeObject: (id: string, width: number, height: number) => void;
  onDropNewObject: (x: number, y: number) => void;
};

/** Internal rendering scale for sharpness (2x) */
const RENDER_SCALE = 2;

export default function SeatingCanvas({
  objects,
  backgroundUrl,
  selectedId,
  roomWidthFt,
  roomHeightFt,
  pixelsPerFoot,
  onSelectObject,
  onMoveObject,
  onResizeObject,
  onDropNewObject,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizing, setResizing] = useState<string | null>(null);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0, panX: 0, panY: 0 });
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);

  const ppf = pixelsPerFoot || DEFAULT_PPF;
  const canvasW = roomWidthFt * ppf;
  const canvasH = roomHeightFt * ppf;
  const seatRadiusPx = SEAT_RADIUS_FT * ppf;
  const gridPx = GRID_SPACING_FT * ppf;

  // Convert SVG screen coords to feet
  const screenToFeet = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      const px = (e.clientX - rect.left - pan.x) / zoom;
      const py = (e.clientY - rect.top - pan.y) / zoom;
      return { x: px / ppf, y: py / ppf };
    },
    [zoom, pan, ppf]
  );

  // Convert feet to pixels for rendering
  const ft2px = useCallback((ft: number) => ft * ppf, [ppf]);

  // Drag start
  const handleObjectMouseDown = useCallback(
    (e: React.MouseEvent, obj: LayoutObject) => {
      e.stopPropagation();
      onSelectObject(obj.id);
      const pt = screenToFeet(e);
      setDragging(obj.id);
      setDragOffset({ x: pt.x - obj.x, y: pt.y - obj.y });
    },
    [screenToFeet, onSelectObject]
  );

  // Resize start
  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent, obj: LayoutObject) => {
      e.stopPropagation();
      const pt = screenToFeet(e);
      setResizing(obj.id);
      setResizeStart({ x: pt.x, y: pt.y, w: obj.width, h: obj.height });
    },
    [screenToFeet]
  );

  // Mouse move
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning) {
        setPan({
          x: panStart.panX + (e.clientX - panStart.x),
          y: panStart.panY + (e.clientY - panStart.y),
        });
        return;
      }

      if (dragging) {
        const pt = screenToFeet(e);
        const rawX = pt.x - dragOffset.x;
        const rawY = pt.y - dragOffset.y;
        const obj = objects.find((o) => o.id === dragging);
        if (obj) {
          const snap = snapPosition(
            dragging, rawX, rawY, obj.width, obj.height, objects
          );
          onMoveObject(dragging, snap.x, snap.y);
          setSnapGuides(snap.guides);
        }
      }

      if (resizing) {
        const pt = screenToFeet(e);
        const dx = pt.x - resizeStart.x;
        const dy = pt.y - resizeStart.y;
        const gridSnap = GRID_SPACING_FT;
        const newW = Math.max(2, Math.round((resizeStart.w + dx) / gridSnap) * gridSnap);
        const newH = Math.max(2, Math.round((resizeStart.h + dy) / gridSnap) * gridSnap);
        onResizeObject(resizing, newW, newH);
      }
    },
    [dragging, resizing, dragOffset, resizeStart, screenToFeet, onMoveObject, onResizeObject, isPanning, panStart, objects]
  );

  const handleMouseUp = useCallback(() => {
    setDragging(null);
    setResizing(null);
    setIsPanning(false);
    setSnapGuides([]);
  }, []);

  // Pan
  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1 || e.altKey) {
        e.preventDefault();
        setIsPanning(true);
        setPanStart({ x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y });
        return;
      }
      onSelectObject(null);
    },
    [onSelectObject, pan]
  );

  // Zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((z) => Math.max(0.15, Math.min(4, z + delta)));
  }, []);

  // Drop from toolbar
  const handleCanvasDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const pt = screenToFeet(e as unknown as React.MouseEvent);
      // Snap to grid
      const snappedX = Math.round(pt.x / GRID_SPACING_FT) * GRID_SPACING_FT;
      const snappedY = Math.round(pt.y / GRID_SPACING_FT) * GRID_SPACING_FT;
      onDropNewObject(snappedX, snappedY);
    },
    [screenToFeet, onDropNewObject]
  );

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onSelectObject(null);
      if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(4, z + 0.1));
      if (e.key === "-") setZoom((z) => Math.max(0.15, z - 0.1));
      if (e.key === "0") { setZoom(1); setPan({ x: 0, y: 0 }); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onSelectObject]);

  // Generate grid lines (major every 5ft, minor every 1ft)
  const gridLines = useMemo(() => {
    const lines: React.ReactNode[] = [];
    // Minor grid lines (every 1 ft)
    for (let x = 0; x <= roomWidthFt; x += GRID_SPACING_FT) {
      const isMajor = x % 5 === 0;
      lines.push(
        <line
          key={`gv-${x}`}
          x1={ft2px(x)} y1={0} x2={ft2px(x)} y2={canvasH}
          stroke={isMajor ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.025)"}
          strokeWidth={isMajor ? 0.8 : 0.4}
        />
      );
    }
    for (let y = 0; y <= roomHeightFt; y += GRID_SPACING_FT) {
      const isMajor = y % 5 === 0;
      lines.push(
        <line
          key={`gh-${y}`}
          x1={0} y1={ft2px(y)} x2={canvasW} y2={ft2px(y)}
          stroke={isMajor ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.025)"}
          strokeWidth={isMajor ? 0.8 : 0.4}
        />
      );
    }
    // Dimension labels every 10 ft
    for (let x = 0; x <= roomWidthFt; x += 10) {
      lines.push(
        <text
          key={`lx-${x}`} x={ft2px(x) + 2} y={12}
          fill="rgba(255,255,255,0.15)" fontSize={9}
          fontFamily="system-ui, sans-serif"
        >
          {x}ft
        </text>
      );
    }
    for (let y = 10; y <= roomHeightFt; y += 10) {
      lines.push(
        <text
          key={`ly-${y}`} x={2} y={ft2px(y) - 2}
          fill="rgba(255,255,255,0.15)" fontSize={9}
          fontFamily="system-ui, sans-serif"
        >
          {y}ft
        </text>
      );
    }
    return lines;
  }, [roomWidthFt, roomHeightFt, canvasW, canvasH, ft2px]);

  const renderObject = (obj: LayoutObject) => {
    const isSelected = obj.id === selectedId;
    const color = obj.color || "#6366f1";
    const seats = generateSeats(obj);

    // Convert feet to pixels
    const px = ft2px(obj.x);
    const py = ft2px(obj.y);
    const pw = ft2px(obj.width);
    const ph = ft2px(obj.height);
    const pcx = px + pw / 2;
    const pcy = py + ph / 2;

    return (
      <g
        key={obj.id}
        transform={`rotate(${obj.rotation} ${pcx} ${pcy})`}
        style={{ cursor: dragging === obj.id ? "grabbing" : "grab" }}
        onMouseDown={(e) => handleObjectMouseDown(e, obj)}
      >
        {obj.type === "table" && (
          <>
            <ellipse
              cx={pcx} cy={pcy} rx={pw / 2} ry={ph / 2}
              fill={`${color}15`}
              stroke={color}
              strokeWidth={isSelected ? 2.5 : 1.5}
            />
            <text
              x={pcx} y={pcy + 4}
              fill={color} fontSize={Math.max(9, pw / 6)}
              fontWeight={700} textAnchor="middle"
              fontFamily="system-ui, sans-serif"
              style={{ pointerEvents: "none" }}
            >
              {obj.label}
            </text>
            {obj.diameter_inches > 0 && (
              <text
                x={pcx} y={pcy + 4 + Math.max(9, pw / 6)}
                fill={`${color}88`} fontSize={Math.max(7, pw / 9)}
                textAnchor="middle"
                fontFamily="system-ui, sans-serif"
                style={{ pointerEvents: "none" }}
              >
                {obj.diameter_inches}&quot;
              </text>
            )}
          </>
        )}

        {obj.type === "row" && (
          <>
            <rect
              x={px} y={py} width={pw} height={ph} rx={4}
              fill={`${color}08`}
              stroke={color}
              strokeWidth={isSelected ? 2.5 : 1}
              strokeDasharray={isSelected ? "none" : "4 2"}
            />
            <text
              x={px + 4} y={py - 3}
              fill={color} fontSize={9}
              fontWeight={600}
              fontFamily="system-ui, sans-serif"
              style={{ pointerEvents: "none" }}
            >
              {obj.label}
            </text>
          </>
        )}

        {obj.type === "ga_section" && (
          <>
            <rect
              x={px} y={py} width={pw} height={ph} rx={6}
              fill={`${color}18`}
              stroke={color}
              strokeWidth={isSelected ? 2.5 : 1.5}
            />
            <text
              x={pcx} y={pcy - 4}
              fill={color} fontSize={11}
              fontWeight={700} textAnchor="middle"
              fontFamily="system-ui, sans-serif"
              style={{ pointerEvents: "none" }}
            >
              {obj.label}
            </text>
            <text
              x={pcx} y={pcy + 10}
              fill={`${color}99`} fontSize={9}
              textAnchor="middle"
              fontFamily="system-ui, sans-serif"
              style={{ pointerEvents: "none" }}
            >
              Cap: {obj.capacity}
            </text>
          </>
        )}

        {obj.type === "stage" && (
          <>
            <rect
              x={px} y={py} width={pw} height={ph} rx={3}
              fill={`${color}25`}
              stroke={color}
              strokeWidth={isSelected ? 2.5 : 2}
            />
            <text
              x={pcx} y={pcy + 5}
              fill="#e5e7eb" fontSize={13}
              fontWeight={700} textAnchor="middle"
              fontFamily="system-ui, sans-serif"
              style={{ pointerEvents: "none" }}
            >
              {obj.label}
            </text>
          </>
        )}

        {obj.type === "custom_zone" && (
          <>
            <rect
              x={px} y={py} width={pw} height={ph} rx={5}
              fill={`${color}12`}
              stroke={color}
              strokeWidth={isSelected ? 2.5 : 1.5}
              strokeDasharray="6 3"
            />
            <text
              x={pcx} y={pcy + 4}
              fill={color} fontSize={10}
              fontWeight={600} textAnchor="middle"
              fontFamily="system-ui, sans-serif"
              style={{ pointerEvents: "none" }}
            >
              {obj.label}
            </text>
          </>
        )}

        {/* Generated seats (positions in feet, convert to px) */}
        {seats.map((seat, i) => (
          <circle
            key={`${obj.id}-s-${i}`}
            cx={ft2px(seat.x)} cy={ft2px(seat.y)}
            r={seatRadiusPx}
            fill={color} opacity={0.75}
            stroke={isSelected ? "#fff" : "none"}
            strokeWidth={isSelected ? 0.8 : 0}
            style={{ pointerEvents: "none" }}
          >
            <title>{obj.label} — Seat {seat.label}</title>
          </circle>
        ))}

        {/* Selection outline + resize handle */}
        {isSelected && (
          <>
            <rect
              x={px - 2} y={py - 2}
              width={pw + 4} height={ph + 4}
              rx={obj.type === "table" ? pw / 2 + 2 : 6}
              fill="none" stroke="#818cf8"
              strokeWidth={1.5} strokeDasharray="4 2"
              style={{ pointerEvents: "none" }}
            />
            <rect
              x={px + pw - 5} y={py + ph - 5}
              width={10} height={10} rx={2}
              fill="#818cf8" stroke="#312e81" strokeWidth={1}
              style={{ cursor: "nwse-resize" }}
              onMouseDown={(e) => handleResizeMouseDown(e, obj)}
            />
          </>
        )}
      </g>
    );
  };

  return (
    <div
      style={{
        flex: 1,
        position: "relative",
        overflow: "hidden",
        background: "#0c0c12",
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleCanvasDrop}
    >
      {/* Zoom controls */}
      <div
        style={{
          position: "absolute", bottom: 12, right: 12, zIndex: 10,
          display: "flex", gap: 4, background: "rgba(0,0,0,0.7)",
          borderRadius: 8, padding: 4,
        }}
      >
        <button onClick={() => setZoom((z) => Math.max(0.15, z - 0.1))}
          style={{ width: 26, height: 26, background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 4, color: "#e5e7eb", fontSize: 14, cursor: "pointer" }}>
          −
        </button>
        <span style={{ padding: "0 6px", lineHeight: "26px", fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
          {Math.round(zoom * 100)}%
        </span>
        <button onClick={() => setZoom((z) => Math.min(4, z + 0.1))}
          style={{ width: 26, height: 26, background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 4, color: "#e5e7eb", fontSize: 14, cursor: "pointer" }}>
          +
        </button>
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
          style={{ height: 26, padding: "0 8px", background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 4, color: "#e5e7eb", fontSize: 10, cursor: "pointer" }}>
          Reset
        </button>
      </div>

      {/* Info bar */}
      <div style={{ position: "absolute", bottom: 12, left: 12, zIndex: 10, fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
        {objects.length} object{objects.length !== 1 ? "s" : ""} · {roomWidthFt}×{roomHeightFt} ft · {ppf}px/ft · Alt+drag pan · Scroll zoom
      </div>

      <svg
        ref={svgRef}
        width="100%" height="100%"
        style={{ display: "block" }}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        {/* Hi-res viewBox for sharp rendering */}
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Canvas background */}
          <rect width={canvasW} height={canvasH} fill="#111118" rx={2} />

          {/* Grid overlay */}
          {gridLines}

          {/* Background image */}
          {backgroundUrl && (
            <image
              href={backgroundUrl}
              x={0} y={0} width={canvasW} height={canvasH}
              preserveAspectRatio="xMidYMid meet"
              opacity={0.35}
              style={{ pointerEvents: "none" }}
            />
          )}

          {/* Snap guide lines */}
          {snapGuides.map((guide, i) =>
            guide.type === "vertical" ? (
              <line
                key={`sg-${i}`}
                x1={ft2px(guide.position)} y1={0}
                x2={ft2px(guide.position)} y2={canvasH}
                stroke="#818cf8" strokeWidth={1}
                strokeDasharray="4 4" opacity={0.6}
              />
            ) : (
              <line
                key={`sg-${i}`}
                x1={0} y1={ft2px(guide.position)}
                x2={canvasW} y2={ft2px(guide.position)}
                stroke="#818cf8" strokeWidth={1}
                strokeDasharray="4 4" opacity={0.6}
              />
            )
          )}

          {/* Objects */}
          {objects.map(renderObject)}
        </g>
      </svg>
    </div>
  );
}
