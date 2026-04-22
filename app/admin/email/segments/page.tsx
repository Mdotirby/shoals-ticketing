"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCookie } from "@/lib/cookies";

type Segment = {
  id: string;
  name: string;
  description: string | null;
  last_count: number | null;
  last_evaluated: string | null;
  updated_at: string;
};

export default function SegmentsListPage() {
  const venueId = getCookie("venue-id") || "";
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    const q = venueId ? `?venue_id=${venueId}` : "";
    fetch(`/api/email-engine/segments${q}`)
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setSegments(d); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [venueId]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this segment? Campaigns that use it will lose their audience.")) return;
    const r = await fetch(`/api/email-engine/segments/${id}`, { method: "DELETE" });
    if (r.ok) load();
  };

  return (
    <div className="admin-form-page">
      <Link href="/admin/email" style={{ color: "rgba(208,194,144,0.7)", textDecoration: "none", fontSize: 13 }}>← Email Engine</Link>
      <h1 className="admin-page-title" style={{ marginTop: 8 }}>Segments</h1>
      <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: 16 }}>
        Rule-based audiences. Evaluated live against ticketing + engagement data.
      </p>

      <div style={{ marginBottom: 20 }}>
        <Link href="/admin/email/segments/new" className="admin-form-submit" style={{ display: "inline-block", padding: "10px 20px", fontSize: 13, textDecoration: "none" }}>
          + New Segment
        </Link>
      </div>

      {loading ? <p style={{ color: "rgba(255,255,255,0.4)" }}>Loading…</p>
        : segments.length === 0 ? <p style={{ color: "rgba(255,255,255,0.4)" }}>No segments yet.</p>
        : (
          <div style={{ display: "grid", gap: 10 }}>
            {segments.map((s) => (
              <div key={s.id} style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 12,
                padding: "14px 18px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}>
                <div>
                  <Link href={`/admin/email/segments/${s.id}`} style={{ color: "#fff", fontSize: 14, fontWeight: 600, textDecoration: "none" }}>{s.name}</Link>
                  {s.description && <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, margin: "4px 0 0" }}>{s.description}</p>}
                  <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, margin: "4px 0 0" }}>
                    {s.last_count !== null ? `${s.last_count} contacts` : "not evaluated yet"}
                    {s.last_evaluated && ` · last run ${new Date(s.last_evaluated).toLocaleString()}`}
                  </p>
                </div>
                <button onClick={() => handleDelete(s.id)}
                  style={{ padding: "6px 10px", fontSize: 12, background: "transparent", color: "rgba(255,100,100,0.6)", border: "1px solid rgba(255,100,100,0.2)", borderRadius: 6, cursor: "pointer" }}>
                  Delete
                </button>
              </div>
            ))}
          </div>
        )
      }
    </div>
  );
}
