"use client";

import { useState, useEffect } from "react";
import { SeatingSectionDraft } from "@/lib/types/seating";

type Props = {
  chartId?: string | null;
  venueId?: string;
  onSaved: () => void;
};

const SECTION_COLORS = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6",
  "#ef4444", "#8b5cf6", "#14b8a6",
];

function emptySection(index: number): SeatingSectionDraft {
  return {
    section_name: "",
    color: SECTION_COLORS[index % SECTION_COLORS.length],
    price_tier: "",
    layout_type: "rows",
    row_count: "",
    seats_per_row: "",
    table_count: "",
    seats_per_table: "",
  };
}

export default function AdminSeatingChartEditor({ chartId, venueId, onSaved }: Props) {
  const [name, setName] = useState("");
  const [venueName, setVenueName] = useState("");
  const [sections, setSections] = useState<SeatingSectionDraft[]>([emptySection(0)]);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [savedChartId, setSavedChartId] = useState<string | null>(chartId || null);
  const [previewData, setPreviewData] = useState<Record<string, unknown> | null>(null);

  // Load existing chart if editing
  useEffect(() => {
    if (!chartId) return;
    fetch(`/api/seating/charts/${chartId}`)
      .then((r) => r.json())
      .then((data) => {
        setName(data.name || "");
        setVenueName(data.venue_name || "");
        setSavedChartId(data.id);
        if (data.sections && data.sections.length > 0) {
          setSections(
            data.sections.map((s: {
              section_name: string; color: string; price_tier: number;
              row_count: number; seat_count: number;
            }, i: number) => {
              // Detect if this is a table-based section (row_count=0 or section name hints at tables)
              const isTable = s.row_count === 0 && s.seat_count > 0;
              return {
                section_name: s.section_name,
                color: s.color || SECTION_COLORS[i % SECTION_COLORS.length],
                price_tier: String(s.price_tier),
                layout_type: isTable ? "tables" as const : "rows" as const,
                row_count: isTable ? "" : String(s.row_count),
                seats_per_row: isTable ? "" : (s.row_count > 0 ? String(Math.floor(s.seat_count / s.row_count)) : "0"),
                table_count: isTable ? String(s.seat_count > 0 ? Math.ceil(s.seat_count / 8) : 0) : "",
                seats_per_table: isTable ? "8" : "",
              };
            })
          );
        }
      })
      .catch(() => setError("Failed to load chart"));
  }, [chartId]);

  const handleSectionChange = (index: number, field: keyof SeatingSectionDraft, value: string) => {
    setSections((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
  };

  const addSection = () => {
    setSections((prev) => [...prev, emptySection(prev.length)]);
  };

  const removeSection = (index: number) => {
    if (sections.length <= 1) return;
    setSections((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setError("");

    if (!name.trim()) {
      setError("Chart name is required");
      return;
    }

    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      if (!s.section_name.trim()) {
        setError(`Section ${i + 1}: name is required`);
        return;
      }
      if (s.layout_type === "rows") {
        if (!s.row_count || parseInt(s.row_count) < 1) {
          setError(`Section ${i + 1}: row count must be at least 1`);
          return;
        }
        if (!s.seats_per_row || parseInt(s.seats_per_row) < 1) {
          setError(`Section ${i + 1}: seats per row must be at least 1`);
          return;
        }
      } else {
        if (!s.table_count || parseInt(s.table_count) < 1) {
          setError(`Section ${i + 1}: table count must be at least 1`);
          return;
        }
        if (!s.seats_per_table || parseInt(s.seats_per_table) < 1) {
          setError(`Section ${i + 1}: seats per table must be at least 1`);
          return;
        }
      }
    }

    setSaving(true);

    try {
      const payload = {
        name: name.trim(),
        venue_name: venueName.trim() || null,
        venue_id: venueId || null,
        sections: sections.map((s) => ({
          section_name: s.section_name.trim(),
          color: s.color,
          price_tier: parseFloat(s.price_tier) || 0,
          layout_type: s.layout_type,
          // For rows: row_count and seats_per_row
          // For tables: table_count as row_count, seats_per_table as seats_per_row
          row_count: s.layout_type === "rows" ? parseInt(s.row_count) : parseInt(s.table_count),
          seats_per_row: s.layout_type === "rows" ? parseInt(s.seats_per_row) : parseInt(s.seats_per_table),
        })),
      };

      let res;
      if (savedChartId) {
        // Update existing
        res = await fetch(`/api/seating/charts/${savedChartId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        // Create new
        res = await fetch("/api/seating/charts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save chart");
      }

      const chart = await res.json();
      setSavedChartId(chart.id);

      // Auto-generate seats
      setGenerating(true);
      const genRes = await fetch(`/api/seating/charts/${chart.id}/generate-seats`, {
        method: "POST",
      });
      const genData = await genRes.json();
      setGenerating(false);

      if (genData.success) {
        // Load preview
        await loadPreview(chart.id);
      }

      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
      setGenerating(false);
    }
  };

  const loadPreview = async (id: string) => {
    try {
      const res = await fetch(`/api/seating/charts/${id}`);
      const data = await res.json();
      setPreviewData(data);
    } catch {
      // Non-critical
    }
  };

  const handlePreview = async () => {
    if (!savedChartId) return;
    await loadPreview(savedChartId);
  };

  const totalSeats = sections.reduce((sum, s) => {
    if (s.layout_type === "tables") {
      return sum + (parseInt(s.table_count) || 0) * (parseInt(s.seats_per_table) || 0);
    }
    return sum + (parseInt(s.row_count) || 0) * (parseInt(s.seats_per_row) || 0);
  }, 0);

  return (
    <div>
      <h1 className="admin-page-title">
        {chartId ? "Edit Seating Chart" : "Create Seating Chart"}
      </h1>

      {error && <div className="admin-form-error">{error}</div>}

      <div className="admin-form" style={{ gap: 16, display: "flex", flexDirection: "column" }}>
        {/* Chart info */}
        <div className="admin-form-grid">
          <label className="admin-form-label">
            Chart Name *
            <input
              type="text"
              className="admin-form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Main Hall Layout"
            />
          </label>
          <label className="admin-form-label">
            Venue Name
            <input
              type="text"
              className="admin-form-input"
              value={venueName}
              onChange={(e) => setVenueName(e.target.value)}
              placeholder="e.g. Singin River Live"
            />
          </label>
        </div>

        {/* Sections */}
        <div style={{
          padding: 16, borderRadius: 10,
          background: "rgba(99,102,241,0.04)",
          border: "1px solid rgba(99,102,241,0.12)",
        }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: 12,
          }}>
            <span style={{ color: "#818cf8", fontWeight: 700, fontSize: 13 }}>
              Sections ({sections.length})
            </span>
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>
              Total seats: {totalSeats}
            </span>
          </div>

          {sections.map((section, i) => (
            <div
              key={i}
              style={{
                padding: 10, borderRadius: 8, marginBottom: 8,
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              {/* Row 1: Color, Name, Price, Type dropdown, Remove */}
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                <div
                  style={{
                    width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                    background: section.color, cursor: "pointer",
                  }}
                  onClick={() => {
                    const nextColor = SECTION_COLORS[(SECTION_COLORS.indexOf(section.color) + 1) % SECTION_COLORS.length];
                    handleSectionChange(i, "color", nextColor);
                  }}
                  title="Click to change color"
                />
                <input
                  type="text"
                  className="admin-form-input"
                  value={section.section_name}
                  onChange={(e) => handleSectionChange(i, "section_name", e.target.value)}
                  placeholder="Section name"
                  style={{ fontSize: 13, flex: 1 }}
                />
                <input
                  type="number"
                  className="admin-form-input"
                  value={section.price_tier}
                  onChange={(e) => handleSectionChange(i, "price_tier", e.target.value)}
                  placeholder="Price ($)"
                  min="0"
                  step="0.01"
                  style={{ fontSize: 13, width: 80 }}
                />
                <select
                  className="admin-form-input"
                  value={section.layout_type}
                  onChange={(e) => handleSectionChange(i, "layout_type", e.target.value)}
                  style={{ fontSize: 12, width: 130, padding: "6px 8px" }}
                >
                  <option value="rows">Individual Seats</option>
                  <option value="tables">Tables</option>
                </select>
                {sections.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeSection(i)}
                    style={{
                      background: "none", border: "none", color: "#ff6b6b",
                      cursor: "pointer", fontSize: 16, flexShrink: 0,
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Row 2: Conditional fields based on layout type */}
              <div style={{ display: "flex", gap: 8, alignItems: "center", paddingLeft: 28 }}>
                {section.layout_type === "rows" ? (
                  <>
                    <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Rows</span>
                      <input
                        type="number"
                        className="admin-form-input"
                        value={section.row_count}
                        onChange={(e) => handleSectionChange(i, "row_count", e.target.value)}
                        placeholder="Rows"
                        min="1"
                        step="1"
                        style={{ fontSize: 13, width: 70 }}
                      />
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Seats/Row</span>
                      <input
                        type="number"
                        className="admin-form-input"
                        value={section.seats_per_row}
                        onChange={(e) => handleSectionChange(i, "seats_per_row", e.target.value)}
                        placeholder="Seats/Row"
                        min="1"
                        step="1"
                        style={{ fontSize: 13, width: 70 }}
                      />
                    </label>
                    <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>
                      = {(parseInt(section.row_count) || 0) * (parseInt(section.seats_per_row) || 0)} seats
                    </span>
                  </>
                ) : (
                  <>
                    <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Tables</span>
                      <input
                        type="number"
                        className="admin-form-input"
                        value={section.table_count}
                        onChange={(e) => handleSectionChange(i, "table_count", e.target.value)}
                        placeholder="# Tables"
                        min="1"
                        step="1"
                        style={{ fontSize: 13, width: 70 }}
                      />
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Seats/Table</span>
                      <input
                        type="number"
                        className="admin-form-input"
                        value={section.seats_per_table}
                        onChange={(e) => handleSectionChange(i, "seats_per_table", e.target.value)}
                        placeholder="Seats/Table"
                        min="1"
                        step="1"
                        style={{ fontSize: 13, width: 70 }}
                      />
                    </label>
                    <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>
                      = {(parseInt(section.table_count) || 0) * (parseInt(section.seats_per_table) || 0)} seats
                    </span>
                  </>
                )}
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addSection}
            style={{
              marginTop: 12, padding: "6px 14px", borderRadius: 6,
              background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)",
              color: "#818cf8", fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}
          >
            + Add Section
          </button>
        </div>

        {/* Preview area */}
        {previewData && (
          <div style={{
            padding: 16, borderRadius: 10,
            background: "rgba(208,194,144,0.04)",
            border: "1px solid rgba(208,194,144,0.12)",
          }}>
            <span style={{ color: "#d0c290", fontWeight: 700, fontSize: 13, display: "block", marginBottom: 8 }}>
              Chart Preview
            </span>
            <SeatingPreview data={previewData} />
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={handleSave}
            disabled={saving || generating}
            style={{
              padding: "12px 28px", borderRadius: 8,
              background: "#d0c290", color: "#0b0d1d",
              border: "none", fontWeight: 700, fontSize: 14,
              cursor: saving ? "wait" : "pointer",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Saving..." : generating ? "Generating Seats..." : "Save & Generate Seats"}
          </button>

          {savedChartId && (
            <button
              onClick={handlePreview}
              style={{
                padding: "12px 28px", borderRadius: 8,
                background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)",
                color: "#818cf8", fontWeight: 600, fontSize: 14,
                cursor: "pointer",
              }}
            >
              Preview Chart
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Mini preview renderer for the seating chart */
function SeatingPreview({ data }: { data: Record<string, unknown> }) {
  type PreviewSection = {
    section_name: string;
    color: string;
    price_tier: number;
    layout_type?: string;
    rows: Array<{
      row_label: string;
      seats: Array<{
        id: string;
        seat_number: string;
        x_position: number;
        y_position: number;
        status: string;
      }>;
    }>;
  };

  const sections = (data.sections || []) as PreviewSection[];

  if (sections.length === 0) {
    return <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>No sections to preview.</p>;
  }

  const isSectionTable = (sec: PreviewSection) =>
    sec.layout_type === "tables" || (sec.rows.length > 0 && sec.rows[0].row_label.startsWith("T"));

  // Group consecutive row sections side-by-side; table sections standalone
  type PreviewGroup = { type: "row-group" | "table"; sections: PreviewSection[] };
  const groups: PreviewGroup[] = [];
  for (const sec of sections) {
    if (isSectionTable(sec)) {
      groups.push({ type: "table", sections: [sec] });
    } else {
      const last = groups[groups.length - 1];
      if (last && last.type === "row-group") {
        last.sections.push(sec);
      } else {
        groups.push({ type: "row-group", sections: [sec] });
      }
    }
  }

  const renderSectionHeader = (section: PreviewSection) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
      <div style={{ width: 12, height: 12, borderRadius: 3, background: section.color }} />
      <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 600 }}>
        {section.section_name} — ${section.price_tier}
      </span>
    </div>
  );

  const seatColor = (status: string, color: string) =>
    status === "sold" ? "rgba(255,255,255,0.15)" : status === "held" ? "#f59e0b" : color;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {groups.map((group, gIdx) => {
        if (group.type === "table") {
          const section = group.sections[0];
          return (
            <div key={`g-${gIdx}`}>
              {renderSectionHeader(section)}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 24, padding: "8px 0" }}>
                {section.rows.map((table, tIdx) => {
                  const seatCount = table.seats.length;
                  const tableRadius = 24;
                  const seatOrbit = 42;
                  const seatSize = 14;
                  const containerSize = (seatOrbit + seatSize) * 2 + 4;

                  return (
                    <div key={tIdx} style={{ position: "relative", width: containerSize, height: containerSize }}>
                      <div style={{
                        position: "absolute", left: "50%", top: "50%",
                        transform: "translate(-50%, -50%)",
                        width: tableRadius * 2, height: tableRadius * 2,
                        borderRadius: "50%",
                        background: section.color + "20",
                        border: `1.5px solid ${section.color}40`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <span style={{ color: section.color, fontSize: 10, fontWeight: 700 }}>
                          {table.row_label}
                        </span>
                      </div>
                      {table.seats.map((seat, seatIdx) => {
                        const angle = (2 * Math.PI * seatIdx) / seatCount - Math.PI / 2;
                        const cx = containerSize / 2 + seatOrbit * Math.cos(angle) - seatSize / 2;
                        const cy = containerSize / 2 + seatOrbit * Math.sin(angle) - seatSize / 2;
                        return (
                          <div
                            key={seat.id}
                            title={`${section.section_name} ${table.row_label} Seat ${seat.seat_number}`}
                            style={{
                              position: "absolute", left: cx, top: cy,
                              width: seatSize, height: seatSize, borderRadius: "50%",
                              background: seatColor(seat.status, section.color),
                              opacity: seat.status === "sold" ? 0.3 : 0.8,
                            }}
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }

        // Row group: render side-by-side with aisle
        return (
          <div key={`g-${gIdx}`} style={{ display: "flex", gap: 32, justifyContent: "center" }}>
            {group.sections.map((section, sIdx) => (
              <div key={sIdx}>
                {renderSectionHeader(section)}
                {section.rows.map((row, rIdx) => (
                  <div key={rIdx} style={{ display: "flex", alignItems: "center", gap: 2, marginBottom: 2 }}>
                    <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, width: 20, textAlign: "right", marginRight: 4 }}>
                      {row.row_label}
                    </span>
                    {row.seats.map((seat) => (
                      <div
                        key={seat.id}
                        title={`${section.section_name} Row ${row.row_label} Seat ${seat.seat_number}`}
                        style={{
                          width: 14, height: 14, borderRadius: 3,
                          background: seatColor(seat.status, section.color),
                          opacity: seat.status === "sold" ? 0.3 : 0.8,
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      })}

      <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: "#6366f1" }} /> Available
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: "#f59e0b" }} /> Held
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} /> Sold
        </span>
      </div>
    </div>
  );
}
