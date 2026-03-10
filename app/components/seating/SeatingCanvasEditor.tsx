"use client";

import { useState, useRef, useCallback, useEffect } from "react";

// ── Types ──

export type CanvasItem = {
  id: string;
  type: "row-group" | "table";
  label: string;
  color: string;
  x: number;
  y: number;
  rotation: number;
  seatCount: number;
  rows?: { label: string; seats: number }[];
};

type Props = {
  items: CanvasItem[];
  onItemsChange: (items: CanvasItem[]) => void;
};

// ── Helpers ──

function getClientPos(e: React.MouseEvent | React.TouchEvent) {
  if ("touches" in e) {
    const t = e.touches[0] || (e as React.TouchEvent).changedTouches[0];
    return { clientX: t.clientX, clientY: t.clientY };
  }
  return { clientX: (e as React.MouseEvent).clientX, clientY: (e as React.MouseEvent).clientY };
}

function itemSize(item: CanvasItem): { w: number; h: number } {
  if (item.type === "table") {
    const base = 60 + Math.min(item.seatCount, 12) * 4;
    return { w: base, h: base };
  }
  // row-group: width based on max seats in a row, height based on row count
  const maxSeats = item.rows
    ? Math.max(...item.rows.map((r) => r.seats), 8)
    : Math.max(item.seatCount / 4, 8);
  const rowCount = item.rows ? item.rows.length : Math.ceil(item.seatCount / 10);
  return {
    w: Math.max(100, maxSeats * 14 + 40),
    h: Math.max(60, rowCount * 18 + 40),
  };
}

// ── Component ──

