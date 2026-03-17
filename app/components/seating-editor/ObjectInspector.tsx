"use client";

import { LayoutObject, PRICE_TIERS, PRICE_TIER_COLORS, inchesToFeet } from "@/lib/types/layout";

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

const unitStyle: React.CSSProperties = {
  fontSize: 10,
  color: "rgba(255,255,255,0.3)",
  marginLeft: 4,
};

export default function ObjectInspector({ selected, onUpdate, onDelete, onDuplicate }: Props) {
  if (!selected) {
    return (
      <div
        style={{
          width: 240, minWidth: 240,
          background: "rgba(255,255,255,0.02)",
          borderLeft: "1px solid rgba(255,255,255,0.08)",
          padding: 16,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 8,
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
        width: 240, minWidth: 240,
        background: "rgba(255,255,255,0.02)",
        borderLeft: "1px solid rgba(255,255,255,0.08)",
        padding: 16,
        display: "flex", flexDirection: "column", gap: 12,
        overflowY: "auto",
      }}
    >
      <h3
        style={{
          fontSize: 11, fontWeight: 700,
          color: "rgba(255,255,255,0.4)",
          textTransform: "uppercase", letterSpacing: 1, marginBottom: 0,
        }}
      >
        Object Inspector
      </h3>

      {/* Type badge */}
      <div
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "4px 10px",
          background: `${color}22`, border: `1px solid ${color}44`,
          borderRadius: 6, fontSize: 12, fontWeight: 600,
          color, alignSelf: "flex-start",
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

      {/* Table Diameter (inches) — tables only */}
      {selected.type === "table" && (
        <div>
          <div style={labelStyle}>Table Diameter<span style={unitStyle}>inches</span></div>
          <input
            type="number"
            style={fieldStyle}
            value={selected.diameter_inches || 60}
            min={12}
            max={240}
            step={6}
            onChange={(e) => {
              const inches = parseInt(e.target.value) || 60;
              const ft = inchesToFeet(inches);
              onUpdate(selected.id, {
                diameter_inches: inches,
                width: ft,
                height: ft,
              });
            }}
          />
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 2, display: "block" }}>
            = {((selected.diameter_inches || 60) / 12).toFixed(1)} ft
          </span>
        </div>
      )}

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

      {/* Width (ft) — hidden for tables that use diameter */}
      {selected.type !== "table" && (
        <div>
          <div style={labelStyle}>Width<span style={unitStyle}>ft</span></div>
          <input
            type="number"
            style={fieldStyle}
            value={parseFloat(selected.width.toFixed(1))}
            min={1}
            step={0.5}
            onChange={(e) => onUpdate(selected.id, { width: parseFloat(e.target.value) || 1 })}
          />
        </div>
      )}

      {/* Height (ft) — hidden for tables that use diameter */}
      {selected.type !== "table" && (
        <div>
          <div style={labelStyle}>Height<span style={unitStyle}>ft</span></div>
          <input
            type="number"
            style={fieldStyle}
            value={parseFloat(selected.height.toFixed(1))}
            min={1}
            step={0.5}
            onChange={(e) => onUpdate(selected.id, { height: parseFloat(e.target.value) || 1 })}
          />
        </div>
      )}

      {/* Rotation */}
      <div>
        <div style={labelStyle}>Rotation (°)</div>
        <input
          type="range"
          min={0} max={360}
          value={selected.rotation}
          onChange={(e) => onUpdate(selected.id, { rotation: parseInt(e.target.value) })}
          style={{ width: "100%" }}
        />
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{selected.rotation}°</span>
      </div>

      {/* Position (ft) */}
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={labelStyle}>X<span style={unitStyle}>ft</span></div>
          <input
            type="number"
            style={fieldStyle}
            value={parseFloat(selected.x.toFixed(1))}
            step={0.5}
            onChange={(e) => onUpdate(selected.id, { x: parseFloat(e.target.value) || 0 })}
          />
        </div>
        <div style={{ flex: 1 }}>
          <div style={labelStyle}>Y<span style={unitStyle}>ft</span></div>
          <input
            type="number"
            style={fieldStyle}
            value={parseFloat(selected.y.toFixed(1))}
            step={0.5}
            onChange={(e) => onUpdate(selected.id, { y: parseFloat(e.target.value) || 0 })}
          />
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button
          onClick={() => onDuplicate(selected.id)}
          style={{
            flex: 1, padding: "7px 0",
            background: "rgba(99,102,241,0.15)",
            border: "1px solid rgba(99,102,241,0.3)",
            borderRadius: 6, color: "#a5b4fc",
            fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}
        >
          Duplicate
        </button>
        <button
          onClick={() => onDelete(selected.id)}
          style={{
            flex: 1, padding: "7px 0",
            background: "rgba(239,68,68,0.15)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: 6, color: "#fca5a5",
            fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
