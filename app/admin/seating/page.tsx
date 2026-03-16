"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AdminSeatingChartEditor from "@/app/components/seating/AdminSeatingChartEditor";
import { getCookie } from "@/lib/cookies";

type ChartSummary = {
  id: string;
  name: string;
  venue_name: string | null;
  total_sections: number;
  created_at: string;
};

type LayoutSummary = {
  id: string;
  name: string;
  background_image_url: string | null;
  created_at: string;
};

export default function AdminSeatingPage() {
  const router = useRouter();
  const [charts, setCharts] = useState<ChartSummary[]>([]);
  const [layouts, setLayouts] = useState<LayoutSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editingChartId, setEditingChartId] = useState<string | null>(null);
  const [tab, setTab] = useState<"layouts" | "charts">("layouts");
  const venueId = getCookie("venue-id") || undefined;

  const loadCharts = () => {
    const url = venueId ? `/api/seating/charts?venue_id=${venueId}` : "/api/seating/charts";
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setCharts(data);
      })
      .catch(() => {});
  };

  const loadLayouts = () => {
    const url = venueId ? `/api/layouts?venue_id=${venueId}` : "/api/layouts";
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setLayouts(data);
      })
      .catch(() => {});
  };

  useEffect(() => {
    Promise.all([
      fetch(venueId ? `/api/seating/charts?venue_id=${venueId}` : "/api/seating/charts")
        .then((r) => r.json())
        .then((data) => { if (Array.isArray(data)) setCharts(data); })
        .catch(() => {}),
      fetch(venueId ? `/api/layouts?venue_id=${venueId}` : "/api/layouts")
        .then((r) => r.json())
        .then((data) => { if (Array.isArray(data)) setLayouts(data); })
        .catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDeleteChart = async (chartId: string) => {
    if (!confirm("Delete this seating chart? This cannot be undone.")) return;
    await fetch(`/api/seating/charts/${chartId}`, { method: "DELETE" });
    loadCharts();
  };

  const handleDeleteLayout = async (layoutId: string) => {
    if (!confirm("Delete this layout? This cannot be undone.")) return;
    await fetch(`/api/layouts/${layoutId}`, { method: "DELETE" });
    loadLayouts();
  };

  if (showEditor) {
    return (
      <div className="admin-form-page" style={{ maxWidth: "100%", width: "100%" }}>
        <button
          onClick={() => { setShowEditor(false); setEditingChartId(null); loadCharts(); }}
          style={{
            background: "none", border: "none", color: "#d0c290",
            cursor: "pointer", fontSize: 13, marginBottom: 16,
          }}
        >
          &larr; Back to Charts
        </button>
        <AdminSeatingChartEditor
          chartId={editingChartId}
          venueId={venueId}
          onSaved={() => { setShowEditor(false); setEditingChartId(null); loadCharts(); }}
        />
      </div>
    );
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "8px 18px",
    borderRadius: 6,
    background: active ? "rgba(99,102,241,0.2)" : "transparent",
    border: active ? "1px solid rgba(99,102,241,0.3)" : "1px solid transparent",
    color: active ? "#a5b4fc" : "rgba(255,255,255,0.4)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  });

  return (
    <div className="admin-form-page" style={{ maxWidth: "100%", width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 className="admin-page-title" style={{ margin: 0 }}>Seating Management</h1>
        <div style={{ display: "flex", gap: 8 }}>
          {tab === "layouts" && (
            <button
              onClick={() => router.push("/dashboard/seating-editor/new")}
              style={{
                padding: "10px 20px", borderRadius: 8,
                background: "linear-gradient(135deg, #6366f1, #818cf8)",
                color: "#fff",
                border: "none", fontWeight: 700, fontSize: 13,
                cursor: "pointer",
              }}
            >
              + New Layout Builder
            </button>
          )}
          {tab === "charts" && (
            <button
              onClick={() => { setShowEditor(true); setEditingChartId(null); }}
              style={{
                padding: "10px 20px", borderRadius: 8,
                background: "#d0c290", color: "#0b0d1d",
                border: "none", fontWeight: 700, fontSize: 13,
                cursor: "pointer",
              }}
            >
              + New Chart
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <button style={tabStyle(tab === "layouts")} onClick={() => setTab("layouts")}>
          Layout Builder
        </button>
        <button style={tabStyle(tab === "charts")} onClick={() => setTab("charts")}>
          Classic Charts
        </button>
      </div>

      {loading ? (
        <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading...</p>
      ) : tab === "layouts" ? (
        /* ── LAYOUTS TAB ── */
        layouts.length === 0 ? (
          <div style={{
            padding: 40, textAlign: "center", borderRadius: 12,
            border: "1px dashed rgba(99,102,241,0.3)",
            color: "rgba(255,255,255,0.4)",
          }}>
            <p style={{ fontSize: 14 }}>No seating layouts yet.</p>
            <p style={{ fontSize: 12, marginTop: 8 }}>
              Create a drag-and-drop layout by uploading a PDF background and placing seating objects.
            </p>
            <button
              onClick={() => router.push("/dashboard/seating-editor/new")}
              style={{
                marginTop: 16, padding: "10px 24px", borderRadius: 8,
                background: "#6366f1", color: "#fff",
                border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer",
              }}
            >
              Create Your First Layout
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {layouts.map((layout) => (
              <div
                key={layout.id}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "16px 20px", borderRadius: 10,
                  background: "rgba(99,102,241,0.04)",
                  border: "1px solid rgba(99,102,241,0.1)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {layout.background_image_url && (
                    <div
                      style={{
                        width: 48, height: 36, borderRadius: 4, overflow: "hidden",
                        background: "#1a1a2e",
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={layout.background_image_url}
                        alt=""
                        style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.6 }}
                      />
                    </div>
                  )}
                  <div>
                    <div style={{ color: "#a5b4fc", fontWeight: 700, fontSize: 14 }}>{layout.name}</div>
                    <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 4 }}>
                      Created {new Date(layout.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => router.push(`/dashboard/seating-editor/${layout.id}`)}
                    style={{
                      padding: "6px 14px", borderRadius: 6,
                      background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)",
                      color: "#a5b4fc", fontSize: 12, fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    Open Editor
                  </button>
                  <button
                    onClick={() => handleDeleteLayout(layout.id)}
                    style={{
                      padding: "6px 14px", borderRadius: 6,
                      background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.2)",
                      color: "#ff6b6b", fontSize: 12, fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* ── CLASSIC CHARTS TAB ── */
        charts.length === 0 ? (
          <div style={{
            padding: 40, textAlign: "center", borderRadius: 12,
            border: "1px dashed rgba(208,194,144,0.2)",
            color: "rgba(255,255,255,0.4)",
          }}>
            <p style={{ fontSize: 14 }}>No seating charts yet.</p>
            <p style={{ fontSize: 12, marginTop: 8 }}>Create your first chart to enable reserved seating for events.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {charts.map((chart) => (
              <div
                key={chart.id}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "16px 20px", borderRadius: 10,
                  background: "rgba(208,194,144,0.04)",
                  border: "1px solid rgba(208,194,144,0.1)",
                }}
              >
                <div>
                  <div style={{ color: "#d0c290", fontWeight: 700, fontSize: 14 }}>{chart.name}</div>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 4 }}>
                    {chart.total_sections} section{chart.total_sections !== 1 ? "s" : ""}
                    {chart.venue_name && ` · ${chart.venue_name}`}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => { setEditingChartId(chart.id); setShowEditor(true); }}
                    style={{
                      padding: "6px 14px", borderRadius: 6,
                      background: "rgba(208,194,144,0.1)", border: "1px solid rgba(208,194,144,0.2)",
                      color: "#d0c290", fontSize: 12, fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteChart(chart.id)}
                    style={{
                      padding: "6px 14px", borderRadius: 6,
                      background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.2)",
                      color: "#ff6b6b", fontSize: 12, fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
