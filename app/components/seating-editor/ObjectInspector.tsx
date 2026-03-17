"use client";

import { LayoutObject, PRICE_TIERS, PRICE_TIER_COLORS, inchesToFeet } from "@/lib/types/layout";

type Props = {
  selected: LayoutObject[];
  onUpdate: (id: string, updates: Partial<LayoutObject>) => void;
  onUpdateSelected: (updates: Partial<LayoutObject>) => void;
  onDelete: (id: string) => void;
  onDeleteSelected: () => void;
  onDuplicate: (id: string) => void;
  onAlign: (alignment: string) => void;
};

const fieldStyle: React.CSSProperties = {
  width: "100%", padding: "6px 10px",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 6, color: "#e5e7eb", fontSize: 13, outline: "none",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600,
  color: "rgba(255,255,255,0.5)", marginBottom: 4,
};

const unitStyle: React.CSSProperties = {
  fontSize: 10, color: "rgba(255,255,255,0.3)", marginLeft: 4,
};

/** Photoshop-style align button */
function AlignBtn({ icon, title, onClick }: { icon: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 28, height: 28,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 4, cursor: "pointer",
        color: "rgba(255,255,255,0.6)", fontSize: 11,
      }}
    >
      {icon}
    </button>
  );
}

/** SVG icons for alignment buttons (Photoshop-style) */
function AlignIcon({ type }: { type: string }) {
  const s = { stroke: "currentColor", strokeWidth: 1.5, fill: "none" };
  const fs = { fill: "currentColor" };
  switch (type) {
    case "align-left":
      return <svg width="14" height="14" viewBox="0 0 14 14"><line x1="2" y1="1" x2="2" y2="13" {...s} /><rect x="4" y="3" width="8" height="3" rx="0.5" {...fs} /><rect x="4" y="8" width="5" height="3" rx="0.5" {...fs} /></svg>;
    case "align-center-h":
      return <svg width="14" height="14" viewBox="0 0 14 14"><line x1="7" y1="1" x2="7" y2="13" {...s} /><rect x="2" y="3" width="10" height="3" rx="0.5" {...fs} /><rect x="3.5" y="8" width="7" height="3" rx="0.5" {...fs} /></svg>;
    case "align-right":
      return <svg width="14" height="14" viewBox="0 0 14 14"><line x1="12" y1="1" x2="12" y2="13" {...s} /><rect x="2" y="3" width="8" height="3" rx="0.5" {...fs} /><rect x="5" y="8" width="5" height="3" rx="0.5" {...fs} /></svg>;
    case "align-top":
      return <svg width="14" height="14" viewBox="0 0 14 14"><line x1="1" y1="2" x2="13" y2="2" {...s} /><rect x="3" y="4" width="3" height="8" rx="0.5" {...fs} /><rect x="8" y="4" width="3" height="5" rx="0.5" {...fs} /></svg>;
    case "align-center-v":
      return <svg width="14" height="14" viewBox="0 0 14 14"><line x1="1" y1="7" x2="13" y2="7" {...s} /><rect x="3" y="2" width="3" height="10" rx="0.5" {...fs} /><rect x="8" y="3.5" width="3" height="7" rx="0.5" {...fs} /></svg>;
    case "align-bottom":
      return <svg width="14" height="14" viewBox="0 0 14 14"><line x1="1" y1="12" x2="13" y2="12" {...s} /><rect x="3" y="2" width="3" height="8" rx="0.5" {...fs} /><rect x="8" y="5" width="3" height="5" rx="0.5" {...fs} /></svg>;
    case "distribute-h":
      return <svg width="14" height="14" viewBox="0 0 14 14"><line x1="1" y1="1" x2="1" y2="13" {...s} /><line x1="13" y1="1" x2="13" y2="13" {...s} /><rect x="4" y="4" width="2" height="6" rx="0.5" {...fs} /><rect x="8" y="4" width="2" height="6" rx="0.5" {...fs} /></svg>;
    case "distribute-v":
      return <svg width="14" height="14" viewBox="0 0 14 14"><line x1="1" y1="1" x2="13" y2="1" {...s} /><line x1="1" y1="13" x2="13" y2="13" {...s} /><rect x="4" y="4" width="6" height="2" rx="0.5" {...fs} /><rect x="4" y="8" width="6" height="2" rx="0.5" {...fs} /></svg>;
    default:
      return null;
  }
}

