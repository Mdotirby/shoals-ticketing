"use client";

import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { LAYOUT_TOOLS, LayoutObjectType, PRICE_TIER_COLORS } from "@/lib/types/layout";

type Props = {
  onAddObject: (type: LayoutObjectType) => void;
  onAddMultipleTables: (count: number, seatCount: number, diameterInches: number) => void;
};

function DraggableTool({ type, label, icon, description, onAddObject }: {
  type: LayoutObjectType;
  label: string;
  icon: string;
  description: string;
  onAddObject: (type: LayoutObjectType) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `tool-${type}`,
    data: { type, source: "toolbar" },
  });

  const color = type === "stage" ? "#71717a" : PRICE_TIER_COLORS["standard"] || "#6366f1";

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onAddObject(type)}
      style={{
        padding: "10px 12px",
        background: isDragging ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 8,
        cursor: "grab",
        display: "flex",
        alignItems: "center",
        gap: 10,
        opacity: isDragging ? 0.5 : 1,
        transition: "background 0.15s",
        userSelect: "none",
      }}
    >
      <div
        style={{
          width: 36, height: 36,
          borderRadius: type === "table" ? "50%" : 6,
          background: `${color}22`, border: `2px solid ${color}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: type === "row" ? 11 : 14, color, flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#e5e7eb" }}>{label}</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{description}</div>
      </div>
    </div>
  );
}

export default function SeatingToolbar({ onAddObject, onAddMultipleTables }: Props) {
  const [showMulti, setShowMulti] = useState(false);
  const [multiCount, setMultiCount] = useState("10");
  const [multiSeats, setMultiSeats] = useState("8");
  const [multiDiameter, setMultiDiameter] = useState("60");

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "5px 8px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 5, color: "#e5e7eb", fontSize: 12, outline: "none",
  };

  return (
    <div
      style={{
        width: 220, minWidth: 220,
        background: "rgba(255,255,255,0.02)",
        borderRight: "1px solid rgba(255,255,255,0.08)",
        padding: 16,
        display: "flex", flexDirection: "column", gap: 8,
        overflowY: "auto",
      }}
    >
      <h3 style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
        Seating Tools
      </h3>
      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 8 }}>
        Drag or click to add objects
      </p>
      {LAYOUT_TOOLS.map((tool) => (
        <DraggableTool
          key={tool.type}
          type={tool.type}
          label={tool.label}
          icon={tool.icon}
          description={tool.description}
          onAddObject={onAddObject}
        />
      ))}

      {/* Add Multiple Tables */}
      <div style={{ marginTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12 }}>
        <button
          onClick={() => setShowMulti(!showMulti)}
          style={{
            width: "100%", padding: "8px 12px",
            background: showMulti ? "rgba(99,102,241,0.2)" : "rgba(99,102,241,0.08)",
            border: "1px solid rgba(99,102,241,0.25)",
            borderRadius: 8, color: "#a5b4fc",
            fontSize: 12, fontWeight: 600, cursor: "pointer",
            textAlign: "left",
          }}
        >
          {showMulti ? "▾" : "▸"} Add Multiple Tables
        </button>

        {showMulti && (
          <div style={{
            marginTop: 8, padding: 10,
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 8,
            display: "flex", flexDirection: "column", gap: 8,
          }}>
            <div>
              <label style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 3 }}>
                Number of tables
              </label>
              <input type="number" value={multiCount} onChange={(e) => setMultiCount(e.target.value)}
                min={1} max={100} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 3 }}>
                Seats per table
              </label>
              <input type="number" value={multiSeats} onChange={(e) => setMultiSeats(e.target.value)}
                min={1} max={20} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 3 }}>
                Table diameter (inches)
              </label>
              <input type="number" value={multiDiameter} onChange={(e) => setMultiDiameter(e.target.value)}
                min={24} max={120} step={6} style={inputStyle} />
            </div>
            <button
              onClick={() => {
                onAddMultipleTables(
                  parseInt(multiCount) || 1,
                  parseInt(multiSeats) || 8,
                  parseInt(multiDiameter) || 60
                );
                setShowMulti(false);
              }}
              style={{
                padding: "7px 0",
                background: "#6366f1", border: "none", borderRadius: 6,
                color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}
            >
              Add {multiCount || 1} Tables
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
