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
    row_count: "",
    seats_per_row: "",
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
            }, i: number) => ({
              section_name: s.section_name,
              color: s.color || SECTION_COLORS[i % SECTION_COLORS.length],
              price_tier: String(s.price_tier),
              row_count: String(s.row_count),
              seats_per_row: s.row_count > 0 ? String(Math.floor(s.seat_count / s.row_count)) : "0",
            }))
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
      if (!s.row_count || parseInt(s.row_count) < 1) {
        setError(`Section ${i + 1}: row count must be at least 1`);
        return;
      }
      if (!s.seats_per_row || parseInt(s.seats_per_row) < 1) {
        setError(`Section ${i + 1}: seats per row must be at least 1`);
        return;
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
          row_count: parseInt(s.row_count),
          seats_per_row: parseInt(s.seats_per_row),
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

  const totalSeats = sections.reduce(
    (sum, s) => sum + (parseInt(s.row_count) || 0) * (parseInt(s.seats_per_row) || 0),
    0
  );

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
                display: "grid",
                gridTemplateColumns: "24px 1fr 80px 80px 80px 80px 32px",
                gap: 8,
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              {/* Color indicator */}
              <div
                style={{
                  width: 20, height: 20, borderRadius: 4,
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
                style={{ fontSize: 13 }}
              />
              <input
                type="number"
                className="admin-form-input"
                value={section.price_tier}
                onChange={(e) => handleSectionChange(i, "price_tier", e.target.value)}
                placeholder="Price"
                min="0"
                step="0.01"
                style={{ fontSize: 13 }}
              />
              <input
                type="number"
                className="admin-form-input"
                value={section.row_count}
                onChange={(e) => handleSectionChange(i, "row_count", e.target.value)}
                placeholder="Rows"
                min="1"
                step="1"
                style={{ fontSize: 13 }}
              />
              <input
                type="number"
                className="admin-form-input"
                value={section.seats_per_row}
                onChange={(e) => handleSectionChange(i, "seats_per_row", e.target.value)}
                placeholder="Seats/Row"
                min="1"
                step="1"
                style={{ fontSize: 13 }}
              />
              <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, textAlign: "center" }}>
                {(parseInt(section.row_count) || 0) * (parseInt(section.seats_per_row) || 0)}
              </span>
              {sections.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeSection(i)}
                  style={{
                    background: "none", border: "none", color: "#ff6b6b",
                    cursor: "pointer", fontSize: 16,
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>
              Headers: Color · Name · Price ($) · Rows · Seats/Row · Total
            </span>
          </div>

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
  const sections = (data.sections || []) as Array<{
    section_name: string;
    color: string;
    price_tier: number;
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
  }>;

  if (sections.length === 0) {
    return <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>No sections to preview.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {sections.map((section, sIdx) => (
        <div key={sIdx}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: section.color }} />
            <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 600 }}>
              {section.section_name} — ${section.price_tier}
            </span>
          </div>
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
                    background: seat.status === "sold"
                      ? "rgba(255,255,255,0.15)"
                      : seat.status === "held"
                      ? "#f59e0b"
                      : section.color,
                    opacity: seat.status === "sold" ? 0.3 : 0.8,
                    cursor: "default",
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      ))}
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
