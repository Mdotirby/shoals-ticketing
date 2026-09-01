"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getCookie } from "@/lib/cookies";

type LayoutSummary = {
  id: string;
  name: string;
  room_width_ft: number;
  room_height_ft: number;
  created_at: string;
};

export default function AdminSeatingPage() {
  const router = useRouter();
  const [layouts, setLayouts] = useState<LayoutSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const venueId = getCookie("venue-id") || undefined;

  const loadLayouts = () => {
    const url = venueId ? `/api/seating/layouts?venue_id=${venueId}` : "/api/seating/layouts";
    fetch(url).then((r) => r.json()).then((data) => {
      if (Array.isArray(data)) setLayouts(data);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { loadLayouts(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this layout and all its seats? This cannot be undone.")) return;
    await fetch(`/api/seating/layouts/${id}`, { method: "DELETE" });
    loadLayouts();
  };

  return (
    <div className="admin-form-page" style={{ maxWidth: "100%", width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 className="admin-page-title" style={{ margin: 0 }}>Seating Layouts</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => router.push("/dashboard/layout-builder/quick-build")}
            style={{
              padding: "10px 20px", borderRadius: 8,
              background: "linear-gradient(135deg, #10b981, #34d399)",
              color: "#fff", border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ marginRight: 6, verticalAlign: -2 }}>
              <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />
            </svg>
            Quick Build
          </button>
          <button
            onClick={() => router.push("/dashboard/layout-builder/new")}
            style={{
              padding: "10px 20px", borderRadius: 8,
              background: "linear-gradient(135deg, #6366f1, #818cf8)",
              color: "#fff", border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer",
            }}
          >
            + Custom Layout
          </button>
        </div>
      </div>

      {loading ? (
        <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading...</p>
      ) : layouts.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", borderRadius: 12, border: "1px dashed rgba(99,102,241,0.3)", color: "rgba(255,255,255,0.4)" }}>
          <p style={{ fontSize: 14 }}>No seating layouts yet.</p>
          <p style={{ fontSize: 12, marginTop: 8 }}>Create a layout using the generator tools — no file imports needed.</p>
          <button onClick={() => router.push("/dashboard/layout-builder/new")}
            style={{ marginTop: 16, padding: "10px 24px", borderRadius: 8, background: "#6366f1", color: "#fff", border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            Create Your First Layout
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {layouts.map((layout) => (
            <div key={layout.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderRadius: 10, background: "rgba(99,102,241,0.04)", border: "1px solid rgba(99,102,241,0.1)" }}>
              <div>
                <div style={{ color: "#a5b4fc", fontWeight: 700, fontSize: 14 }}>{layout.name}</div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 4 }}>
                  {layout.room_width_ft}×{layout.room_height_ft} ft · Created {new Date(layout.created_at).toLocaleDateString()}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => router.push(`/dashboard/layout-builder/${layout.id}`)}
                  style={{ padding: "6px 14px", borderRadius: 6, background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", color: "#a5b4fc", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  Open Builder
                </button>
                <button onClick={() => handleDelete(layout.id)}
                  style={{ padding: "6px 14px", borderRadius: 6, background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.2)", color: "#ff6b6b", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
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