export default function ObjectInspector({ selected, onUpdate, onUpdateSelected, onDelete, onDeleteSelected, onDuplicate, onAlign }: Props) {
  const multiSelect = selected.length > 1;
  const single = selected.length === 1 ? selected[0] : null;

  if (selected.length === 0) {
    return (
      <div style={{ width: 240, minWidth: 240, background: "rgba(255,255,255,0.02)", borderLeft: "1px solid rgba(255,255,255,0.08)", padding: 16, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", textAlign: "center" }}>
          Select an object on the canvas to edit its properties
        </p>
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", textAlign: "center" }}>
          Shift+click or drag to multi-select
        </p>
      </div>
    );
  }

  // Multi-select view
  if (multiSelect) {
    const allTables = selected.every((s) => s.type === "table");
    const allRows = selected.every((s) => s.type === "row");
    const allSameType = selected.every((s) => s.type === selected[0].type);

    return (
      <div style={{ width: 240, minWidth: 240, background: "rgba(255,255,255,0.02)", borderLeft: "1px solid rgba(255,255,255,0.08)", padding: 16, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
        <h3 style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 0 }}>
          Multi-Select
        </h3>
        <div style={{ padding: "6px 10px", background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)", borderRadius: 6, fontSize: 12, color: "#a5b4fc" }}>
          {selected.length} objects selected
        </div>

        {/* Photoshop-style Align Buttons */}
        <div>
          <div style={labelStyle}>Align (center reference)</div>
          <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
            <AlignBtn icon={<AlignIcon type="align-left" />} title="Align Left" onClick={() => onAlign("align-left")} />
            <AlignBtn icon={<AlignIcon type="align-center-h" />} title="Align Center Horizontal" onClick={() => onAlign("align-center-h")} />
            <AlignBtn icon={<AlignIcon type="align-right" />} title="Align Right" onClick={() => onAlign("align-right")} />
            <div style={{ width: 8 }} />
            <AlignBtn icon={<AlignIcon type="align-top" />} title="Align Top" onClick={() => onAlign("align-top")} />
            <AlignBtn icon={<AlignIcon type="align-center-v" />} title="Align Center Vertical" onClick={() => onAlign("align-center-v")} />
            <AlignBtn icon={<AlignIcon type="align-bottom" />} title="Align Bottom" onClick={() => onAlign("align-bottom")} />
          </div>
          {selected.length >= 3 && (
            <div style={{ display: "flex", gap: 4 }}>
              <AlignBtn icon={<AlignIcon type="distribute-h" />} title="Distribute Horizontally" onClick={() => onAlign("distribute-h")} />
              <AlignBtn icon={<AlignIcon type="distribute-v" />} title="Distribute Vertically" onClick={() => onAlign("distribute-v")} />
            </div>
          )}
        </div>

        {/* Bulk Price Tier */}
        <div>
          <div style={labelStyle}>Price Tier (all)</div>
          <select style={fieldStyle} value="" onChange={(e) => {
            const tier = e.target.value;
            if (tier) onUpdateSelected({ price_tier: tier, color: PRICE_TIER_COLORS[tier] || "#6366f1" });
          }}>
            <option value="">— Change all —</option>
            {PRICE_TIERS.map((t) => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
        </div>

        {/* Bulk Seat Count — if all tables or all rows */}
        {(allTables || allRows) && (
          <div>
            <div style={labelStyle}>Seat Count (all)</div>
            <input type="number" style={fieldStyle} placeholder="Set for all" min={1} max={100}
              onChange={(e) => {
                const count = parseInt(e.target.value);
                if (count > 0) onUpdateSelected({ seat_count: count, capacity: count });
              }} />
          </div>
        )}

        {/* Bulk Diameter — if all tables */}
        {allTables && (
          <div>
            <div style={labelStyle}>Table Diameter<span style={unitStyle}>inches (all)</span></div>
            <input type="number" style={fieldStyle} placeholder="Set for all" min={12} max={240} step={6}
              onChange={(e) => {
                const inches = parseInt(e.target.value);
                if (inches > 0) {
                  const ft = inchesToFeet(inches);
                  onUpdateSelected({ diameter_inches: inches, width: ft, height: ft });
                }
              }} />
          </div>
        )}

        {/* Bulk Size — non-table same type */}
        {allSameType && !allTables && (
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>Width<span style={unitStyle}>ft</span></div>
              <input type="number" style={fieldStyle} placeholder="All" min={1} step={0.5}
                onChange={(e) => { const v = parseFloat(e.target.value); if (v > 0) onUpdateSelected({ width: v }); }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>Height<span style={unitStyle}>ft</span></div>
              <input type="number" style={fieldStyle} placeholder="All" min={1} step={0.5}
                onChange={(e) => { const v = parseFloat(e.target.value); if (v > 0) onUpdateSelected({ height: v }); }} />
            </div>
          </div>
        )}

        {/* Delete All */}
        <button onClick={onDeleteSelected}
          style={{ padding: "7px 0", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, color: "#fca5a5", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          Delete {selected.length} Objects
        </button>
      </div>
    );
  }

  // Single select view
  const obj = single!;
  const color = obj.color || PRICE_TIER_COLORS[obj.price_tier] || "#6366f1";

  return (
    <div style={{ width: 240, minWidth: 240, background: "rgba(255,255,255,0.02)", borderLeft: "1px solid rgba(255,255,255,0.08)", padding: 16, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
      <h3 style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 0 }}>Object Inspector</h3>

      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", background: `${color}22`, border: `1px solid ${color}44`, borderRadius: 6, fontSize: 12, fontWeight: 600, color, alignSelf: "flex-start" }}>
        {obj.type.replace("_", " ").toUpperCase()}
      </div>

      {/* Label */}
      <div>
        <div style={labelStyle}>Label</div>
        <input style={fieldStyle} value={obj.label} onChange={(e) => onUpdate(obj.id, { label: e.target.value })} />
      </div>

      {/* Price Tier */}
      <div>
        <div style={labelStyle}>Price Tier</div>
        <select style={fieldStyle} value={obj.price_tier}
          onChange={(e) => { const tier = e.target.value; onUpdate(obj.id, { price_tier: tier, color: PRICE_TIER_COLORS[tier] || obj.color }); }}>
          {PRICE_TIERS.map((t) => (<option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>))}
        </select>
      </div>

      {/* Color */}
      <div>
        <div style={labelStyle}>Color</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="color" value={obj.color} onChange={(e) => onUpdate(obj.id, { color: e.target.value })}
            style={{ width: 32, height: 28, border: "none", background: "none", cursor: "pointer" }} />
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{obj.color}</span>
        </div>
      </div>

      {/* Table Diameter */}
      {obj.type === "table" && (
        <div>
          <div style={labelStyle}>Table Diameter<span style={unitStyle}>inches</span></div>
          <input type="number" style={fieldStyle} value={obj.diameter_inches || 60} min={12} max={240} step={6}
            onChange={(e) => { const inches = parseInt(e.target.value) || 60; const ft = inchesToFeet(inches); onUpdate(obj.id, { diameter_inches: inches, width: ft, height: ft }); }} />
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 2, display: "block" }}>= {((obj.diameter_inches || 60) / 12).toFixed(1)} ft</span>
        </div>
      )}

      {/* Seat Count */}
      {(obj.type === "table" || obj.type === "row") && (
        <div>
          <div style={labelStyle}>Seat Count</div>
          <input type="number" style={fieldStyle} value={obj.seat_count} min={1} max={100}
            onChange={(e) => { const count = parseInt(e.target.value) || 1; onUpdate(obj.id, { seat_count: count, capacity: count }); }} />
        </div>
      )}

      {/* Capacity */}
      {(obj.type === "ga_section" || obj.type === "custom_zone") && (
        <div>
          <div style={labelStyle}>Capacity</div>
          <input type="number" style={fieldStyle} value={obj.capacity} min={0}
            onChange={(e) => onUpdate(obj.id, { capacity: parseInt(e.target.value) || 0 })} />
        </div>
      )}

      {/* Width/Height — non-tables */}
      {obj.type !== "table" && (
        <>
          <div>
            <div style={labelStyle}>Width<span style={unitStyle}>ft</span></div>
            <input type="number" style={fieldStyle} value={parseFloat(obj.width.toFixed(1))} min={1} step={0.5}
              onChange={(e) => onUpdate(obj.id, { width: parseFloat(e.target.value) || 1 })} />
          </div>
          <div>
            <div style={labelStyle}>Height<span style={unitStyle}>ft</span></div>
            <input type="number" style={fieldStyle} value={parseFloat(obj.height.toFixed(1))} min={1} step={0.5}
              onChange={(e) => onUpdate(obj.id, { height: parseFloat(e.target.value) || 1 })} />
          </div>
        </>
      )}

      {/* Rotation */}
      <div>
        <div style={labelStyle}>Rotation (°)</div>
        <input type="range" min={0} max={360} value={obj.rotation} onChange={(e) => onUpdate(obj.id, { rotation: parseInt(e.target.value) })} style={{ width: "100%" }} />
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{obj.rotation}°</span>
      </div>

      {/* Position */}
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={labelStyle}>X<span style={unitStyle}>ft</span></div>
          <input type="number" style={fieldStyle} value={parseFloat(obj.x.toFixed(1))} step={0.5}
            onChange={(e) => onUpdate(obj.id, { x: parseFloat(e.target.value) || 0 })} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={labelStyle}>Y<span style={unitStyle}>ft</span></div>
          <input type="number" style={fieldStyle} value={parseFloat(obj.y.toFixed(1))} step={0.5}
            onChange={(e) => onUpdate(obj.id, { y: parseFloat(e.target.value) || 0 })} />
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button onClick={() => onDuplicate(obj.id)}
          style={{ flex: 1, padding: "7px 0", background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 6, color: "#a5b4fc", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          Duplicate
        </button>
        <button onClick={() => onDelete(obj.id)}
          style={{ flex: 1, padding: "7px 0", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, color: "#fca5a5", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          Delete
        </button>
      </div>
    </div>
  );
}
