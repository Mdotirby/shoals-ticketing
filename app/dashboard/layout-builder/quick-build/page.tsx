"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import SeatMap from "@/app/components/seating/SeatMap";
import { quickBuild, getDefaultConfig, type QuickBuildConfig, type QuickBuildResult, type EventType, type StagePosition } from "@/lib/seating/quickBuild";
import type { SectionFull } from "@/lib/seating/types";

const fieldStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, color: "#e5e7eb", fontSize: 13, outline: "none",
};
const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 4, display: "block",
};
const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const,
  letterSpacing: 1, margin: "16px 0 8px", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12,
};

export default function QuickBuildPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  // Config state
  const [layoutName, setLayoutName] = useState("New Event Layout");
  const [eventType, setEventType] = useState<EventType>("tables_ga");
  const [roomW, setRoomW] = useState("100");
  const [roomD, setRoomD] = useState("80");
  const [stagePos, setStagePos] = useState<StagePosition>("top");

  // Tables
  const [tblCount, setTblCount] = useState("15");
  const [tblSeats, setTblSeats] = useState("8");
  const [tblDiam, setTblDiam] = useState("72");
  const [tblSpacing, setTblSpacing] = useState("10");
  const [tblPrice, setTblPrice] = useState("50");

  // Rows
  const [rowCount, setRowCount] = useState("15");
  const [rowSeats, setRowSeats] = useState("20");
  const [rowSpacing, setRowSpacing] = useState("3");
  const [seatSpacing, setSeatSpacing] = useState("1.8");
  const [rowPrice, setRowPrice] = useState("25");

  // GA
  const [gaCap, setGaCap] = useState("200");
  const [gaPrice, setGaPrice] = useState("20");

  // Apply defaults when event type changes
  const handleTypeChange = (type: EventType) => {
    setEventType(type);
    const d = getDefaultConfig(type);
    if (d.numberOfTables !== undefined) setTblCount(String(d.numberOfTables));
    if (d.seatsPerTable !== undefined) setTblSeats(String(d.seatsPerTable));
    if (d.tableDiameterInches !== undefined) setTblDiam(String(d.tableDiameterInches));
    if (d.tableSpacingFt !== undefined) setTblSpacing(String(d.tableSpacingFt));
    if (d.tablePriceCents !== undefined) setTblPrice(String(d.tablePriceCents / 100));
    if (d.numberOfRows !== undefined) setRowCount(String(d.numberOfRows));
    if (d.seatsPerRow !== undefined) setRowSeats(String(d.seatsPerRow));
    if (d.rowSpacingFt !== undefined) setRowSpacing(String(d.rowSpacingFt));
    if (d.seatSpacingFt !== undefined) setSeatSpacing(String(d.seatSpacingFt));
    if (d.rowPriceCents !== undefined) setRowPrice(String(d.rowPriceCents / 100));
    if (d.gaCapacity !== undefined) setGaCap(String(d.gaCapacity));
    if (d.gaPriceCents !== undefined) setGaPrice(String(d.gaPriceCents / 100));
  };

  // Build config from state
  const config: QuickBuildConfig = useMemo(() => ({
    layoutName,
    eventType,
    roomWidthFt: parseFloat(roomW) || 100,
    roomDepthFt: parseFloat(roomD) || 80,
    stagePosition: stagePos,
    numberOfTables: parseInt(tblCount) || 0,
    seatsPerTable: parseInt(tblSeats) || 8,
    tableDiameterInches: parseInt(tblDiam) || 72,
    tableSpacingFt: parseFloat(tblSpacing) || 10,
    tablePriceCents: Math.round((parseFloat(tblPrice) || 0) * 100),
    numberOfRows: parseInt(rowCount) || 0,
    seatsPerRow: parseInt(rowSeats) || 20,
    rowSpacingFt: parseFloat(rowSpacing) || 3,
    seatSpacingFt: parseFloat(seatSpacing) || 1.8,
    rowPriceCents: Math.round((parseFloat(rowPrice) || 0) * 100),
    gaCapacity: parseInt(gaCap) || 0,
    gaPriceCents: Math.round((parseFloat(gaPrice) || 0) * 100),
  }), [layoutName, eventType, roomW, roomD, stagePos, tblCount, tblSeats, tblDiam, tblSpacing, tblPrice, rowCount, rowSeats, rowSpacing, seatSpacing, rowPrice, gaCap, gaPrice]);

  // Generate preview (instant, runs on every config change)
  const result: QuickBuildResult = useMemo(() => quickBuild(config), [config]);

  // Convert to SectionFull[] for SeatMap
  const previewSections: SectionFull[] = useMemo(() => {
    return result.sections.map((sec) => ({
      id: sec._id,
      layout_id: "",
      name: sec.name,
      type: sec.type,
      price_cents: sec.price_cents,
      color: sec.color,
      sells_as_table: false,
      created_at: "",
      objects: result.objects.filter((o) => o._sectionId === sec._id).map((o) => ({
        id: o._id,
        section_id: sec._id,
        type: o.type,
        x_ft: o.x_ft,
        y_ft: o.y_ft,
        width_ft: o.width_ft,
        height_ft: o.height_ft,
        rotation: o.rotation,
        metadata: o.metadata,
        created_at: "",
      })),
      seats: result.seats.filter((s) => s._sectionId === sec._id).map((s, i) => ({
        id: `preview-${sec._id}-${i}`,
        section_id: sec._id,
        object_id: s._objectId,
        row_label: s.row_label,
        seat_number: s.seat_number,
        x_ft: s.x_ft,
        y_ft: s.y_ft,
        status: "available" as const,
        created_at: "",
      })),
    }));
  }, [result]);

  // Save
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/seating/layouts/quick-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          layout: result.layout,
          sections: result.sections,
          objects: result.objects,
          seats: result.seats,
        }),
      });
      const data = await res.json();
      if (data.layout_id) {
        router.push(`/dashboard/layout-builder/${data.layout_id}`);
      } else {
        alert(data.error || "Save failed");
      }
    } catch { alert("Save failed"); }
    setSaving(false);
  }, [result, router]);

  const showTables = eventType === "tables_ga" || eventType === "full_tables";
  const showRows = eventType === "theater";
  const showGA = eventType === "tables_ga";

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#0a0a0f", color: "#e5e7eb" }}>
      {/* Top bar */}
      <div style={{ height: 50, borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", padding: "0 16px", gap: 12, background: "rgba(255,255,255,0.02)", flexShrink: 0 }}>
        <button onClick={() => router.push("/admin/seating")} style={{ background: "none", border: "none", color: "#a5b4fc", fontSize: 13, cursor: "pointer" }}>← Back</button>
        <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Quick Build</h1>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
          {result.stats.totalSeats} seats · {result.stats.totalCapacity} total cap · {result.stats.generationMs}ms
        </span>
        <button onClick={handleSave} disabled={saving} style={{
          padding: "7px 20px", background: saving ? "rgba(74,222,128,0.3)" : "#10b981",
          border: "none", borderRadius: 6, color: "#fff", fontSize: 13, fontWeight: 700, cursor: saving ? "wait" : "pointer",
        }}>
          {saving ? "Saving…" : "Save & Open"}
        </button>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left: Config Panel */}
        <div style={{ width: 300, minWidth: 300, borderRight: "1px solid rgba(255,255,255,0.08)", padding: 16, overflowY: "auto", background: "rgba(255,255,255,0.02)" }}>

          <label style={labelStyle}>Layout Name</label>
          <input value={layoutName} onChange={(e) => setLayoutName(e.target.value)} style={{ ...fieldStyle, marginBottom: 12 }} />

          <label style={labelStyle}>Event Type</label>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {([["tables_ga", "Tables + GA"], ["full_tables", "Full Tables"], ["theater", "Theater"]] as const).map(([val, label]) => (
              <button key={val} onClick={() => handleTypeChange(val)} style={{
                flex: 1, padding: "8px 0", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                background: eventType === val ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${eventType === val ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.08)"}`,
                color: eventType === val ? "#a5b4fc" : "rgba(255,255,255,0.5)",
              }}>{label}</button>
            ))}
          </div>

          {/* Room */}
          <div style={sectionHeaderStyle}>Room</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1 }}><label style={labelStyle}>Width (ft)</label><input type="number" value={roomW} onChange={(e) => setRoomW(e.target.value)} style={fieldStyle} /></div>
            <div style={{ flex: 1 }}><label style={labelStyle}>Depth (ft)</label><input type="number" value={roomD} onChange={(e) => setRoomD(e.target.value)} style={fieldStyle} /></div>
          </div>
          <label style={labelStyle}>Stage Position</label>
          <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
            {(["top", "bottom"] as const).map((pos) => (
              <button key={pos} onClick={() => setStagePos(pos)} style={{
                flex: 1, padding: "6px 0", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                background: stagePos === pos ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${stagePos === pos ? "rgba(99,102,241,0.3)" : "rgba(255,255,255,0.06)"}`,
                color: stagePos === pos ? "#a5b4fc" : "rgba(255,255,255,0.4)",
              }}>{pos === "top" ? "Top (front)" : "Bottom (back)"}</button>
            ))}
          </div>

          {/* Tables */}
          {showTables && (
            <>
              <div style={sectionHeaderStyle}>Tables</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <div style={{ flex: 1 }}><label style={labelStyle}># Tables</label><input type="number" value={tblCount} onChange={(e) => setTblCount(e.target.value)} style={fieldStyle} /></div>
                <div style={{ flex: 1 }}><label style={labelStyle}>Seats/Table</label><input type="number" value={tblSeats} onChange={(e) => setTblSeats(e.target.value)} style={fieldStyle} /></div>
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <div style={{ flex: 1 }}><label style={labelStyle}>Diameter (in)</label><input type="number" value={tblDiam} onChange={(e) => setTblDiam(e.target.value)} style={fieldStyle} /></div>
                <div style={{ flex: 1 }}><label style={labelStyle}>Spacing (ft)</label><input type="number" value={tblSpacing} onChange={(e) => setTblSpacing(e.target.value)} style={fieldStyle} /></div>
              </div>
              <label style={labelStyle}>Price per Seat ($)</label>
              <input type="number" value={tblPrice} onChange={(e) => setTblPrice(e.target.value)} style={{ ...fieldStyle, marginBottom: 4 }} />
            </>
          )}

          {/* Rows */}
          {showRows && (
            <>
              <div style={sectionHeaderStyle}>Rows</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <div style={{ flex: 1 }}><label style={labelStyle}># Rows</label><input type="number" value={rowCount} onChange={(e) => setRowCount(e.target.value)} style={fieldStyle} /></div>
                <div style={{ flex: 1 }}><label style={labelStyle}>Seats/Row</label><input type="number" value={rowSeats} onChange={(e) => setRowSeats(e.target.value)} style={fieldStyle} /></div>
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <div style={{ flex: 1 }}><label style={labelStyle}>Row Gap (ft)</label><input type="number" value={rowSpacing} onChange={(e) => setRowSpacing(e.target.value)} style={fieldStyle} /></div>
                <div style={{ flex: 1 }}><label style={labelStyle}>Seat Gap (ft)</label><input type="number" value={seatSpacing} onChange={(e) => setSeatSpacing(e.target.value)} style={fieldStyle} /></div>
              </div>
              <label style={labelStyle}>Price per Seat ($)</label>
              <input type="number" value={rowPrice} onChange={(e) => setRowPrice(e.target.value)} style={{ ...fieldStyle, marginBottom: 4 }} />
            </>
          )}

          {/* GA */}
          {showGA && (
            <>
              <div style={sectionHeaderStyle}>General Admission</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <div style={{ flex: 1 }}><label style={labelStyle}>Capacity</label><input type="number" value={gaCap} onChange={(e) => setGaCap(e.target.value)} style={fieldStyle} /></div>
                <div style={{ flex: 1 }}><label style={labelStyle}>Price ($)</label><input type="number" value={gaPrice} onChange={(e) => setGaPrice(e.target.value)} style={fieldStyle} /></div>
              </div>
            </>
          )}
        </div>

        {/* Right: Live Preview */}
        <SeatMap
          sections={previewSections}
          roomWidthFt={parseFloat(roomW) || 100}
          roomHeightFt={parseFloat(roomD) || 80}
          interactive={false}
          selectedSeatIds={new Set()}
          onSeatClick={() => {}}
        />
      </div>
    </div>
  );
}
