"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCookie } from "@/lib/cookies";
import { formatEventDateShort } from "@/lib/dates";
import type { Settlement } from "@/lib/types/settlement";

/**
 * Settlements index page — list-only.
 *
 * Settlements are CREATED from a specific event's sales page (Admin → Sales →
 * pick event → "Create Settlement"). This page is the master list / status
 * tracker for everything that's already been kicked off. Click a row to open
 * the editor.
 */
const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "status-draft" },
  finalized: { label: "Finalized", cls: "status-published" },
};

export default function AdminSettlementsPage() {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const venueId = getCookie("venue-id");
    const params = venueId ? `?venue_id=${venueId}` : "";

    fetch(`/api/settlements${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setSettlements(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Sort: drafts first (newest → oldest), then finalized (newest → oldest).
  const drafts = settlements.filter((s) => s.status === "draft");
  const finalized = settlements.filter((s) => s.status === "finalized");

  const ticketStats = (s: Settlement) => {
    if (!s.ticket_audit || !Array.isArray(s.ticket_audit)) {
      return { sold: s.tickets_sold_count ?? 0, comps: s.comp_count ?? 0 };
    }
    const sold = s.ticket_audit.reduce((sum, r) => sum + (r.sold || 0), 0);
    const comps = s.ticket_audit.reduce((sum, r) => sum + (r.comps || 0), 0);
    return { sold, comps };
  };

  const renderRow = (s: Settlement) => {
    const stats = ticketStats(s);
    const status = STATUS_LABELS[s.status] ?? { label: s.status, cls: "status-draft" };
    const eventLabel = s.event_title || s.artist_name || "Untitled Event";
    const dateLabel = s.event_date
      ? formatEventDateShort(s.event_date)
      : new Date(s.created_at).toLocaleDateString();
    return (
      <Link
        key={s.id}
        href={`/admin/settlements/${s.id}`}
        className="admin-event-card"
        style={{ textDecoration: "none" }}
      >
        <div className="admin-event-info">
          <div>
            <h3 className="admin-event-name">{eventLabel}</h3>
            <span className="admin-event-meta">
              {s.artist_name && s.event_title ? `${s.artist_name} · ` : ""}
              {dateLabel}
            </span>
            <span className={`admin-event-status ${status.cls}`}>
              {status.label}
            </span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginLeft: 12 }}>
              {stats.sold} sold · {stats.comps} comps · gross{" "}
              {Number(s.total_gross || 0).toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
              })}
            </span>
          </div>
        </div>
        <div className="admin-event-actions">
          <span className="admin-sponsor-edit-btn">Open →</span>
        </div>
      </Link>
    );
  };

  return (
    <div className="admin-form-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">Settlements</h1>
      </div>

      <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 14, marginTop: -8, marginBottom: 24 }}>
        To create a settlement, open the event in{" "}
        <Link href="/admin/orders" style={{ color: "var(--admin-primary, #d0c290)" }}>
          Sales
        </Link>{" "}
        and click <strong>+ Create Settlement</strong>. Drafts auto-run ticket
        audits every time you open them; finalized settlements
        are locked.
      </p>

      {loading && (
        <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading…</p>
      )}

      {!loading && settlements.length === 0 && (
        <p style={{ color: "rgba(255,255,255,0.4)" }}>
          No settlements yet. Head to{" "}
          <Link href="/admin/orders" style={{ color: "var(--admin-primary, #d0c290)" }}>
            Sales
          </Link>{" "}
          and create one for any event with ticket sales.
        </p>
      )}

      {!loading && drafts.length > 0 && (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--admin-primary, #d0c290)", marginTop: 12, marginBottom: 12 }}>
            Drafts ({drafts.length})
          </h2>
          <div className="admin-events-list">{drafts.map(renderRow)}</div>
        </>
      )}

      {!loading && finalized.length > 0 && (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--admin-primary, #d0c290)", marginTop: 28, marginBottom: 12 }}>
            Finalized ({finalized.length})
          </h2>
          <div className="admin-events-list">{finalized.map(renderRow)}</div>
        </>
      )}
    </div>
  );
}
