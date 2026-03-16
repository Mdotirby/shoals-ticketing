"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { LayoutObject } from "@/lib/types/layout";
import { generateSeats } from "@/lib/seating/seatGenerator";

type Props = {
  objects: LayoutObject[];
  backgroundUrl: string | null;
  selectedId: string | null;
  canvasWidth: number;
  canvasHeight: number;
  onSelectObject: (id: string | null) => void;
  onMoveObject: (id: string, x: number, y: number) => void;
  onResizeObject: (id: string, width: number, height: number) => void;
  onDropNewObject: (x: number, y: number) => void;
};

const GRID_SIZE = 20;
const SEAT_RADIUS = 8;

function snapToGrid(v: number): number {
  return Math.round(v / GRID_SIZE) * GRID_SIZE;
}

export default function SeatingCanvas({
  objects,
  backgroundUrl,
  selectedId,
  canvasWidth,
  canvasHeight,
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

  const getSvgPoint = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left - pan.x) / zoom,
        y: (e.clientY - rect.top - pan.y) / zoom,
      };
    },
    [zoom, pan]
  );

  // Handle drag start on object
  const handleObjectMouseDown = useCallback(
    (e: React.MouseEvent, obj: LayoutObject) => {
      e.stopPropagation();
      onSelectObject(obj.id);
      const pt = getSvgPoint(e);
      setDragging(obj.id);
      setDragOffset({ x: pt.x - obj.x, y: pt.y - obj.y });
    },
    [getSvgPoint, onSelectObject]
  );

  // Handle resize start
  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent, obj: LayoutObject) => {
      e.stopPropagation();
      const pt = getSvgPoint(e);
      setResizing(obj.id);
      setResizeStart({ x: pt.x, y: pt.y, w: obj.width, h: obj.height });
    },
    [getSvgPoint]
  );

  // Handle mouse move
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
        const pt = getSvgPoint(e);
        onMoveObject(dragging, snapToGrid(pt.x - dragOffset.x), snapToGrid(pt.y - dragOffset.y));
      }

      if (resizing) {
        const pt = getSvgPoint(e);
        const dx = pt.x - resizeStart.x;
        const dy = pt.y - resizeStart.y;
        const newW = Math.max(40, snapToGrid(resizeStart.w + dx));
        const newH = Math.max(40, snapToGrid(resizeStart.h + dy));
        onResizeObject(resizing, newW, newH);
      }
    },
    [dragging, resizing, dragOffset, resizeStart, getSvgPoint, onMoveObject, onResizeObject, isPanning, panStart]
  );

  const handleMouseUp = useCallback(() => {
    setDragging(null);
    setResizing(null);
    setIsPanning(false);
  }, []);

  // Pan with middle click or alt+click
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

  // Zoom with scroll
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom((z) => Math.max(0.2, Math.min(3, z + delta)));
    },
    []
  );

  // Canvas drop zone for new objects from toolbar
  const handleCanvasDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const pt = getSvgPoint(e as unknown as React.MouseEvent);
      onDropNewObject(snapToGrid(pt.x), snapToGrid(pt.y));
    },
    [getSvgPoint, onDropNewObject]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onSelectObject(null);
      if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(3, z + 0.1));
      if (e.key === "-") setZoom((z) => Math.max(0.2, z - 0.1));
      if (e.key === "0") { setZoom(1); setPan({ x: 0, y: 0 }); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onSelectObject]);

  const renderObject = (obj: LayoutObject) => {
    const isSelected = obj.id === selectedId;
    const color = obj.color || "#6366f1";
    const seats = generateSeats(obj);

    return (
      <g
        key={obj.id}
        transform={`rotate(${obj.rotation} ${obj.x + obj.width / 2} ${obj.y + obj.height / 2})`}
        style={{ cursor: dragging === obj.id ? "grabbing" : "grab" }}
        onMouseDown={(e) => handleObjectMouseDown(e, obj)}
      >
        {/* Object body */}
        {obj.type === "table" && (
          <>
            <ellipse
              cx={obj.x + obj.width / 2}
              cy={obj.y + obj.height / 2}
              rx={obj.width / 2}
              ry={obj.height / 2}
              fill={`${color}15`}
              stroke={color}
              strokeWidth={isSelected ? 2.5 : 1.5}
              strokeDasharray={isSelected ? "none" : "none"}
            />
            <text
              x={obj.x + obj.width / 2}
              y={obj.y + obj.height / 2 + 4}
              fill={color}
              fontSize={11}
              fontWeight={700}
              textAnchor="middle"
              fontFamily="system-ui, sans-serif"
              style={{ pointerEvents: "none" }}
            >
              {obj.label}
            </text>
          </>
        )}

        {obj.type === "row" && (
          <>
            <rect
              x={obj.x}
              y={obj.y}
              width={obj.width}
              height={obj.height}
              rx={6}
              fill={`${color}08`}
              stroke={color}
              strokeWidth={isSelected ? 2.5 : 1}
              strokeDasharray={isSelected ? "none" : "4 2"}
            />
            <text
              x={obj.x + 6}
              y={obj.y - 4}
              fill={color}
              fontSize={10}
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
              x={obj.x}
              y={obj.y}
              width={obj.width}
              height={obj.height}
              rx={8}
              fill={`${color}18`}
              stroke={color}
              strokeWidth={isSelected ? 2.5 : 1.5}
            />
            <text
              x={obj.x + obj.width / 2}
              y={obj.y + obj.height / 2 - 4}
              fill={color}
              fontSize={12}
              fontWeight={700}
              textAnchor="middle"
              fontFamily="system-ui, sans-serif"
              style={{ pointerEvents: "none" }}
            >
              {obj.label}
            </text>
            <text
              x={obj.x + obj.width / 2}
              y={obj.y + obj.height / 2 + 12}
              fill={`${color}99`}
              fontSize={10}
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
              x={obj.x}
              y={obj.y}
              width={obj.width}
              height={obj.height}
              rx={4}
              fill={`${color}25`}
              stroke={color}
              strokeWidth={isSelected ? 2.5 : 2}
            />
            <text
              x={obj.x + obj.width / 2}
              y={obj.y + obj.height / 2 + 5}
              fill="#e5e7eb"
              fontSize={14}
              fontWeight={700}
              textAnchor="middle"
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
              x={obj.x}
              y={obj.y}
              width={obj.width}
              height={obj.height}
              rx={6}
              fill={`${color}12`}
              stroke={color}
              strokeWidth={isSelected ? 2.5 : 1.5}
              strokeDasharray="6 3"
            />
            <text
              x={obj.x + obj.width / 2}
              y={obj.y + obj.height / 2 + 4}
              fill={color}
              fontSize={11}
              fontWeight={600}
              textAnchor="middle"
              fontFamily="system-ui, sans-serif"
              style={{ pointerEvents: "none" }}
            >
              {obj.label}
            </text>
          </>
        )}

        {/* Generated seats */}
        {seats.map((seat, i) => (
          <circle
            key={`${obj.id}-seat-${i}`}
            cx={seat.x}
            cy={seat.y}
            r={SEAT_RADIUS}
            fill={color}
            opacity={0.75}
            stroke={isSelected ? "#fff" : "none"}
            strokeWidth={isSelected ? 1 : 0}
            style={{ pointerEvents: "none" }}
          >
            <title>
              {obj.label} — Seat {seat.label}
            </title>
          </circle>
        ))}

        {/* Selection outline + resize handle */}
        {isSelected && (
          <>
            <rect
              x={obj.x - 3}
              y={obj.y - 3}
              width={obj.width + 6}
              height={obj.height + 6}
              rx={obj.type === "table" ? obj.width / 2 + 3 : 8}
              fill="none"
              stroke="#818cf8"
              strokeWidth={1.5}
              strokeDasharray="4 2"
              style={{ pointerEvents: "none" }}
            />
            {/* Resize handle (bottom-right) */}
            <rect
              x={obj.x + obj.width - 6}
              y={obj.y + obj.height - 6}
              width={12}
              height={12}
              rx={2}
              fill="#818cf8"
              stroke="#312e81"
              strokeWidth={1}
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
        background: "#0f0f14",
        borderRadius: 0,
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleCanvasDrop}
    >
      {/* Zoom controls */}
      <div
        style={{
          position: "absolute",
          bottom: 16,
          right: 16,
          zIndex: 10,
          display: "flex",
          gap: 4,
          background: "rgba(0,0,0,0.6)",
          borderRadius: 8,
          padding: 4,
        }}
      >
        <button
          onClick={() => setZoom((z) => Math.max(0.2, z - 0.1))}
          style={{
            width: 28,
            height: 28,
            background: "rgba(255,255,255,0.08)",
            border: "none",
            borderRadius: 4,
            color: "#e5e7eb",
            fontSize: 16,
            cursor: "pointer",
          }}
        >
          −
        </button>
        <span
          style={{
            padding: "0 8px",
            lineHeight: "28px",
            fontSize: 12,
            color: "rgba(255,255,255,0.5)",
          }}
        >
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom((z) => Math.min(3, z + 0.1))}
          style={{
            width: 28,
            height: 28,
            background: "rgba(255,255,255,0.08)",
            border: "none",
            borderRadius: 4,
            color: "#e5e7eb",
            fontSize: 16,
            cursor: "pointer",
          }}
        >
          +
        </button>
        <button
          onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
          style={{
            height: 28,
            padding: "0 8px",
            background: "rgba(255,255,255,0.08)",
            border: "none",
            borderRadius: 4,
            color: "#e5e7eb",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          Reset
        </button>
      </div>

      {/* Object count */}
      <div
        style={{
          position: "absolute",
          bottom: 16,
          left: 16,
          zIndex: 10,
          fontSize: 11,
          color: "rgba(255,255,255,0.3)",
        }}
      >
        {objects.length} object{objects.length !== 1 ? "s" : ""} • Alt+drag to pan • Scroll to zoom
      </div>

      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        style={{ display: "block" }}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Grid pattern */}
          <defs>
            <pattern id="grid" width={GRID_SIZE} height={GRID_SIZE} patternUnits="userSpaceOnUse">
              <path
                d={`M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}`}
                fill="none"
                stroke="rgba(255,255,255,0.03)"
                strokeWidth={0.5}
              />
            </pattern>
          </defs>
          <rect width={canvasWidth} height={canvasHeight} fill="#111118" rx={4} />
          <rect width={canvasWidth} height={canvasHeight} fill="url(#grid)" />

          {/* Background image layer */}
          {backgroundUrl && (
            <image
              href={backgroundUrl}
              x={0}
              y={0}
              width={canvasWidth}
              height={canvasHeight}
              preserveAspectRatio="xMidYMid meet"
              opacity={0.4}
              style={{ pointerEvents: "none" }}
            />
          )}

          {/* Objects layer */}
          {objects.map(renderObject)}
        </g>
      </svg>
    </div>
  );
}
