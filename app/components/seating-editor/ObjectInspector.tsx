"use client";

import { LayoutObject, PRICE_TIERS, PRICE_TIER_COLORS } from "@/lib/types/layout";

type Props = {
  selected: LayoutObject | null;
  onUpdate: (id: string, updates: Partial<LayoutObject>) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
};

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 10px",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 6,
  color: "#e5e7eb",
  fontSize: 13,
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "rgba(255,255,255,0.5)",
  marginBottom: 4,
};

export default function ObjectInspector({ selected, onUpdate, onDelete, onDuplicate }: Props) {
  if (!selected) {
    return (
      <div
        style={{
          width: 240,
          minWidth: 240,
          background: "rgba(255,255,255,0.02)",
          borderLeft: "1px solid rgba(255,255,255,0.08)",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", textAlign: "center" }}>
          Select an object on the canvas to edit its properties
        </p>
      </div>
    );
  }

  const color = selected.color || PRICE_TIER_COLORS[selected.price_tier] || "#6366f1";

  return (
    <div
      style={{
        width: 240,
        minWidth: 240,
        background: "rgba(255,255,255,0.02)",
        borderLeft: "1px solid rgba(255,255,255,0.08)",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        overflowY: "auto",
      }}
    >
      <h3
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "rgba(255,255,255,0.4)",
          textTransform: "uppercase",
          letterSpacing: 1,
          marginBottom: 0,
        }}
      >
        Object Inspector
      </h3>

      {/* Type badge */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          background: `${color}22`,
          border: `1px solid ${color}44`,
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 600,
          color,
          alignSelf: "flex-start",
        }}
      >
        {selected.type.replace("_", " ").toUpperCase()}
      </div>

      {/* Label */}
      <div>
        <div style={labelStyle}>Label</div>
        <input
          style={fieldStyle}
          value={selected.label}
          onChange={(e) => onUpdate(selected.id, { label: e.target.value })}
        />
      </div>

      {/* Price Tier */}
      <div>
        <div style={labelStyle}>Price Tier</div>
        <select
          style={fieldStyle}
          value={selected.price_tier}
          onChange={(e) => {
            const tier = e.target.value;
            onUpdate(selected.id, {
              price_tier: tier,
              color: PRICE_TIER_COLORS[tier] || selected.color,
            });
          }}
        >
          {PRICE_TIERS.map((t) => (
            <option key={t} value={t}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {/* Color */}
      <div>
        <div style={labelStyle}>Color</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="color"
            value={selected.color}
            onChange={(e) => onUpdate(selected.id, { color: e.target.value })}
            style={{ width: 32, height: 28, border: "none", background: "none", cursor: "pointer" }}
          />
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{selected.color}</span>
        </div>
      </div>

      {/* Seat Count — for tables and rows */}
      {(selected.type === "table" || selected.type === "row") && (
        <div>
          <div style={labelStyle}>Seat Count</div>
          <input
            type="number"
            style={fieldStyle}
            value={selected.seat_count}
            min={1}
            max={100}
            onChange={(e) => {
              const count = parseInt(e.target.value) || 1;
              onUpdate(selected.id, { seat_count: count, capacity: count });
            }}
          />
        </div>
      )}

      {/* Capacity — for GA sections */}
      {(selected.type === "ga_section" || selected.type === "custom_zone") && (
        <div>
          <div style={labelStyle}>Capacity</div>
          <input
            type="number"
            style={fieldStyle}
            value={selected.capacity}
            min={0}
            onChange={(e) => onUpdate(selected.id, { capacity: parseInt(e.target.value) || 0 })}
          />
        </div>
      )}

      {/* Width */}
      <div>
        <div style={labelStyle}>Width</div>
        <input
          type="number"
          style={fieldStyle}
          value={Math.round(selected.width)}
          min={20}
          onChange={(e) => onUpdate(selected.id, { width: parseInt(e.target.value) || 20 })}
        />
      </div>

      {/* Height */}
      <div>
        <div style={labelStyle}>Height</div>
        <input
          type="number"
          style={fieldStyle}
          value={Math.round(selected.height)}
          min={20}
          onChange={(e) => onUpdate(selected.id, { height: parseInt(e.target.value) || 20 })}
        />
      </div>

      {/* Rotation */}
      <div>
        <div style={labelStyle}>Rotation (°)</div>
        <input
          type="range"
          min={0}
          max={360}
          value={selected.rotation}
          onChange={(e) => onUpdate(selected.id, { rotation: parseInt(e.target.value) })}
          style={{ width: "100%" }}
        />
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{selected.rotation}°</span>
      </div>

      {/* Position */}
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={labelStyle}>X</div>
          <input
            type="number"
            style={fieldStyle}
            value={Math.round(selected.x)}
            onChange={(e) => onUpdate(selected.id, { x: parseInt(e.target.value) || 0 })}
          />
        </div>
        <div style={{ flex: 1 }}>
          <div style={labelStyle}>Y</div>
          <input
            type="number"
            style={fieldStyle}
            value={Math.round(selected.y)}
            onChange={(e) => onUpdate(selected.id, { y: parseInt(e.target.value) || 0 })}
          />
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button
          onClick={() => onDuplicate(selected.id)}
          style={{
            flex: 1,
            padding: "7px 0",
            background: "rgba(99,102,241,0.15)",
            border: "1px solid rgba(99,102,241,0.3)",
            borderRadius: 6,
            color: "#a5b4fc",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Duplicate
        </button>
        <button
          onClick={() => onDelete(selected.id)}
          style={{
            flex: 1,
            padding: "7px 0",
            background: "rgba(239,68,68,0.15)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: 6,
            color: "#fca5a5",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
