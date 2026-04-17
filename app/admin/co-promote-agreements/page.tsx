"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCookie } from "@/lib/cookies";
import type { CoPromoteAgreement } from "@/lib/types/co-promote";
import { DEAL_STRUCTURE_LABELS } from "@/lib/types/co-promote";

const statusColors: Record<string, { bg: string; color: string; border: string }> = {
  draft:  { bg: "rgba(255,200,50,0.12)", color: "#e8c94a", border: "rgba(255,200,50,0.3)" },
  sent:   { bg: "rgba(100,180,255,0.12)", color: "#6ab4ff", border: "rgba(100,180,255,0.3)" },
  signed: { bg: "rgba(100,200,100,0.15)", color: "#7ddb7d", border: "rgba(100,200,100,0.3)" },
  void:   { bg: "rgba(255,100,100,0.12)", color: "#ff9a9a", border: "rgba(255,100,100,0.3)" },
};

export default function CoPromoteAgreementsListPage() {
  const [agreements, setAgreements] = useState<CoPromoteAgreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const venueId = getCookie("venue-id");
    const url = venueId
      ? `/api/admin/co-promote-agreements?venue_id=${venueId}`
      : "/api/admin/co-promote-agreements";

    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setAgreements(Array.isArray(data) ? data : []);
      })
      .catch(() => setError("Failed to load agreements"))
      .finally(() => setLoading(false));
  }, []);

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });

  const fmtCurrency = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

  return (
    <div className="admin-form-page">
      <div className="admin-page-header">
        <div>
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            <Link
              href="/admin/contracts"
              style={{
                padding: "4px 12px", fontSize: 12, fontWeight: 600,
                background: "transparent", color: "rgba(255,255,255,0.4)",
                border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6,
                textDecoration: "none",
              }}
            >
              Artist Contracts
            </Link>
            <span
              style={{
                padding: "4px 12px", fontSize: 12, fontWeight: 600,
                background: "rgba(208,194,144,0.15)", color: "#d0c290",
                border: "1px solid rgba(208,194,144,0.3)", borderRadius: 6,
              }}
            >
              Co-Promote Agreements
            </span>
          </div>
          <h1 className="admin-page-title">Co-Promote Agreements</h1>
          <p style={{ color: "rgba(255,255,255,0.5)", margin: "4px 0 0", fontSize: 13 }}>
            Agreements where you go into another venue's space and split revenue
          </p>
        </div>
        <div className="admin-page-header-actions">
          <Link
            href="/admin/co-promote-agreements/new"
            style={{
              display: "inline-block",
              padding: "10px 20px", borderRadius: 8, fontWeight: 700, fontSize: 13,
              background: "rgba(208,194,144,0.15)", border: "1px solid rgba(208,194,144,0.3)",
              color: "#d0c290", textDecoration: "none",
            }}
          >
            + New Agreement
          </Link>
        </div>
      </div>

      {error && <div className="admin-form-error">{error}</div>}

      {loading && (
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginTop: 16 }}>
          Loading…
        </p>
      )}

      {!loading && agreements.length === 0 && !error && (
        <div style={{
          marginTop: 24, padding: "40px 24px", textAlign: "center",
          background: "rgba(255,255,255,0.02)", borderRadius: 12,
          border: "1px dashed rgba(255,255,255,0.1)",
        }}>
          <p style={{ color: "rgba(255,255,255,0.5)", margin: 0, fontSize: 14 }}>
            No co-promote agreements yet.
          </p>
          <p style={{ color: "rgba(255,255,255,0.3)", margin: "8px 0 16px", fontSize: 12 }}>
            Use this to contract with venues you're visiting as a promoter.
          </p>
          <Link
            href="/admin/co-promote-agreements/new"
            style={{
              display: "inline-block", marginTop: 8,
              padding: "10px 20px", borderRadius: 8, fontWeight: 700, fontSize: 13,
              background: "rgba(208,194,144,0.15)", border: "1px solid rgba(208,194,144,0.3)",
              color: "#d0c290", textDecoration: "none",
            }}
          >
            Create Your First Agreement
          </Link>
        </div>
      )}

      {!loading && agreements.length > 0 && (
        <div style={{ overflowX: "auto", marginTop: 16 }}>
          <table
            style={{
              width: "100%", borderCollapse: "collapse", fontSize: 13, color: "#fff",
            }}
          >
            <thead>
              <tr style={{ borderBottom: "2px solid rgba(208,194,144,0.3)", textAlign: "left" }}>
                <th style={{ padding: "10px 12px", color: "rgba(255,255,255,0.5)", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>Agreement #</th>
                <th style={{ padding: "10px 12px", color: "rgba(255,255,255,0.5)", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>Venue</th>
                <th style={{ padding: "10px 12px", color: "rgba(255,255,255,0.5)", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>Event / Date</th>
                <th style={{ padding: "10px 12px", color: "rgba(255,255,255,0.5)", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>Deal</th>
                <th style={{ padding: "10px 12px", color: "rgba(255,255,255,0.5)", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>Deposit</th>
                <th style={{ padding: "10px 12px", color: "rgba(255,255,255,0.5)", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {agreements.map((a) => {
                const sc = statusColors[a.status] ?? statusColors.draft;
                const splitLabel = a.deal_structure === "flat_rent"
                  ? fmtCurrency(a.flat_rent_amount || 0)
                  : `${Number(a.buyer_percentage ?? 0).toFixed(0)}/${Number(a.venue_percentage ?? 0).toFixed(0)}`;
                return (
                  <tr key={a.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 12, color: "#d0c290" }}>
                      {a.agreement_number}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ fontWeight: 600 }}>{a.partner_venue_name}</div>
                      {a.partner_venue_address && (
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                          {a.partner_venue_address}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <div>{a.event_name || "—"}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                        {fmtDate(a.event_date)}
                      </div>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                        {DEAL_STRUCTURE_LABELS[a.deal_structure]}
                      </div>
                      <div style={{ fontWeight: 600, marginTop: 2 }}>{splitLabel}</div>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {a.deposit_amount > 0 ? (
                        <>
                          <div>{fmtCurrency(a.deposit_amount)}</div>
                          <div style={{ fontSize: 11, color: a.deposit_paid ? "#7ddb7d" : "rgba(255,255,255,0.4)" }}>
                            {a.deposit_paid ? "Paid" : "Unpaid"}
                          </div>
                        </>
                      ) : (
                        <span style={{ color: "rgba(255,255,255,0.3)" }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{
                        padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                        textTransform: "uppercase",
                        background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`,
                      }}>
                        {a.status}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>
                      <Link
                        href={`/admin/co-promote-agreements/${a.id}`}
                        style={{
                          display: "inline-block",
                          padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                          background: "rgba(208,194,144,0.08)", color: "#d0c290",
                          border: "1px solid rgba(208,194,144,0.2)", textDecoration: "none",
                          whiteSpace: "nowrap",
                        }}
                      >
                        View →
                      </Link>
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