export default function SeatingCanvasEditor({ items, onItemsChange }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{
    id: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Track drag distance to distinguish click vs drag
  const dragDistanceRef = useRef(0);
  const didDragRef = useRef(false);
  const activeItemIdRef = useRef<string | null>(null);

  // ── Drag handlers ──

  const handlePointerDown = useCallback(
    (e: React.MouseEvent | React.TouchEvent, id: string) => {
      e.preventDefault();
      e.stopPropagation();
      const { clientX, clientY } = getClientPos(e);
      const item = itemsRef.current.find((i) => i.id === id);
      if (!item || !canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      dragDistanceRef.current = 0;
      didDragRef.current = false;
      activeItemIdRef.current = id;
      setDragging({
        id,
        offsetX: clientX - rect.left - item.x,
        offsetY: clientY - rect.top - item.y,
      });
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!dragging || !canvasRef.current) return;
      e.preventDefault();

      const pos =
        "touches" in e
          ? { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY }
          : { clientX: (e as MouseEvent).clientX, clientY: (e as MouseEvent).clientY };

      const rect = canvasRef.current.getBoundingClientRect();
      const newX = Math.max(0, pos.clientX - rect.left - dragging.offsetX);
      const newY = Math.max(0, pos.clientY - rect.top - dragging.offsetY);

      const item = itemsRef.current.find((i) => i.id === dragging.id);
      if (item) {
        const dx = Math.abs(Math.round(newX) - item.x);
        const dy = Math.abs(Math.round(newY) - item.y);
        dragDistanceRef.current += dx + dy;
        if (dragDistanceRef.current > 5) didDragRef.current = true;
      }

      const updated = itemsRef.current.map((i) =>
        i.id === dragging.id ? { ...i, x: Math.round(newX), y: Math.round(newY) } : i
      );
      onItemsChange(updated);
    },
    [dragging, onItemsChange]
  );

  const handlePointerUp = useCallback(() => {
    const itemId = activeItemIdRef.current;
    if (!didDragRef.current && itemId) {
      // It was a click, not a drag — toggle selection
      setSelectedId((prev) => (prev === itemId ? null : itemId));
    }
    setDragging(null);
    activeItemIdRef.current = null;
  }, []);

  useEffect(() => {
    if (!dragging) return;
    window.addEventListener("mousemove", handlePointerMove, { passive: false });
    window.addEventListener("mouseup", handlePointerUp);
    window.addEventListener("touchmove", handlePointerMove, { passive: false });
    window.addEventListener("touchend", handlePointerUp);
    return () => {
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", handlePointerUp);
      window.removeEventListener("touchmove", handlePointerMove);
      window.removeEventListener("touchend", handlePointerUp);
    };
  }, [dragging, handlePointerMove, handlePointerUp]);

  // ── Rotation ──

  const rotate = (deg: number) => {
    if (!selectedId) return;
    const updated = items.map((item) =>
      item.id === selectedId
        ? { ...item, rotation: (item.rotation + deg + 360) % 360 }
        : item
    );
    onItemsChange(updated);
  };

  // ── Deselect on canvas click ──

  const handleCanvasClick = () => {
    if (!dragging) setSelectedId(null);
  };

  // ── Render ──

  const selectedItem = items.find((i) => i.id === selectedId);

  return (
    <div style={{ position: "relative" }}>
      {/* Toolbar */}
      {selectedItem && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 8,
            padding: "6px 12px",
            borderRadius: 8,
            background: "rgba(13,15,26,0.95)",
            border: "1px solid rgba(208,194,144,0.25)",
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 3,
              background: selectedItem.color,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              color: "#d0c290",
              fontSize: 12,
              fontWeight: 600,
              marginRight: 8,
            }}
          >
            {selectedItem.label}
          </span>

          <button
            onClick={() => rotate(-15)}
            style={toolbarBtnStyle}
            title="Rotate left 15°"
          >
            ↺ −15°
          </button>
          <button
            onClick={() => rotate(15)}
            style={toolbarBtnStyle}
            title="Rotate right 15°"
          >
            ↻ +15°
          </button>

          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, marginLeft: 4 }}>
            {selectedItem.rotation}°
          </span>

          <button
            onClick={() => setSelectedId(null)}
            style={{
              ...toolbarBtnStyle,
              marginLeft: "auto",
              color: "rgba(255,255,255,0.5)",
            }}
          >
            Deselect
          </button>
        </div>
      )}

      {/* Canvas */}
      <div
        ref={canvasRef}
        onClick={handleCanvasClick}
        style={{
          position: "relative",
          minHeight: 500,
          borderRadius: 10,
          overflow: "auto",
          background: "#0d0f1a",
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
          border: "1px solid rgba(255,255,255,0.08)",
          cursor: dragging ? "grabbing" : "default",
          touchAction: "none",
          userSelect: "none",
        }}
      >
        {items.map((item) => {
          const size = itemSize(item);
          const isSelected = item.id === selectedId;
          const isDraggingThis = dragging?.id === item.id;

          return (
            <div
              key={item.id}
              onMouseDown={(e) => handlePointerDown(e, item.id)}
              onTouchStart={(e) => handlePointerDown(e, item.id)}
              style={{
                position: "absolute",
                left: item.x,
                top: item.y,
                width: size.w,
                height: size.h,
                transform: `rotate(${item.rotation}deg)`,
                transformOrigin: "center center",
                cursor: isDraggingThis ? "grabbing" : "grab",
                zIndex: isDraggingThis ? 50 : isSelected ? 40 : 10,
                transition: isDraggingThis ? "none" : "box-shadow 0.15s",
                borderRadius: item.type === "table" ? "50%" : 8,
                border: isSelected
                  ? "2px solid #d0c290"
                  : "1.5px solid " + item.color + "60",
                boxShadow: isSelected
                  ? "0 0 12px rgba(208,194,144,0.25)"
                  : "none",
                background:
                  item.type === "table"
                    ? item.color + "18"
                    : item.color + "10",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              {item.type === "table" ? (
                <TableVisual item={item} />
              ) : (
                <RowGroupVisual item={item} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Sub-components ──

function TableVisual({ item }: { item: CanvasItem }) {
  return (
    <>
      <span
        style={{
          color: item.color,
          fontSize: 11,
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        {item.label}
      </span>
      <span
        style={{
          color: "rgba(255,255,255,0.4)",
          fontSize: 9,
          marginTop: 2,
        }}
      >
        {item.seatCount} seats
      </span>
      {/* Seat dots around edge */}
      {Array.from({ length: item.seatCount }).map((_, i) => {
        const angle = (2 * Math.PI * i) / item.seatCount - Math.PI / 2;
        const size = itemSize(item);
        const orbitX = size.w / 2 - 8;
        const orbitY = size.h / 2 - 8;
        const cx = size.w / 2 + orbitX * Math.cos(angle) - 4;
        const cy = size.h / 2 + orbitY * Math.sin(angle) - 4;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: cx,
              top: cy,
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: item.color,
              opacity: 0.5,
            }}
          />
        );
      })}
    </>
  );
}

function RowGroupVisual({ item }: { item: CanvasItem }) {
  const rows = item.rows || [{ label: "A", seats: item.seatCount }];
  return (
    <div style={{ padding: 6, width: "100%" }}>
      <div
        style={{
          color: item.color,
          fontSize: 10,
          fontWeight: 700,
          textAlign: "center",
          marginBottom: 4,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {item.label}
      </div>
      {rows.slice(0, 8).map((row, rIdx) => (
        <div
          key={rIdx}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            marginBottom: 1,
            justifyContent: "center",
          }}
        >
          <span
            style={{
              color: "rgba(255,255,255,0.25)",
              fontSize: 7,
              width: 12,
              textAlign: "right",
              marginRight: 2,
              flexShrink: 0,
            }}
          >
            {row.label}
          </span>
          {Array.from({ length: Math.min(row.seats, 20) }).map((_, sIdx) => (
            <div
              key={sIdx}
              style={{
                width: 6,
                height: 6,
                borderRadius: 1.5,
                background: item.color,
                opacity: 0.45,
              }}
            />
          ))}
          {row.seats > 20 && (
            <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 6 }}>
              +{row.seats - 20}
            </span>
          )}
        </div>
      ))}
      {rows.length > 8 && (
        <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 7, textAlign: "center" }}>
          +{rows.length - 8} more rows
        </div>
      )}
      <div
        style={{
          color: "rgba(255,255,255,0.3)",
          fontSize: 8,
          textAlign: "center",
          marginTop: 2,
        }}
      >
        {item.seatCount} seats
      </div>
    </div>
  );
}

// ── Styles ──

const toolbarBtnStyle: React.CSSProperties = {
  padding: "3px 8px",
  borderRadius: 5,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.05)",
  color: "rgba(255,255,255,0.7)",
  fontSize: 11,
  cursor: "pointer",
  fontFamily: "inherit",
  lineHeight: 1.4,
};
