"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCookie } from "@/lib/cookies";

type CohortSpec = { key: string; label: string; filter: string };
type BuiltCohort = { key: string; label: string; size: number; hashed_emails: string[] | null };

export default function CohortsPage() {
  const venueId = getCookie("venue-id") || "";
  const [specs, setSpecs] = useState<CohortSpec[]>([]);
  const [built, setBuilt] = useState<BuiltCohort[]>([]);
  const [building, setBuilding] = useState(false);

  useEffect(() => {
    fetch("/api/email-engine/cohorts").then((r) => r.json()).then((d) => {
      if (Array.isArray(d)) setSpecs(d);
    });
  }, []);

  const buildAll = async () => {
    setBuilding(true);
    try {
      const q = venueId ? `&venue_id=${venueId}` : "";
      const res = await fetch(`/api/email-engine/cohorts?build=all${q}`);
      const j = await res.json();
      if (Array.isArray(j)) setBuilt(j);
    } finally { setBuilding(false); }
  };

  const downloadCohort = async (key: string) => {
    const q = venueId ? `&venue_id=${venueId}` : "";
    const res = await fetch(`/api/email-engine/cohorts?key=${key}${q}`);
    const j = await res.json();
    if (!res.ok || !Array.isArray(j.hashed_emails)) {
      alert(j.error || "Build failed");
      return;
    }
    const blob = new Blob([j.hashed_emails.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${key}-sha256.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="admin-form-page">
      <Link href="/admin/email" style={{ color: "rgba(208,194,144,0.7)", textDecoration: "none", fontSize: 13 }}>← Email Engine</Link>
      <h1 className="admin-page-title" style={{ marginTop: 8 }}>Cohort Exports</h1>
      <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: 16 }}>
        Hand off engaged audiences to the Ad Engine. Emails are SHA-256 lowercased — the format accepted by Meta and Snap custom audiences.
      </p>

      <button onClick={buildAll} disabled={building} className="admin-form-submit" style={{ padding: "10px 20px", fontSize: 13, marginBottom: 16 }}>
        {building ? "Building…" : "Build all cohorts"}
      </button>

      <div style={{ display: "grid", gap: 10 }}>
        {specs.map((s) => {
          const b = built.find((x) => x.key === s.key);
          return (
            <div key={s.key} style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 12,
              padding: "14px 18px",
              display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10,
            }}>
              <div>
                <div style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>{s.label}</div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 4, fontFamily: "monospace" }}>{s.filter}</div>
                {b && <div style={{ color: "#d0c290", fontSize: 12, marginTop: 4 }}>{b.size.toLocaleString()} contacts</div>}
              </div>
              <button onClick={() => downloadCohort(s.key)}
                style={{ padding: "8px 14px", fontSize: 12, background: "rgba(208,194,144,0.15)", color: "#d0c290", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>
                Download SHA-256
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
