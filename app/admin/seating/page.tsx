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

export default function AdminSeatingPage() {
  const router = useRouter();
  const [charts, setCharts] = useState<ChartSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editingChartId, setEditingChartId] = useState<string | null>(null);
  const venueId = getCookie("venue-id") || undefined;

  const loadCharts = () => {
    setLoading(true);
    const url = venueId ? `/api/seating/charts?venue_id=${venueId}` : "/api/seating/charts";
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setCharts(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadCharts(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (chartId: string) => {
    if (!confirm("Delete this seating chart? This cannot be undone.")) return;
    await fetch(`/api/seating/charts/${chartId}`, { method: "DELETE" });
    loadCharts();
  };

  if (showEditor) {
    return (
      <div className="admin-form-page">
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

  return (
    <div className="admin-form-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 className="admin-page-title" style={{ margin: 0 }}>Seating Charts</h1>
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
        <button
          onClick={() => router.push("/admin/seating/ai-generator")}
          style={{
            padding: "10px 20px", borderRadius: 8,
            background: "linear-gradient(135deg, #6366f1, #818cf8)",
            color: "#fff",
            border: "none", fontWeight: 700, fontSize: 13,
            cursor: "pointer",
          }}
        >
          AI Generator
        </button>
      </div>

      {loading ? (
        <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading...</p>
      ) : charts.length === 0 ? (
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
                  onClick={() => handleDelete(chart.id)}
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
      )}
    </div>
  );
}
