"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import SeatMap from "@/app/components/seating/SeatMap";
import { SECTION_COLORS, PPF } from "@/lib/seating/types";
import type { SectionFull } from "@/lib/seating/types";

const fieldStyle: React.CSSProperties = {
  width: "100%", padding: "7px 10px", background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, color: "#e5e7eb",
  fontSize: 13, outline: "none",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 4, display: "block",
};

export default function LayoutBuilderPage() {
  const params = useParams();
  const router = useRouter();
  const layoutId = params.layoutId as string;

  // Layout state
  const [layoutName, setLayoutName] = useState("Untitled Layout");
  const [roomWidth, setRoomWidth] = useState(100);
  const [roomHeight, setRoomHeight] = useState(60);
  const [sections, setSections] = useState<SectionFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // Room setup
  const [showSetup, setShowSetup] = useState(false);
  const [setupW, setSetupW] = useState("100");
  const [setupH, setSetupH] = useState("60");

  // Generator panel
  const [showGen, setShowGen] = useState(false);
  const [genType, setGenType] = useState<"tables" | "rows" | "ga">("tables");
  const [genName, setGenName] = useState("VIP Tables");
  const [genPrice, setGenPrice] = useState("50");
  const [genColor, setGenColor] = useState(SECTION_COLORS[0]);
  const [generating, setGenerating] = useState(false);

  // Table params
  const [tblCount, setTblCount] = useState("10");
  const [tblSeats, setTblSeats] = useState("8");
  const [tblDiam, setTblDiam] = useState("60");
  const [tblSpacing, setTblSpacing] = useState("3");

  // Row params
  const [rowCount, setRowCount] = useState("10");
  const [rowSeats, setRowSeats] = useState("20");
  const [rowSpacing, setRowSpacing] = useState("3");
  const [seatSpacing, setSeatSpacing] = useState("1.8");
  const [aisles, setAisles] = useState("10");

  // GA params
  const [gaCapacity, setGaCapacity] = useState("200");
  const [gaWidth, setGaWidth] = useState("30");
  const [gaHeight, setGaHeight] = useState("20");

  // Load
  useEffect(() => {
    if (layoutId === "new") { setShowSetup(true); setLoading(false); return; }
    fetch(`/api/seating/layouts/${layoutId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { router.push("/admin/seating"); return; }
        setLayoutName(data.name);
        setRoomWidth(data.room_width_ft);
        setRoomHeight(data.room_height_ft);
        setSections(data.sections || []);
      })
      .catch(() => router.push("/admin/seating"))
      .finally(() => setLoading(false));
  }, [layoutId, router]);

  const reload = useCallback(() => {
    fetch(`/api/seating/layouts/${layoutId}`).then((r) => r.json()).then((data) => {
      setSections(data.sections || []);
    });
  }, [layoutId]);

  // Create layout
  const handleCreate = useCallback(async () => {
    const res = await fetch("/api/seating/layouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: layoutName, room_width_ft: parseFloat(setupW) || 100, room_height_ft: parseFloat(setupH) || 60 }),
    });
    const data = await res.json();
    if (data.id) {
      window.history.replaceState(null, "", `/dashboard/layout-builder/${data.id}`);
      setRoomWidth(parseFloat(setupW) || 100);
      setRoomHeight(parseFloat(setupH) || 60);
      setShowSetup(false);
    }
  }, [layoutName, setupW, setupH]);

  // Save name
  const handleSave = useCallback(async () => {
    if (layoutId === "new") return;
    setSaving(true);
    await fetch(`/api/seating/layouts/${layoutId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: layoutName }),
    });
    setSaving(false);
    setSaveMsg("Saved!");
    setTimeout(() => setSaveMsg(""), 2000);
  }, [layoutId, layoutName]);

  // Generate section
  const handleGenerate = useCallback(async () => {
    if (layoutId === "new") return;
    setGenerating(true);

    let genParams: Record<string, unknown> = {};
    if (genType === "tables") {
      genParams = {
        number_of_tables: parseInt(tblCount) || 10,
        seats_per_table: parseInt(tblSeats) || 8,
        table_diameter_inches: parseInt(tblDiam) || 60,
        spacing_ft: parseFloat(tblSpacing) || 3,
        start_x: 5,
        start_y: (sections.length > 0 ? Math.max(...sections.flatMap((s) => s.seats.map((seat) => seat.y_ft))) + 10 : 5),
      };
    } else if (genType === "rows") {
      genParams = {
        number_of_rows: parseInt(rowCount) || 10,
        seats_per_row: parseInt(rowSeats) || 20,
        row_spacing_ft: parseFloat(rowSpacing) || 3,
        seat_spacing_ft: parseFloat(seatSpacing) || 1.8,
        aisle_positions: aisles ? aisles.split(",").map((a) => parseInt(a.trim())).filter((a) => !isNaN(a)) : [],
        start_x: 5,
        start_y: (sections.length > 0 ? Math.max(...sections.flatMap((s) => s.seats.map((seat) => seat.y_ft)), ...sections.flatMap((s) => s.objects.map((o) => o.y_ft + o.height_ft))) + 5 : 5),
      };
    } else {
      genParams = {
        capacity: parseInt(gaCapacity) || 200,
        start_x: 5,
        start_y: (sections.length > 0 ? Math.max(...sections.flatMap((s) => s.objects.map((o) => o.y_ft + o.height_ft))) + 5 : 5),
        width_ft: parseFloat(gaWidth) || 30,
        height_ft: parseFloat(gaHeight) || 20,
      };
    }

    try {
      const res = await fetch(`/api/seating/layouts/${layoutId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: { name: genName, type: genType === "ga" ? "ga" : genType === "tables" ? "table" : "row", price_cents: Math.round(parseFloat(genPrice) * 100) || 0, color: genColor },
          generator: genType,
          params: genParams,
        }),
      });
      const data = await res.json();
      if (data.success) {
        reload();
        setShowGen(false);
        // Reset name and color for next section
        setGenColor(SECTION_COLORS[(sections.length + 1) % SECTION_COLORS.length]);
      } else {
        alert(data.error || "Generation failed");
      }
    } catch { alert("Generation failed"); }
    setGenerating(false);
  }, [layoutId, genType, genName, genPrice, genColor, tblCount, tblSeats, tblDiam, tblSpacing, rowCount, rowSeats, rowSpacing, seatSpacing, aisles, gaCapacity, gaWidth, gaHeight, sections, reload]);

  // Delete section
  const handleDeleteSection = useCallback(async (sectionId: string) => {
    if (!confirm("Delete this section and all its seats?")) return;
    // Delete objects first (cascades seats), then section
    await fetch(`/api/seating/layouts/${layoutId}`).then(async () => {
      const admin = await import("@supabase/supabase-js");
      // Use API-based deletion by re-fetching
    });
    // Simple approach: delete via direct Supabase call from a small API
    // For now just delete the section (cascade handles the rest)
    const res = await fetch(`/api/seating/sections/${sectionId}`, { method: "DELETE" });
    if (res.ok) reload();
  }, [layoutId, reload]);

  const totalSeats = sections.reduce((sum, s) => sum + s.seats.length, 0);
  const totalCapacity = sections.reduce((sum, s) => {
    if (s.type === "ga") {
      const cap = s.objects.reduce((c, o) => c + ((o.metadata as { capacity?: number })?.capacity || 0), 0);
      return sum + cap;
    }
    return sum + s.seats.length;
  }, 0);

  if (loading) {
    return <div style={{ minHeight: "100vh", background: "#0a0a0f", display: "flex", alignItems: "center", justifyContent: "center", color: "#a1a1aa" }}>Loading…</div>;
  }

  if (showSetup) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0f", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: 32, maxWidth: 420, width: "100%" }}>
          <h2 style={{ color: "#e5e7eb", fontSize: 20, fontWeight: 700, marginBottom: 4 }}>New Layout</h2>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginBottom: 20 }}>Enter venue room dimensions in feet.</p>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Layout Name</label>
            <input value={layoutName} onChange={(e) => setLayoutName(e.target.value)} style={fieldStyle} />
          </div>
          <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1 }}><label style={labelStyle}>Width (ft)</label><input type="number" value={setupW} onChange={(e) => setSetupW(e.target.value)} style={fieldStyle} /></div>
            <div style={{ flex: 1 }}><label style={labelStyle}>Height (ft)</label><input type="number" value={setupH} onChange={(e) => setSetupH(e.target.value)} style={fieldStyle} /></div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => router.push("/admin/seating")} style={{ flex: 1, padding: "10px 0", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#a1a1aa", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
            <button onClick={handleCreate} style={{ flex: 1, padding: "10px 0", background: "#6366f1", border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Create Layout</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#0a0a0f", color: "#e5e7eb" }}>
      {/* Top bar */}
      <div style={{ height: 50, borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", padding: "0 16px", gap: 12, background: "rgba(255,255,255,0.02)", flexShrink: 0 }}>
        <button onClick={() => router.push("/admin/seating")} style={{ background: "none", border: "none", color: "#a5b4fc", fontSize: 13, cursor: "pointer" }}>← Back</button>
        <input value={layoutName} onChange={(e) => setLayoutName(e.target.value)} style={{ ...fieldStyle, width: 220, padding: "4px 10px", fontWeight: 600 }} />
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{roomWidth}×{roomHeight} ft · {totalSeats} seats · {totalCapacity} total cap</span>
        <div style={{ flex: 1 }} />
        {saveMsg && <span style={{ fontSize: 12, color: "#4ade80" }}>{saveMsg}</span>}
        <button onClick={handleSave} disabled={saving} style={{ padding: "6px 16px", background: "#6366f1", border: "none", borderRadius: 6, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{saving ? "Saving…" : "Save"}</button>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left Panel — Sections + Generator */}
        <div style={{ width: 280, minWidth: 280, borderRight: "1px solid rgba(255,255,255,0.08)", padding: 16, overflowY: "auto", background: "rgba(255,255,255,0.02)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 1, margin: 0 }}>Sections</h3>
            <button onClick={() => setShowGen(!showGen)} style={{ padding: "5px 12px", background: showGen ? "rgba(99,102,241,0.25)" : "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 6, color: "#a5b4fc", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
              + Add Section
            </button>
          </div>

          {/* Section list */}
          {sections.map((sec) => (
            <div key={sec.id} style={{ padding: "10px 12px", marginBottom: 8, borderRadius: 8, background: "rgba(255,255,255,0.03)", border: `1px solid ${sec.color}30` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: sec.color, flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: sec.color }}>{sec.name}</span>
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                {sec.type} · ${(sec.price_cents / 100).toFixed(2)} · {sec.seats.length} seats
              </div>
              <button onClick={() => handleDeleteSection(sec.id)} style={{ marginTop: 6, background: "none", border: "none", color: "rgba(255,107,107,0.6)", fontSize: 10, cursor: "pointer", padding: 0 }}>Delete section</button>
            </div>
          ))}

          {sections.length === 0 && !showGen && (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: 20 }}>
              No sections yet. Click &quot;+ Add Section&quot; to generate seating.
            </p>
          )}

          {/* Generator Panel */}
          {showGen && (
            <div style={{ padding: 14, borderRadius: 10, background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)", marginTop: 8 }}>
              <h4 style={{ fontSize: 12, fontWeight: 700, color: "#a5b4fc", margin: "0 0 10px" }}>Generate Section</h4>

              <label style={labelStyle}>Section Name</label>
              <input value={genName} onChange={(e) => setGenName(e.target.value)} style={{ ...fieldStyle, marginBottom: 8 }} />

              <label style={labelStyle}>Price ($)</label>
              <input type="number" value={genPrice} onChange={(e) => setGenPrice(e.target.value)} style={{ ...fieldStyle, marginBottom: 8 }} />

              <label style={labelStyle}>Color</label>
              <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
                {SECTION_COLORS.map((c) => (
                  <button key={c} onClick={() => setGenColor(c)} style={{ width: 22, height: 22, borderRadius: 4, background: c, border: genColor === c ? "2px solid #fff" : "2px solid transparent", cursor: "pointer", padding: 0 }} />
                ))}
              </div>

              <label style={labelStyle}>Type</label>
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                {(["tables", "rows", "ga"] as const).map((t) => (
                  <button key={t} onClick={() => setGenType(t)} style={{ flex: 1, padding: "6px 0", borderRadius: 6, background: genType === t ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.04)", border: `1px solid ${genType === t ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.08)"}`, color: genType === t ? "#a5b4fc" : "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                    {t === "tables" ? "Tables" : t === "rows" ? "Rows" : "GA"}
                  </button>
                ))}
              </div>

              {/* Type-specific params */}
              {genType === "tables" && (
                <>
                  <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                    <div style={{ flex: 1 }}><label style={labelStyle}># Tables</label><input type="number" value={tblCount} onChange={(e) => setTblCount(e.target.value)} style={fieldStyle} /></div>
                    <div style={{ flex: 1 }}><label style={labelStyle}>Seats/Table</label><input type="number" value={tblSeats} onChange={(e) => setTblSeats(e.target.value)} style={fieldStyle} /></div>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <div style={{ flex: 1 }}><label style={labelStyle}>Diameter (in)</label><input type="number" value={tblDiam} onChange={(e) => setTblDiam(e.target.value)} style={fieldStyle} /></div>
                    <div style={{ flex: 1 }}><label style={labelStyle}>Spacing (ft)</label><input type="number" value={tblSpacing} onChange={(e) => setTblSpacing(e.target.value)} style={fieldStyle} /></div>
                  </div>
                </>
              )}
              {genType === "rows" && (
                <>
                  <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                    <div style={{ flex: 1 }}><label style={labelStyle}># Rows</label><input type="number" value={rowCount} onChange={(e) => setRowCount(e.target.value)} style={fieldStyle} /></div>
                    <div style={{ flex: 1 }}><label style={labelStyle}>Seats/Row</label><input type="number" value={rowSeats} onChange={(e) => setRowSeats(e.target.value)} style={fieldStyle} /></div>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                    <div style={{ flex: 1 }}><label style={labelStyle}>Row Gap (ft)</label><input type="number" value={rowSpacing} onChange={(e) => setRowSpacing(e.target.value)} style={fieldStyle} /></div>
                    <div style={{ flex: 1 }}><label style={labelStyle}>Seat Gap (ft)</label><input type="number" value={seatSpacing} onChange={(e) => setSeatSpacing(e.target.value)} style={fieldStyle} /></div>
                  </div>
                  <label style={labelStyle}>Aisle at seats (comma-sep)</label>
                  <input value={aisles} onChange={(e) => setAisles(e.target.value)} placeholder="e.g. 10" style={{ ...fieldStyle, marginBottom: 8 }} />
                </>
              )}
              {genType === "ga" && (
                <>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <div style={{ flex: 1 }}><label style={labelStyle}>Capacity</label><input type="number" value={gaCapacity} onChange={(e) => setGaCapacity(e.target.value)} style={fieldStyle} /></div>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <div style={{ flex: 1 }}><label style={labelStyle}>Width (ft)</label><input type="number" value={gaWidth} onChange={(e) => setGaWidth(e.target.value)} style={fieldStyle} /></div>
                    <div style={{ flex: 1 }}><label style={labelStyle}>Height (ft)</label><input type="number" value={gaHeight} onChange={(e) => setGaHeight(e.target.value)} style={fieldStyle} /></div>
                  </div>
                </>
              )}

              <button onClick={handleGenerate} disabled={generating} style={{ width: "100%", padding: "9px 0", background: generating ? "rgba(99,102,241,0.3)" : "#6366f1", border: "none", borderRadius: 6, color: "#fff", fontSize: 13, fontWeight: 600, cursor: generating ? "wait" : "pointer" }}>
                {generating ? "Generating…" : "Generate Seats"}
              </button>
            </div>
          )}
        </div>

        {/* Canvas */}
        <SeatMap
          sections={sections}
          roomWidthFt={roomWidth}
          roomHeightFt={roomHeight}
          interactive={false}
          selectedSeatIds={new Set()}
          onSeatClick={() => {}}
        />
      </div>
    </div>
  );
}
