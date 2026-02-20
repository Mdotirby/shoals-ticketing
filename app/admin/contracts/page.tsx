"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCookie } from "@/lib/cookies";
import type { Contract } from "@/lib/types/contract";

const statusColors: Record<string, { bg: string; color: string }> = {
  draft:  { bg: "rgba(255,200,50,0.12)", color: "#e8c94a" },
  sent:   { bg: "rgba(100,180,255,0.12)", color: "#6ab4ff" },
  signed: { bg: "rgba(100,200,100,0.15)", color: "#7ddb7d" },
  void:   { bg: "rgba(255,100,100,0.12)", color: "#ff9a9a" },
};

const sourceColors: Record<string, { bg: string; color: string }> = {
  generated: { bg: "rgba(208,194,144,0.15)", color: "#d0c290" },
  uploaded:  { bg: "rgba(180,180,255,0.12)", color: "#b4b4ff" },
};

type ContractWithOffer = Contract & {
  artist_name?: string;
  event_date?: string;
};

export default function ContractsListPage() {
  const router = useRouter();
  const [contracts, setContracts] = useState<ContractWithOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const venueId = getCookie("venue-id");
    const url = venueId
      ? `/api/contracts?venue_id=${venueId}`
      : "/api/contracts";

    fetch(url)
      .then((r) => r.json())
      .then(async (data) => {
        if (data.error) {
          setError(data.error);
          return;
        }

        // Enrich with offer data (artist name, event date)
        const enriched: ContractWithOffer[] = [];
        for (const c of data as Contract[]) {
          let artist_name = "";
          let event_date = "";
          if (c.offer_id) {
            try {
              const offerRes = await fetch(`/api/offers/${c.offer_id}`);
              if (offerRes.ok) {
                const offer = await offerRes.json();
                artist_name = offer.artist_name || "";
                event_date = offer.event_date || "";
              }
            } catch {
              /* ignore */
            }
          }
          enriched.push({ ...c, artist_name, event_date });
        }
        setContracts(enriched);
      })
      .catch(() => setError("Failed to load contracts"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="admin-form-page">
        <h1 className="admin-page-title">Loading…</h1>
      </div>
    );
  }

  return (
    <div className="admin-form-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">Contracts</h1>
      </div>

      {error && <div className="admin-form-error">{error}</div>}

      {contracts.length === 0 && !error && (
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginTop: 16 }}>
          No contracts yet. Generate or upload a contract from the Booking detail page.
        </p>
      )}

      {contracts.length > 0 && (
        <div style={{ overflowX: "auto", marginTop: 16 }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13,
              color: "#fff",
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: "2px solid rgba(208,194,144,0.3)",
                  textAlign: "left",
                }}
              >
                <th style={{ padding: "8px 6px", color: "rgba(255,255,255,0.5)" }}>Artist</th>
                <th style={{ padding: "8px 6px", color: "rgba(255,255,255,0.5)" }}>Event Date</th>
                <th style={{ padding: "8px 6px", color: "rgba(255,255,255,0.5)" }}>Status</th>
                <th style={{ padding: "8px 6px", color: "rgba(255,255,255,0.5)" }}>Source</th>
                <th style={{ padding: "8px 6px", color: "rgba(255,255,255,0.5)" }}>Created</th>
                <th style={{ padding: "8px 6px", color: "rgba(255,255,255,0.5)" }}></th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => {
                const sc = statusColors[c.status] || statusColors.draft;
                const src = sourceColors[c.source] || sourceColors.generated;
                return (
                  <tr
                    key={c.id}
                    style={{
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                      cursor: "pointer",
                    }}
                    onClick={() => {
                      if (c.offer_id) router.push(`/admin/offers/${c.offer_id}`);
                    }}
                  >
                    <td style={{ padding: "10px 6px", fontWeight: 600 }}>
                      {c.artist_name || "—"}
                    </td>
                    <td style={{ padding: "10px 6px" }}>
                      {c.event_date
                        ? ((d: string) => (d && d.length === 10 && d[4] === "-") ? new Date(d + "T12:00:00") : new Date(d.replace(/[+-]\d{2}:\d{2}$/, "").replace(/Z$/, "")))(c.event_date).toLocaleDateString()
                        : "—"}
                    </td>
                    <td style={{ padding: "10px 6px" }}>
                      <span
                        style={{
                          background: sc.bg,
                          color: sc.color,
                          padding: "3px 10px",
                          borderRadius: 4,
                          fontSize: 12,
                          fontWeight: 600,
                          textTransform: "uppercase",
                        }}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td style={{ padding: "10px 6px" }}>
                      <span
                        style={{
                          background: src.bg,
                          color: src.color,
                          padding: "3px 10px",
                          borderRadius: 4,
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {c.source}
                      </span>
                    </td>
                    <td style={{ padding: "10px 6px", color: "rgba(255,255,255,0.5)" }}>
                      {new Date(c.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: "10px 6px" }}>
                      {c.offer_id && (
                        <button
                          className="admin-sponsor-edit-btn"
                          style={{ fontSize: 12, padding: "4px 10px" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/admin/offers/${c.offer_id}`);
                          }}
                        >
                          View Offer →
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
