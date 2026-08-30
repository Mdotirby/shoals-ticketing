"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCookie } from "@/lib/cookies";
import { formatEventDateShort } from "@/lib/dates";
import type { Settlement } from "@/lib/types/settlement";

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "status-draft" },
  finalized: { label: "Finalized", cls: "status-published" },
};

type NewManualForm = {
  event_title: string;
  event_date: string;
  artist_name: string;
  manual_gross: string;
  manual_tickets_sold: string;
  manual_ticket_price: string;
  manual_ticketing_fee: string;
  manual_facility_fee: string;
  manual_tax_rate: string;
  manual_tax_method: "multiplier" | "divisor";
  manual_processing_fee: string;
};

const emptyForm = (): NewManualForm => ({
  event_title: "",
  event_date: "",
  artist_name: "",
  manual_gross: "",
  manual_tickets_sold: "",
  manual_ticket_price: "",
  manual_ticketing_fee: "",
  manual_facility_fee: "",
  manual_tax_rate: "",
  manual_tax_method: "multiplier",
  manual_processing_fee: "",
});

export default function AdminSettlementsPage() {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<NewManualForm>(emptyForm());
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  useEffect(() => {
    const venueId = getCookie("venue-id");
    const params = venueId ? `?venue_id=${venueId}` : "";
    fetch(`/api/settlements${params}`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setSettlements(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const drafts = settlements.filter((s) => s.status === "draft");
  const finalized = settlements.filter((s) => s.status === "finalized");

  const ticketStats = (s: Settlement) => {
    if (s.source === "external") {
      return { sold: s.manual_tickets_sold ?? s.tickets_sold_count ?? 0, comps: 0 };
    }
    if (!s.ticket_audit || !Array.isArray(s.ticket_audit)) {
      return { sold: s.tickets_sold_count ?? 0, comps: s.comp_count ?? 0 };
    }
    const sold = s.ticket_audit.reduce((sum, r) => sum + (r.sold || 0), 0);
    const comps = s.ticket_audit.reduce((sum, r) => sum + (r.comps || 0), 0);
    return { sold, comps };
  };

  const handleCreate = async () => {
    setCreating(true);
    setCreateError("");
    const venueId = getCookie("venue-id");
    try {
      const res = await fetch("/api/settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "external",
          venue_id: venueId || null,
          event_title: form.event_title || null,
          event_date: form.event_date || null,
          artist_name: form.artist_name || null,
          manual_gross: parseFloat(form.manual_gross) || 0,
          manual_tickets_sold: parseInt(form.manual_tickets_sold) || 0,
          manual_ticket_price: parseFloat(form.manual_ticket_price) || 0,
          manual_ticketing_fee: parseFloat(form.manual_ticketing_fee) || 0,
          manual_facility_fee: parseFloat(form.manual_facility_fee) || 0,
          manual_tax_rate: parseFloat(form.manual_tax_rate) / 100 || 0,
          manual_tax_method: form.manual_tax_method,
          manual_processing_fee: parseFloat(form.manual_processing_fee) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create settlement");
      setSettlements((prev) => [data, ...prev]);
      setShowModal(false);
      setForm(emptyForm());
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed");
    } finally {
      setCreating(false);
    }
  };

  const renderRow = (s: Settlement) => {
    const stats = ticketStats(s);
    const status = STATUS_LABELS[s.status] ?? { label: s.status, cls: "status-draft" };
    const eventLabel = s.event_title || s.artist_name || "Untitled Event";
    const dateLabel = s.event_date
      ? formatEventDateShort(s.event_date)
      : new Date(s.created_at).toLocaleDateString();
    const isExternal = s.source === "external";
    return (
      <Link
        key={s.id}
        href={`/admin/settlements/${s.id}`}
        className="admin-event-card"
        style={{ textDecoration: "none" }}
      >
        <div className="admin-event-info">
          <div>
            <h3 className="admin-event-name">
              {eventLabel}
              {isExternal && (
                <span style={{
                  marginLeft: 8, fontSize: 10, fontWeight: 700,
                  letterSpacing: 0.8, textTransform: "uppercase",
                  background: "rgba(245,158,11,0.12)", color: "#f59e0b",
                  padding: "2px 6px", borderRadius: 3,
                }}>
                  External
                </span>
              )}
            </h3>
            <span className="admin-event-meta">
              {s.artist_name && s.event_title ? `${s.artist_name} · ` : ""}
              {dateLabel}
            </span>
            <span className={`admin-event-status ${status.cls}`}>{status.label}</span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginLeft: 12 }}>
              {stats.sold} sold
              {!isExternal && ` · ${stats.comps} comps`}
              {" · gross "}
              {Number(s.total_gross || 0).toLocaleString("en-US", { style: "currency", currency: "USD" })}
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
        <button
          className="admin-header-btn"
          onClick={() => { setShowModal(true); setCreateError(""); setForm(emptyForm()); }}
        >
          + Manual Settlement
        </button>
      </div>

      <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 14, marginTop: -8, marginBottom: 24 }}>
        To create a settlement from VenueCore ticket sales, open the event in{" "}
        <Link href="/admin/orders" style={{ color: "var(--admin-primary, #ffffff)" }}>
          Sales
        </Link>{" "}
        and click <strong>+ Create Settlement</strong>. Use <strong>+ Manual Settlement</strong> above
        for shows ticketed on a different platform.
      </p>

      {loading && <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading…</p>}

      {!loading && settlements.length === 0 && (
        <p style={{ color: "rgba(255,255,255,0.4)" }}>
          No settlements yet. Head to{" "}
          <Link href="/admin/orders" style={{ color: "var(--admin-primary, #ffffff)" }}>Sales</Link>
          {" "}and create one, or use <strong>+ Manual Settlement</strong> above.
        </p>
      )}

      {!loading && drafts.length > 0 && (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--admin-primary, #ffffff)", marginTop: 12, marginBottom: 12 }}>
            Drafts ({drafts.length})
          </h2>
          <div className="admin-events-list">{drafts.map(renderRow)}</div>
        </>
      )}

      {!loading && finalized.length > 0 && (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--admin-primary, #ffffff)", marginTop: 28, marginBottom: 12 }}>
            Finalized ({finalized.length})
          </h2>
          <div className="admin-events-list">{finalized.map(renderRow)}</div>
        </>
      )}

      {/* ── New Manual Settlement Modal ── */}
      {showModal && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(0,0,0,0.7)", display: "flex",
            alignItems: "center", justifyContent: "center", padding: 16,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div style={{
            background: "#12122e", border: "1px solid rgba(255, 255, 255, 0.2)",
            borderRadius: 14, padding: 28, width: "100%", maxWidth: 580,
            maxHeight: "90vh", overflowY: "auto",
          }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#fff", margin: "0 0 4px" }}>
              New Manual Settlement
            </h2>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 20 }}>
              For shows not ticketed through VenueCore. Enter the actual figures from your box office or third-party platform.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label className="admin-form-label">Event / Show Name</label>
                <input className="admin-form-input" placeholder="Artist Name @ Venue" value={form.event_title}
                  onChange={(e) => setForm((f) => ({ ...f, event_title: e.target.value }))} />
              </div>
              <div>
                <label className="admin-form-label">Show Date</label>
                <input type="date" className="admin-form-input" value={form.event_date}
                  onChange={(e) => setForm((f) => ({ ...f, event_date: e.target.value }))} />
              </div>
              <div>
                <label className="admin-form-label">Artist Name</label>
                <input className="admin-form-input" placeholder="e.g. Josh Harrelson" value={form.artist_name}
                  onChange={(e) => setForm((f) => ({ ...f, artist_name: e.target.value }))} />
              </div>

              <div style={{ gridColumn: "1 / -1", height: 1, background: "rgba(255,255,255,0.07)", margin: "4px 0" }} />

              <div>
                <label className="admin-form-label">Gross Revenue ($)</label>
                <input type="number" step="0.01" min="0" className="admin-form-input" placeholder="0.00"
                  value={form.manual_gross}
                  onChange={(e) => setForm((f) => ({ ...f, manual_gross: e.target.value }))} />
              </div>
              <div>
                <label className="admin-form-label">Tickets Sold</label>
                <input type="number" min="0" className="admin-form-input" placeholder="0"
                  value={form.manual_tickets_sold}
                  onChange={(e) => setForm((f) => ({ ...f, manual_tickets_sold: e.target.value }))} />
              </div>
              <div>
                <label className="admin-form-label">Ticket Price (face value, $)</label>
                <input type="number" step="0.01" min="0" className="admin-form-input" placeholder="0.00"
                  value={form.manual_ticket_price}
                  onChange={(e) => setForm((f) => ({ ...f, manual_ticket_price: e.target.value }))} />
              </div>
              <div>
                <label className="admin-form-label">Processing Fee ($, total)</label>
                <input type="number" step="0.01" min="0" className="admin-form-input" placeholder="0.00"
                  value={form.manual_processing_fee}
                  onChange={(e) => setForm((f) => ({ ...f, manual_processing_fee: e.target.value }))} />
              </div>
              <div>
                <label className="admin-form-label">Ticketing Fee ($ per ticket)</label>
                <input type="number" step="0.01" min="0" className="admin-form-input" placeholder="0.00"
                  value={form.manual_ticketing_fee}
                  onChange={(e) => setForm((f) => ({ ...f, manual_ticketing_fee: e.target.value }))} />
              </div>
              <div>
                <label className="admin-form-label">Facility Fee ($ per ticket)</label>
                <input type="number" step="0.01" min="0" className="admin-form-input" placeholder="0.00"
                  value={form.manual_facility_fee}
                  onChange={(e) => setForm((f) => ({ ...f, manual_facility_fee: e.target.value }))} />
              </div>
              <div>
                <label className="admin-form-label">Tax Rate (%)</label>
                <input type="number" step="0.01" min="0" max="100" className="admin-form-input" placeholder="e.g. 9.75"
                  value={form.manual_tax_rate}
                  onChange={(e) => setForm((f) => ({ ...f, manual_tax_rate: e.target.value }))} />
              </div>
              <div>
                <label className="admin-form-label">Tax Method</label>
                <select className="admin-form-input" value={form.manual_tax_method}
                  onChange={(e) => setForm((f) => ({ ...f, manual_tax_method: e.target.value as "multiplier" | "divisor" }))}>
                  <option value="multiplier">Added on top (multiplier)</option>
                  <option value="divisor">Included in price (divisor)</option>
                </select>
              </div>
            </div>

            {createError && (
              <p style={{ color: "#f87171", fontSize: 13, marginTop: 14 }}>{createError}</p>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
              <button
                className="admin-sponsor-edit-btn"
                onClick={() => setShowModal(false)}
                disabled={creating}
              >
                Cancel
              </button>
              <button
                className="admin-header-btn"
                onClick={handleCreate}
                disabled={creating || !form.manual_gross}
              >
                {creating ? "Creating…" : "Create Settlement"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
