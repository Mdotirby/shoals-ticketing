"use client";

/**
 * Settlements list — rebuilt on the shared primitives
 * (app/components/admin/ui.tsx) against design/liquid-glass/admin_settlements.png
 * and admin_settlements_mobile.png.
 *
 * Restyle only: the fetch, the draft/finalized split, the ticket-stat
 * derivation and the manual-settlement POST are unchanged from the previous
 * version — only the markup around them moved to the shared layer.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCookie } from "@/lib/cookies";
import { formatEventDateShort } from "@/lib/dates";
import type { Settlement } from "@/lib/types/settlement";
import {
  Button,
  Card,
  Eyebrow,
  Field,
  ListRow,
  Modal,
  PageHeader,
  StatusBadge,
  Tag,
  fmtUSD,
} from "@/app/components/admin/ui";

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
      .then((data) => {
        if (Array.isArray(data)) setSettlements(data);
      })
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

  const set = (k: keyof NewManualForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const renderRow = (s: Settlement) => {
    const stats = ticketStats(s);
    const eventLabel = s.event_title || s.artist_name || "Untitled Event";
    const dateLabel = s.event_date
      ? formatEventDateShort(s.event_date)
      : new Date(s.created_at).toLocaleDateString();
    const isExternal = s.source === "external";
    return (
      <ListRow
        key={s.id}
        link={Link}
        href={`/admin/settlements/${s.id}`}
        thumb={false}
        title={
          <>
            {eventLabel}
            {isExternal && <Tag>External</Tag>}
          </>
        }
        meta={
          <>
            {s.artist_name && s.event_title ? `${s.artist_name} · ` : ""}
            {dateLabel}
          </>
        }
        badges={
          <>
            <StatusBadge variant={s.status === "finalized" ? "good" : "draft"}>
              {s.status === "finalized" ? "Finalized" : "Draft"}
            </StatusBadge>
            <span className="ui-rowstat">
              {stats.sold} sold
              {!isExternal && ` · ${stats.comps} comps`} · gross {fmtUSD(s.total_gross)}
            </span>
          </>
        }
        actions={<span className="btn btn-outline btn-sm">Open →</span>}
      />
    );
  };

  return (
    <>
      <PageHeader
        title="Settlements"
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setShowModal(true);
              setCreateError("");
              setForm(emptyForm());
            }}
          >
            + Manual Settlement
          </Button>
        }
      />

      <p className="ui-intro">
        To create a settlement from VenueCore ticket sales, open the event in{" "}
        <Link href="/admin/orders">Sales</Link> and click <strong>+ Create Settlement</strong>. Use{" "}
        <strong>+ Manual Settlement</strong> above for shows ticketed on a different platform.
      </p>

      {loading && <p className="ui-intro">Loading…</p>}

      {!loading && settlements.length === 0 && (
        <Card>
          <p className="ui-intro" style={{ margin: 0 }}>
            No settlements yet. Head to <Link href="/admin/orders">Sales</Link> and create one, or use{" "}
            <strong>+ Manual Settlement</strong> above.
          </p>
        </Card>
      )}

      {!loading && drafts.length > 0 && (
        <>
          <div className="ui-section-head">
            <Eyebrow>Drafts</Eyebrow>
            <span className="n">({drafts.length})</span>
          </div>
          <Card flush>{drafts.map(renderRow)}</Card>
        </>
      )}

      {!loading && finalized.length > 0 && (
        <>
          <div className="ui-section-head">
            <Eyebrow>Finalized</Eyebrow>
            <span className="n">({finalized.length})</span>
          </div>
          <Card flush>{finalized.map(renderRow)}</Card>
        </>
      )}

      {showModal && (
        <Modal
          title="New Manual Settlement"
          sub="For shows not ticketed through VenueCore. Enter the actual figures from your box office or third-party platform."
          onClose={() => setShowModal(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setShowModal(false)} disabled={creating}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleCreate}
                disabled={creating || !form.manual_gross}
              >
                {creating ? "Creating…" : "Create Settlement"}
              </Button>
            </>
          }
        >
          <div className="ui-grid ui-grid-2">
            <div style={{ gridColumn: "1 / -1" }}>
              <Field label="Event / show name">
                <input placeholder="Artist Name @ Venue" value={form.event_title} onChange={set("event_title")} />
              </Field>
            </div>
            <Field label="Show date">
              <input type="date" value={form.event_date} onChange={set("event_date")} />
            </Field>
            <Field label="Artist name">
              <input placeholder="e.g. Josh Harrelson" value={form.artist_name} onChange={set("artist_name")} />
            </Field>
            <Field label="Gross revenue ($)">
              <input type="number" step="0.01" min="0" placeholder="0.00" value={form.manual_gross} onChange={set("manual_gross")} />
            </Field>
            <Field label="Tickets sold">
              <input type="number" min="0" placeholder="0" value={form.manual_tickets_sold} onChange={set("manual_tickets_sold")} />
            </Field>
            <Field label="Ticket price (face value, $)">
              <input type="number" step="0.01" min="0" placeholder="0.00" value={form.manual_ticket_price} onChange={set("manual_ticket_price")} />
            </Field>
            <Field label="Processing fee ($ total)">
              <input type="number" step="0.01" min="0" placeholder="0.00" value={form.manual_processing_fee} onChange={set("manual_processing_fee")} />
            </Field>
            <Field label="Ticketing fee ($ per ticket)">
              <input type="number" step="0.01" min="0" placeholder="0.00" value={form.manual_ticketing_fee} onChange={set("manual_ticketing_fee")} />
            </Field>
            <Field label="Facility fee ($ per ticket)">
              <input type="number" step="0.01" min="0" placeholder="0.00" value={form.manual_facility_fee} onChange={set("manual_facility_fee")} />
            </Field>
            <Field label="Tax rate (%)">
              <input type="number" step="0.01" min="0" max="100" placeholder="e.g. 9.75" value={form.manual_tax_rate} onChange={set("manual_tax_rate")} />
            </Field>
            <Field label="Tax method">
              <select value={form.manual_tax_method} onChange={set("manual_tax_method")}>
                <option value="multiplier">Added on top (multiplier)</option>
                <option value="divisor">Included in price (divisor)</option>
              </select>
            </Field>
          </div>

          {createError && (
            <p style={{ color: "var(--lg-bad)", fontSize: 12.5, marginTop: 12 }}>{createError}</p>
          )}
        </Modal>
      )}
    </>
  );
}
