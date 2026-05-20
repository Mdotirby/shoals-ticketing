"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import SeatMap from "@/app/components/seating/SeatMap";
import { SECTION_COLORS } from "@/lib/seating/types";
import type { SectionFull } from "@/lib/seating/types";

const fieldStyle: React.CSSProperties = {
  width: "100%", padding: "7px 10px", background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, color: "#e5e7eb",
  fontSize: 13, outline: "none",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 4, display: "block",
};

type EditingSection = {
  id: string;
  name: string;
  price: string;
  color: string;
};

type StageForm = {
  label: string;
  width: string;
  height: string;
};

export default function LayoutBuilderPage() {
  const params = useParams();
  const router = useRouter();
  const layoutId = params.layoutId as string;

  const [realLayoutId, setRealLayoutId] = useState<string>(layoutId === "new" ? "" : layoutId);

  const [layoutName, setLayoutName] = useState("Untitled Layout");
  const [roomWidth, setRoomWidth] = useState(100);
  const [roomHeight, setRoomHeight] = useState(60);
  const [sections, setSections] = useState<SectionFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // Room setup (new layout)
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

  // Edit section modal
  const [editingSection, setEditingSection] = useState<EditingSection | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // Stage panel
  const [showStage, setShowStage] = useState(false);
  const [stageForm, setStageForm] = useState<StageForm>({ label: "STAGE", width: "30", height: "10" });
  const [addingStage, setAddingStage] = useState(false);

  const currentLayoutId = realLayoutId || layoutId;

  // ─── load ─────────────────────────────────────────────────────────────────
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
        setRealLayoutId(layoutId);
      })
      .catch(() => router.push("/admin/seating"))
      .finally(() => setLoading(false));
  }, [layoutId, router]);

  const reload = useCallback((id?: string) => {
    const lid = id || currentLayoutId;
    if (!lid) return;
    fetch(`/api/seating/layouts/${lid}`)
      .then((r) => r.json())
      .then((data) => { if (!data.error) setSections(data.sections || []); });
  }, [currentLayoutId]);

  // ─── create layout ────────────────────────────────────────────────────────
  const handleCreate = useCallback(async () => {
    const res = await fetch("/api/seating/layouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: layoutName, room_width_ft: parseFloat(setupW) || 100, room_height_ft: parseFloat(setupH) || 60 }),
    });
    const data = await res.json();
    if (data.id) {
      setRealLayoutId(data.id);
      setRoomWidth(parseFloat(setupW) || 100);
      setRoomHeight(parseFloat(setupH) || 60);
      setShowSetup(false);
      // Use router.replace so Next.js updates params and URL together
      router.replace(`/dashboard/layout-builder/${data.id}`);
    }
  }, [layoutName, setupW, setupH, router]);

  // ─── save name ────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    const lid = currentLayoutId;
    if (!lid) return;
    setSaving(true);
    await fetch(`/api/seating/layouts/${lid}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: layoutName }),
    });
    setSaving(false);
    setSaveMsg("Saved!");
    setTimeout(() => setSaveMsg(""), 2000);
  }, [currentLayoutId, layoutName]);

  // ─── generate section ─────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    const lid = currentLayoutId;
    if (!lid) return;
    setGenerating(true);

    // Safe start_y: use max y across all objects and seats, default to 5
    const allObjMaxY = sections.flatMap((s) => s.objects.map((o) => o.y_ft + o.height_ft));
    const allSeatMaxY = sections.flatMap((s) => s.seats.map((seat) => seat.y_ft));
    const allY = [...allObjMaxY, ...allSeatMaxY].filter(isFinite);
    const baseY = allY.length > 0 ? Math.max(...allY) + 5 : 5;

    let genParams: Record<string, unknown> = {};
    if (genType === "tables") {
      genParams = {
        number_of_tables: parseInt(tblCount) || 10,
        seats_per_table: parseInt(tblSeats) || 8,
        table_diameter_inches: parseInt(tblDiam) || 60,
        spacing_ft: parseFloat(tblSpacing) || 3,
        start_x: 5,
        start_y: baseY,
      };
    } else if (genType === "rows") {
      genParams = {
        number_of_rows: parseInt(rowCount) || 10,
        seats_per_row: parseInt(rowSeats) || 20,
        row_spacing_ft: parseFloat(rowSpacing) || 3,
        seat_spacing_ft: parseFloat(seatSpacing) || 1.8,
        aisle_positions: aisles ? aisles.split(",").map((a) => parseInt(a.trim())).filter((a) => !isNaN(a)) : [],
        start_x: 5,
        start_y: baseY,
      };
    } else {
      genParams = {
        capacity: parseInt(gaCapacity) || 200,
        start_x: 5,
        start_y: baseY,
        width_ft: parseFloat(gaWidth) || 30,
        height_ft: parseFloat(gaHeight) || 20,
      };
    }

    try {
      const res = await fetch(`/api/seating/layouts/${lid}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: {
            name: genName,
            type: genType === "ga" ? "ga" : genType === "tables" ? "table" : "row",
            price_cents: Math.round(parseFloat(genPrice) * 100) || 0,
            color: genColor,
          },
          generator: genType,
          params: genParams,
        }),
      });
      const data = await res.json();
      if (data.success) {
        reload(lid);
        setShowGen(false);
        setGenColor(SECTION_COLORS[(sections.length + 1) % SECTION_COLORS.length]);
      } else {
        alert(data.error || "Generation failed");
      }
    } catch { alert("Generation failed"); }
    setGenerating(false);
  }, [currentLayoutId, genType, genName, genPrice, genColor, tblCount, tblSeats, tblDiam, tblSpacing, rowCount, rowSeats, rowSpacing, seatSpacing, aisles, gaCapacity, gaWidth, gaHeight, sections, reload]);

  // ─── delete section ───────────────────────────────────────────────────────
  const handleDeleteSection = useCallback(async (sectionId: string) => {
    if (!confirm("Delete this section and all its seats?")) return;
    const res = await fetch(`/api/seating/sections/${sectionId}`, { method: "DELETE" });
    if (res.ok) reload();
  }, [reload]);

  // ─── edit section ─────────────────────────────────────────────────────────
  const openEdit = useCallback((sec: SectionFull) => {
    setEditingSection({ id: sec.id, name: sec.name, price: (sec.price_cents / 100).toFixed(2), color: sec.color });
    setShowGen(false);
    setShowStage(false);
  }, []);

  const handleEditSave = useCallback(async () => {
    if (!editingSection) return;
    setEditSaving(true);
    const res = await fetch(`/api/seating/sections/${editingSection.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editingSection.name,
        price_cents: Math.round(parseFloat(editingSection.price) * 100) || 0,
        color: editingSection.color,
      }),
    });
    if (res.ok) {
      reload();
      setEditingSection(null);
    }
    setEditSaving(false);
  }, [editingSection, reload]);

  // ─── add stage ────────────────────────────────────────────────────────────
  const handleAddStage = useCallback(async () => {
    const lid = currentLayoutId;
    if (!lid) return;
    setAddingStage(true);
    // Place stage near the top of existing content, centered at x=10
    const allObjMaxY = sections.flatMap((s) => s.objects.map((o) => o.y_ft + o.height_ft));
    const allY = allObjMaxY.filter(isFinite);
    const stageY = allY.length > 0 ? Math.max(...allY) + 3 : 2;

    try {
      const res = await fetch(`/api/seating/layouts/${lid}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: stageForm.label,
          width_ft: parseFloat(stageForm.width) || 30,
          height_ft: parseFloat(stageForm.height) || 10,
          x_ft: 5,
          y_ft: stageY,
        }),
      });
      const data = await res.json();
      if (data.success) {
        reload(lid);
        setShowStage(false);
      } else {
        alert(data.error || "Failed to add stage");
      }
    } catch { alert("Failed to add stage"); }
    setAddingStage(false);
  }, [currentLayoutId, sections, stageForm, reload]);

  // ─── drag object to move ──────────────────────────────────────────────────
  const handleObjectMoved = useCallback(async (objectId: string, newXFt: number, newYFt: number) => {
    const lid = currentLayoutId;
    if (!lid) return;
    // Optimistic update
    setSections((prev) => prev.map((sec) => ({
      ...sec,
      objects: sec.objects.map((obj) => obj.id === objectId ? { ...obj, x_ft: newXFt, y_ft: newYFt } : obj),
      seats: sec.seats.map((seat) => {
        if (seat.object_id !== objectId) return seat;
        const obj = sec.objects.find((o) => o.id === objectId);
        if (!obj) return seat;
        return { ...seat, x_ft: seat.x_ft + (newXFt - obj.x_ft), y_ft: seat.y_ft + (newYFt - obj.y_ft) };
      }),
    })));

    // Persist to server
    await fetch(`/api/seating/objects/${objectId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ x_ft: newXFt, y_ft: newYFt }),
    });
  }, [currentLayoutId]);

  const totalSeats = sections.reduce((sum, s) => sum + s.seats.length, 0);
  const totalCapacity = sections.reduce((sum, s) => {
    if (s.type === "ga") {
      return sum + s.objects.reduce((c, o) => c + ((o.metadata as { capacity?: number })?.capacity || 0), 0);
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
        {/* Left Panel */}
        <div style={{ width: 280, minWidth: 280, borderRight: "1px solid rgba(255,255,255,0.08)", padding: 16, overflowY: "auto", background: "rgba(255,255,255,0.02)" }}>
          {/* Section list header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <h3 style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 1, margin: 0 }}>Sections</h3>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                onClick={() => { setShowStage(!showStage); setShowGen(false); setEditingSection(null); }}
                style={{ padding: "5px 10px", background: showStage ? "rgba(113,113,122,0.3)" : "rgba(113,113,122,0.1)", border: "1px solid rgba(113,113,122,0.3)", borderRadius: 6, color: "#a1a1aa", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
              >
                + Stage
              </button>
              <button
                onClick={() => { setShowGen(!showGen); setShowStage(false); setEditingSection(null); }}
                style={{ padding: "5px 10px", background: showGen ? "rgba(99,102,241,0.25)" : "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 6, color: "#a5b4fc", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
              >
                + Section
              </button>
            </div>
          </div>

          {/* Section list */}
          {sections.map((sec) => (
            <div key={sec.id} style={{ padding: "10px 12px", marginBottom: 6, borderRadius: 8, background: "rgba(255,255,255,0.03)", border: `1px solid ${sec.color}30` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: sec.color, flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: sec.color, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sec.name}</span>
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                {sec.type} · {sec.type !== "stage" ? `$${(sec.price_cents / 100).toFixed(2)} · ` : ""}{sec.seats.length} seats
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                {sec.type !== "stage" && (
                  <button onClick={() => openEdit(sec)} style={{ background: "none", border: "none", color: "rgba(165,180,252,0.7)", fontSize: 10, cursor: "pointer", padding: 0 }}>Edit</button>
                )}
                <button onClick={() => handleDeleteSection(sec.id)} style={{ background: "none", border: "none", color: "rgba(255,107,107,0.6)", fontSize: 10, cursor: "pointer", padding: 0 }}>Delete</button>
              </div>
            </div>
          ))}

          {sections.length === 0 && !showGen && !showStage && (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: 20 }}>
              No sections yet. Click &quot;+ Section&quot; or &quot;+ Stage&quot; to get started.
            </p>
          )}

          {/* Stage panel */}
          {showStage && (
            <div style={{ padding: 14, borderRadius: 10, background: "rgba(113,113,122,0.08)", border: "1px solid rgba(113,113,122,0.2)", marginTop: 8 }}>
              <h4 style={{ fontSize: 12, fontWeight: 700, color: "#a1a1aa", margin: "0 0 10px" }}>Add Stage</h4>
              <label style={labelStyle}>Label</label>
              <input value={stageForm.label} onChange={(e) => setStageForm((f) => ({ ...f, label: e.target.value }))} style={{ ...fieldStyle, marginBottom: 8 }} />
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <div style={{ flex: 1 }}><label style={labelStyle}>Width (ft)</label><input type="number" value={stageForm.width} onChange={(e) => setStageForm((f) => ({ ...f, width: e.target.value }))} style={fieldStyle} /></div>
                <div style={{ flex: 1 }}><label style={labelStyle}>Height (ft)</label><input type="number" value={stageForm.height} onChange={(e) => setStageForm((f) => ({ ...f, height: e.target.value }))} style={fieldStyle} /></div>
              </div>
              <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", margin: "0 0 8px" }}>After adding, drag the stage on the map to reposition it.</p>
              <button onClick={handleAddStage} disabled={addingStage} style={{ width: "100%", padding: "9px 0", background: addingStage ? "rgba(113,113,122,0.3)" : "rgba(113,113,122,0.5)", border: "none", borderRadius: 6, color: "#fff", fontSize: 13, fontWeight: 600, cursor: addingStage ? "wait" : "pointer" }}>
                {addingStage ? "Adding…" : "Add Stage"}
              </button>
            </div>
          )}

          {/* Edit section modal (inline) */}
          {editingSection && (
            <div style={{ padding: 14, borderRadius: 10, background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)", marginTop: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <h4 style={{ fontSize: 12, fontWeight: 700, color: "#a5b4fc", margin: 0 }}>Edit Section</h4>
                <button onClick={() => setEditingSection(null)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 14, cursor: "pointer", padding: 0 }}>✕</button>
              </div>
              <label style={labelStyle}>Name</label>
              <input value={editingSection.name} onChange={(e) => setEditingSection((s) => s ? { ...s, name: e.target.value } : null)} style={{ ...fieldStyle, marginBottom: 8 }} />
              <label style={labelStyle}>Price ($)</label>
              <input type="number" value={editingSection.price} onChange={(e) => setEditingSection((s) => s ? { ...s, price: e.target.value } : null)} style={{ ...fieldStyle, marginBottom: 8 }} />
              <label style={labelStyle}>Color</label>
              <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
                {SECTION_COLORS.map((c) => (
                  <button key={c} onClick={() => setEditingSection((s) => s ? { ...s, color: c } : null)} style={{ width: 22, height: 22, borderRadius: 4, background: c, border: editingSection.color === c ? "2px solid #fff" : "2px solid transparent", cursor: "pointer", padding: 0 }} />
                ))}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setEditingSection(null)} style={{ flex: 1, padding: "7px 0", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#a1a1aa", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                <button onClick={handleEditSave} disabled={editSaving} style={{ flex: 2, padding: "7px 0", background: "#6366f1", border: "none", borderRadius: 6, color: "#fff", fontSize: 12, fontWeight: 600, cursor: editSaving ? "wait" : "pointer" }}>{editSaving ? "Saving…" : "Save Changes"}</button>
              </div>
            </div>
          )}

          {/* Generator panel */}
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
                  <div style={{ marginBottom: 8 }}><label style={labelStyle}>Capacity</label><input type="number" value={gaCapacity} onChange={(e) => setGaCapacity(e.target.value)} style={fieldStyle} /></div>
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
          draggable={true}
          onObjectMoved={handleObjectMoved}
        />
      </div>
    </div>
  );
}
