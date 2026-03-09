"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { generateSeatingSvg } from "@/lib/seating/generateSeatingSvg";
import { getCookie } from "@/lib/cookies";

type RowDef = { row: string; seats: number };
type TableDef = { table: string; seats: number };
type SectionDef = {
  name: string;
  type: "rows" | "tables";
  rows?: RowDef[];
  tables?: TableDef[];
};
type SeatingLayout = {
  sections: SectionDef[];
  summary?: {
    total_sections: number;
    total_rows: number;
    total_tables: number;
    total_seats: number;
  };
};

export default function AIPreviewPage() {
  const router = useRouter();
  const [layout, setLayout] = useState<SeatingLayout | null>(null);
  const [svgContent, setSvgContent] = useState<string>("");
  const [templateName, setTemplateName] = useState("AI Generated Chart");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const venueId = getCookie("venue-id") || "";

  // Mobile touch state for pinch-zoom and drag
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
  const lastPinchDistRef = useRef<number | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("ai-seating-result");
    const storedImage = sessionStorage.getItem("ai-seating-image-url");
    if (!stored) {
      router.push("/admin/seating/ai-generator");
      return;
    }
    try {
      const parsed = JSON.parse(stored) as SeatingLayout;
      setLayout(parsed);
      setSvgContent(generateSeatingSvg(parsed));
    } catch {
      setError("Failed to parse AI result");
    }
    if (storedImage) setImageUrl(storedImage);
  }, [router]);

  const regenerateSvg = useCallback((l: SeatingLayout) => {
    setSvgContent(generateSeatingSvg(l));
  }, []);

  // ── Section editing ──
  const updateSectionName = (sIdx: number, name: string) => {
    setLayout((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, sections: prev.sections.map((s, i) => i === sIdx ? { ...s, name } : s) };
      regenerateSvg(updated);
      return updated;
    });
  };

  const updateRowLabel = (sIdx: number, rIdx: number, label: string) => {
    setLayout((prev) => {
      if (!prev) return prev;
      const updated = {
        ...prev,
        sections: prev.sections.map((s, i) =>
          i === sIdx && s.rows
            ? { ...s, rows: s.rows.map((r, j) => j === rIdx ? { ...r, row: label } : r) }
            : s
        ),
      };
      regenerateSvg(updated);
      return updated;
    });
  };

  const updateRowSeats = (sIdx: number, rIdx: number, seats: number) => {
    setLayout((prev) => {
      if (!prev) return prev;
      const updated = {
        ...prev,
        sections: prev.sections.map((s, i) =>
          i === sIdx && s.rows
            ? { ...s, rows: s.rows.map((r, j) => j === rIdx ? { ...r, seats } : r) }
            : s
        ),
      };
      regenerateSvg(updated);
      return updated;
    });
  };

  const updateTableLabel = (sIdx: number, tIdx: number, label: string) => {
    setLayout((prev) => {
      if (!prev) return prev;
      const updated = {
        ...prev,
        sections: prev.sections.map((s, i) =>
          i === sIdx && s.tables
            ? { ...s, tables: s.tables.map((t, j) => j === tIdx ? { ...t, table: label } : t) }
            : s
        ),
      };
      regenerateSvg(updated);
      return updated;
    });
  };

  const updateTableSeats = (sIdx: number, tIdx: number, seats: number) => {
    setLayout((prev) => {
      if (!prev) return prev;
      const updated = {
        ...prev,
        sections: prev.sections.map((s, i) =>
          i === sIdx && s.tables
            ? { ...s, tables: s.tables.map((t, j) => j === tIdx ? { ...t, seats } : t) }
            : s
        ),
      };
      regenerateSvg(updated);
      return updated;
    });
  };

  // ── Touch handlers for mobile pinch-zoom + drag ──
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchDistRef.current = Math.sqrt(dx * dx + dy * dy);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && isDragging && lastTouchRef.current) {
      const dx = e.touches[0].clientX - lastTouchRef.current.x;
      const dy = e.touches[0].clientY - lastTouchRef.current.y;
      setTranslate((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2 && lastPinchDistRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const scaleDelta = dist / lastPinchDistRef.current;
      setScale((prev) => Math.min(3, Math.max(0.3, prev * scaleDelta)));
      lastPinchDistRef.current = dist;
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    lastTouchRef.current = null;
    lastPinchDistRef.current = null;
  };

  // Mouse wheel zoom for desktop
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((prev) => Math.min(3, Math.max(0.3, prev * delta)));
  };

  // ── Save template ──
  const handleSave = async () => {
    if (!layout) return;
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/seating/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: templateName.trim() || "AI Generated Chart",
          venue_id: venueId || null,
          svg_map: svgContent,
          layout_json: layout,
          source_image_url: imageUrl,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save template");
      }

      setSaved(true);
      sessionStorage.removeItem("ai-seating-result");
      sessionStorage.removeItem("ai-seating-image-url");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  // ── Summary metrics ──
  const summary = layout
    ? {
        total_sections: layout.sections.length,
        total_rows: layout.sections.reduce((sum, s) => sum + (s.rows?.length || 0), 0),
        total_tables: layout.sections.reduce((sum, s) => sum + (s.tables?.length || 0), 0),
        total_seats: layout.sections.reduce((sum, s) => {
          if (s.rows) return sum + s.rows.reduce((rs, r) => rs + r.seats, 0);
          if (s.tables) return sum + s.tables.reduce((ts, t) => ts + t.seats, 0);
          return sum;
        }, 0),
      }
    : null;

  if (!layout) {
    return (
      <div className="admin-form-page">
        <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading...</p>
      </div>
    );
  }

  if (saved) {
    return (
      <div className="admin-form-page" style={{ textAlign: "center", padding: "60px 20px" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>&#10003;</div>
        <h2 style={{ color: "#d0c290", marginBottom: 12 }}>Template Saved!</h2>
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, marginBottom: 24 }}>
          Your AI-generated seating template is now available when creating events with reserved seating.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button
            onClick={() => router.push("/admin/seating")}
            style={{
              padding: "10px 24px", borderRadius: 8,
              background: "#d0c290", color: "#0b0d1d",
              border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer",
            }}
          >
            Back to Seating Charts
          </button>
          <button
            onClick={() => router.push("/admin/seating/ai-generator")}
            style={{
              padding: "10px 24px", borderRadius: 8,
              background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)",
              color: "#818cf8", fontWeight: 600, fontSize: 13, cursor: "pointer",
            }}
          >
            Generate Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-form-page">
      <button
        onClick={() => router.push("/admin/seating/ai-generator")}
        style={{
          background: "none", border: "none", color: "#d0c290",
          cursor: "pointer", fontSize: 13, marginBottom: 16,
        }}
      >
        &larr; Back to Generator
      </button>

      <h1 className="admin-page-title">Preview & Edit Seating Chart</h1>

      {error && <div className="admin-form-error">{error}</div>}

      {/* Summary Metrics */}
      {summary && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12,
          marginBottom: 24,
        }}>
          {[
            { label: "Sections", value: summary.total_sections },
            { label: "Rows", value: summary.total_rows },
            { label: "Tables", value: summary.total_tables },
            { label: "Total Seats", value: summary.total_seats },
          ].map((m) => (
            <div
              key={m.label}
              style={{
                padding: "12px 16px", borderRadius: 10, textAlign: "center",
                background: "rgba(208,194,144,0.04)",
                border: "1px solid rgba(208,194,144,0.1)",
              }}
            >
              <div style={{ color: "#d0c290", fontWeight: 700, fontSize: 22 }}>{m.value}</div>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 2 }}>{m.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* SVG Preview with touch support */}
      <div
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
        style={{
          overflow: "hidden",
          borderRadius: 12,
          border: "1px solid rgba(208,194,144,0.15)",
          background: "rgba(0,0,0,0.3)",
          marginBottom: 24,
          touchAction: "none",
          minHeight: 300,
        }}
      >
        <div
          style={{
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
            transformOrigin: "center top",
            transition: isDragging ? "none" : "transform 0.1s ease",
            padding: 16,
          }}
          dangerouslySetInnerHTML={{ __html: svgContent }}
        />
      </div>

      {/* Zoom controls */}
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 24 }}>
        <button
          onClick={() => setScale((s) => Math.min(3, s * 1.2))}
          style={{
            padding: "6px 16px", borderRadius: 6,
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
            color: "rgba(255,255,255,0.6)", fontSize: 14, cursor: "pointer",
          }}
        >
          +
        </button>
        <button
          onClick={() => { setScale(1); setTranslate({ x: 0, y: 0 }); }}
          style={{
            padding: "6px 16px", borderRadius: 6,
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
            color: "rgba(255,255,255,0.6)", fontSize: 12, cursor: "pointer",
          }}
        >
          Reset
        </button>
        <button
          onClick={() => setScale((s) => Math.max(0.3, s * 0.8))}
          style={{
            padding: "6px 16px", borderRadius: 6,
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
            color: "rgba(255,255,255,0.6)", fontSize: 14, cursor: "pointer",
          }}
        >
          −
        </button>
      </div>

      {/* Section Editor */}
      <div style={{
        padding: 16, borderRadius: 12,
        background: "rgba(99,102,241,0.04)",
        border: "1px solid rgba(99,102,241,0.12)",
        marginBottom: 24,
      }}>
        <span style={{ color: "#818cf8", fontWeight: 700, fontSize: 14, display: "block", marginBottom: 12 }}>
          Edit Sections
        </span>

        {layout.sections.map((section, sIdx) => (
          <div key={sIdx} style={{
            padding: 12, borderRadius: 8,
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
            marginBottom: 12,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <input
                type="text"
                value={section.name}
                onChange={(e) => updateSectionName(sIdx, e.target.value)}
                style={{
                  flex: 1, padding: "6px 10px", borderRadius: 6, fontSize: 13,
                  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                  color: "#fff", fontWeight: 600,
                }}
              />
              <span style={{
                padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                background: section.type === "tables" ? "rgba(245,158,11,0.15)" : "rgba(99,102,241,0.15)",
                color: section.type === "tables" ? "#f59e0b" : "#818cf8",
              }}>
                {section.type}
              </span>
            </div>

            {section.type === "rows" && section.rows && (
              <div style={{ display: "grid", gap: 4 }}>
                {section.rows.map((row, rIdx) => (
                  <div key={rIdx} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, width: 40 }}>Row:</span>
                    <input
                      type="text"
                      value={row.row}
                      onChange={(e) => updateRowLabel(sIdx, rIdx, e.target.value)}
                      style={{
                        width: 50, padding: "4px 8px", borderRadius: 4, fontSize: 12,
                        background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)",
                        color: "#fff", textAlign: "center",
                      }}
                    />
                    <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>Seats:</span>
                    <input
                      type="number"
                      value={row.seats}
                      onChange={(e) => updateRowSeats(sIdx, rIdx, parseInt(e.target.value) || 0)}
                      min="0"
                      style={{
                        width: 60, padding: "4px 8px", borderRadius: 4, fontSize: 12,
                        background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)",
                        color: "#fff", textAlign: "center",
                      }}
                    />
                  </div>
                ))}
              </div>
            )}

            {section.type === "tables" && section.tables && (
              <div style={{ display: "grid", gap: 4 }}>
                {section.tables.map((table, tIdx) => (
                  <div key={tIdx} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, width: 40 }}>Table:</span>
                    <input
                      type="text"
                      value={table.table}
                      onChange={(e) => updateTableLabel(sIdx, tIdx, e.target.value)}
                      style={{
                        width: 60, padding: "4px 8px", borderRadius: 4, fontSize: 12,
                        background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)",
                        color: "#fff", textAlign: "center",
                      }}
                    />
                    <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>Seats:</span>
                    <input
                      type="number"
                      value={table.seats}
                      onChange={(e) => updateTableSeats(sIdx, tIdx, parseInt(e.target.value) || 0)}
                      min="0"
                      style={{
                        width: 60, padding: "4px 8px", borderRadius: 4, fontSize: 12,
                        background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)",
                        color: "#fff", textAlign: "center",
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Template Name + Save */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label style={{ flex: 1, minWidth: 200 }}>
          <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
            Template Name
          </span>
          <input
            type="text"
            className="admin-form-input"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="e.g. Main Venue Layout"
          />
        </label>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: "12px 32px", borderRadius: 8,
            background: "#d0c290", color: "#0b0d1d",
            border: "none", fontWeight: 700, fontSize: 14,
            cursor: saving ? "wait" : "pointer",
            opacity: saving ? 0.6 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {saving ? "Saving..." : "Approve & Save Template"}
        </button>
      </div>
    </div>
  );
}
