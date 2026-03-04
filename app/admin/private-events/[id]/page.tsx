"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useVenue } from "@/app/components/VenueContext";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────
type EventData = {
  id: string;
  title: string;
  venue: string;
  date: string;
  event_type: string;
  booking_status: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  venue_id: string;
  description?: string;
};

type RevenueItem = {
  id: string;
  category: string;
  description: string;
  amount: number;
};

type LineItem = {
  description: string;
  category?: string;
  amount: number;
};

type Proposal = {
  id: string;
  proposal_number: string;
  client_name: string;
  total: number;
  status: string;
  valid_until: string;
  created_at: string;
  line_items: LineItem[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  notes: string;
  terms: string;
  client_email?: string;
  client_phone?: string;
  client_company?: string;
};

type RentalContract = {
  id: string;
  contract_number: string;
  client_name: string;
  total: number;
  deposit_amount: number;
  deposit_percent: number;
  status: string;
  created_at: string;
  line_items: LineItem[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  event_name: string;
  event_date: string;
  event_time_start?: string;
  event_time_end?: string;
  event_space?: string;
  expected_guests?: number;
  deposit_due_date?: string;
  payment_schedule?: string;
  cancellation_policy?: string;
  insurance_required: boolean;
  insurance_details?: string;
  additional_terms?: string;
  client_email?: string;
  client_phone?: string;
  client_company?: string;
  client_address?: string;
};

type Invoice = {
  id: string;
  invoice_number: string;
  client_name: string;
  total: number;
  balance_due: number;
  amount_paid: number;
  status: string;
  due_date: string;
  created_at: string;
  line_items: LineItem[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  client_email?: string;
  client_phone?: string;
};

type Payment = {
  id: string;
  amount: number;
  payment_method: string;
  type: string;
  notes: string;
  received_at: string;
};

// ── Styles ─────────────────────────────────────────────────────────
const GOLD = "#d0c290";
const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(208,194,144,0.12)",
  borderRadius: 10,
  padding: "20px 24px",
  marginBottom: 16,
};
const labelStyle: React.CSSProperties = { color: "rgba(255,255,255,0.5)", fontSize: 12, marginBottom: 2 };
const valueStyle: React.CSSProperties = { color: "#fff", fontSize: 15, fontWeight: 600 };
const btnPrimary: React.CSSProperties = {
  background: GOLD, color: "#0b0d1d", border: "none", borderRadius: 8,
  padding: "10px 20px", fontWeight: 700, cursor: "pointer", fontSize: 14,
};
const btnSecondary: React.CSSProperties = {
  background: "transparent", color: GOLD, border: `1px solid ${GOLD}`, borderRadius: 8,
  padding: "10px 20px", fontWeight: 600, cursor: "pointer", fontSize: 14,
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)",
  color: "#fff", fontSize: 14,
};
const selectStyle: React.CSSProperties = { ...inputStyle, appearance: "auto" as const };

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    draft: "#6b7280", sent: "#3b82f6", partial: "#f59e0b", paid: "#22c55e",
    overdue: "#ef4444", void: "#6b7280", active: "#22c55e", expired: "#ef4444",
  };
  const bg = colors[status] ?? "#6b7280";
  return (
    <span style={{
      display: "inline-block", padding: "3px 10px", borderRadius: 20,
      fontSize: 11, fontWeight: 700, textTransform: "uppercase",
      background: `${bg}22`, color: bg, border: `1px solid ${bg}44`,
    }}>
      {status}
    </span>
  );
}

function fmt(n: number) {
  return (n ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function safeDate(d: string) {
  if (!d) return "—";
  return new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

// ═════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════
export default function PrivateEventManagement() {
  const { id } = useParams<{ id: string }>();
  const { venueSlug } = useVenue();

  const [event, setEvent] = useState<EventData | null>(null);
  const [revenue, setRevenue] = useState<RevenueItem[]>([]);
  const [tab, setTab] = useState<"overview" | "proposals" | "contracts" | "billing">("overview");
  const [loading, setLoading] = useState(true);

  // Proposals
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [showNewProposal, setShowNewProposal] = useState(false);

  // Contracts
  const [contracts, setContracts] = useState<RentalContract[]>([]);
  const [showNewContract, setShowNewContract] = useState(false);

  // Invoices
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [showNewInvoice, setShowNewInvoice] = useState(false);

  // ── Load event ─────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/events/${id}`);
        if (res.ok) {
          const data = await res.json();
          setEvent(data);
        }
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, [id]);

  // ── Load revenue items ────────────────────────────────────────
  const loadRevenue = useCallback(async () => {
    if (!id || !event?.venue_id) return;
    try {
      const res = await fetch(`/api/private-events/${id}/revenue?venue_id=${event.venue_id}`);
      if (res.ok) setRevenue(await res.json());
    } catch { /* ignore */ }
  }, [id, event?.venue_id]);

  // ── Load proposals ────────────────────────────────────────────
  const loadProposals = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/private-events/${id}/proposals`);
      if (res.ok) setProposals(await res.json());
    } catch { /* ignore */ }
  }, [id]);

  // ── Load contracts ────────────────────────────────────────────
  const loadContracts = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/private-events/${id}/contracts`);
      if (res.ok) setContracts(await res.json());
    } catch { /* ignore */ }
  }, [id]);

  // ── Load invoices ─────────────────────────────────────────────
  const loadInvoices = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/invoices?event_id=${id}`);
      if (res.ok) setInvoices(await res.json());
    } catch { /* ignore */ }
  }, [id]);

  // ── Load payments for all invoices ────────────────────────────
  const loadPayments = useCallback(async () => {
    if (invoices.length === 0) { setPayments([]); return; }
    const allPayments: Payment[] = [];
    for (const inv of invoices) {
      try {
        const res = await fetch(`/api/invoices/${inv.id}/payments`);
        if (res.ok) {
          const data = await res.json();
          allPayments.push(...data);
        }
      } catch { /* ignore */ }
    }
    setPayments(allPayments);
  }, [invoices]);

  useEffect(() => { loadRevenue(); }, [loadRevenue]);

  useEffect(() => {
    if (tab === "proposals") loadProposals();
    if (tab === "contracts") loadContracts();
    if (tab === "billing") loadInvoices();
  }, [tab, loadProposals, loadContracts, loadInvoices]);

  useEffect(() => { if (tab === "billing") loadPayments(); }, [tab, invoices, loadPayments]);

  // ── Guard ─────────────────────────────────────────────────────
  if (loading) return <div style={{ padding: 40, color: "rgba(255,255,255,0.5)" }}>Loading...</div>;
  if (!event) return <div style={{ padding: 40, color: "#ef4444" }}>Event not found.</div>;
  if (event.event_type !== "private") {
    return (
      <div style={{ padding: 40 }}>
        <p style={{ color: "#ef4444", marginBottom: 12 }}>This event is not a private event.</p>
        <Link href="/admin/events" style={{ color: GOLD }}>← Back to Events</Link>
      </div>
    );
  }

  const totalRevenue = revenue.reduce((s, r) => s + Number(r.amount), 0);

  // ═══════════════════════════════════════════════════════════════
  //  TABS
  // ═══════════════════════════════════════════════════════════════
  const tabs = ["overview", "proposals", "contracts", "billing"] as const;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Link href="/admin/events" style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, textDecoration: "none" }}>← Events</Link>
        <h1 style={{ color: GOLD, margin: "8px 0 4px", fontSize: "1.6rem" }}>{event.title}</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          {statusBadge(event.booking_status || "confirmed")}
          <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>{safeDate(event.date)} · {event.venue}</span>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 24 }}>
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "10px 24px", border: "none", background: "none", cursor: "pointer",
              color: tab === t ? GOLD : "rgba(255,255,255,0.45)",
              borderBottom: tab === t ? `2px solid ${GOLD}` : "2px solid transparent",
              fontWeight: tab === t ? 700 : 500, fontSize: 14, textTransform: "capitalize",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview" && <OverviewTab event={event} revenue={revenue} totalRevenue={totalRevenue} />}
      {tab === "proposals" && (
        <ProposalsTab
          event={event}
          revenue={revenue}
          proposals={proposals}
          venueSlug={venueSlug}
          showNew={showNewProposal}
          setShowNew={setShowNewProposal}
          onCreated={() => { setShowNewProposal(false); loadProposals(); }}
        />
      )}
      {tab === "contracts" && (
        <ContractsTab
          event={event}
          revenue={revenue}
          contracts={contracts}
          venueSlug={venueSlug}
          showNew={showNewContract}
          setShowNew={setShowNewContract}
          onCreated={() => { setShowNewContract(false); loadContracts(); }}
        />
      )}
      {tab === "billing" && (
        <BillingTab
          event={event}
          revenue={revenue}
          invoices={invoices}
          payments={payments}
          showNew={showNewInvoice}
          setShowNew={setShowNewInvoice}
          onCreated={() => { setShowNewInvoice(false); loadInvoices(); }}
        />
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  OVERVIEW TAB
// ═════════════════════════════════════════════════════════════════════
function OverviewTab({ event, revenue, totalRevenue }: { event: EventData; revenue: RevenueItem[]; totalRevenue: number }) {
  const catLabels: Record<string, string> = {
    room_rental: "Room Rental", production: "Production", food_beverage: "Food & Beverage",
    setup: "Setup", labor: "Labor", other: "Other",
  };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Event details */}
        <div style={cardStyle}>
          <h3 style={{ color: GOLD, margin: "0 0 12px", fontSize: 15 }}>Event Details</h3>
          <div style={{ display: "grid", gap: 8 }}>
            <div><div style={labelStyle}>Event Name</div><div style={valueStyle}>{event.title}</div></div>
            <div><div style={labelStyle}>Date</div><div style={valueStyle}>{safeDate(event.date)}</div></div>
            <div><div style={labelStyle}>Venue</div><div style={valueStyle}>{event.venue}</div></div>
            <div><div style={labelStyle}>Booking Status</div><div style={{ marginTop: 4 }}>{statusBadge(event.booking_status || "confirmed")}</div></div>
          </div>
        </div>

        {/* Contact info */}
        <div style={cardStyle}>
          <h3 style={{ color: GOLD, margin: "0 0 12px", fontSize: 15 }}>Client Contact</h3>
          <div style={{ display: "grid", gap: 8 }}>
            <div><div style={labelStyle}>Name</div><div style={valueStyle}>{event.contact_name || "—"}</div></div>
            <div><div style={labelStyle}>Email</div><div style={valueStyle}>{event.contact_email || "—"}</div></div>
            <div><div style={labelStyle}>Phone</div><div style={valueStyle}>{event.contact_phone || "—"}</div></div>
          </div>
        </div>
      </div>

      {/* Revenue summary */}
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ color: GOLD, margin: 0, fontSize: 15 }}>Revenue Line Items</h3>
          <div style={{ color: GOLD, fontWeight: 700, fontSize: 18 }}>{fmt(totalRevenue)}</div>
        </div>
        {revenue.length === 0 ? (
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>No revenue items added yet. Add them from the event editor.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <th style={{ textAlign: "left", padding: "8px 0", color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 500 }}>CATEGORY</th>
                <th style={{ textAlign: "left", padding: "8px 0", color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 500 }}>DESCRIPTION</th>
                <th style={{ textAlign: "right", padding: "8px 0", color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 500 }}>AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              {revenue.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <td style={{ padding: "10px 0", color: "rgba(255,255,255,0.6)", fontSize: 13 }}>{catLabels[r.category] ?? r.category}</td>
                  <td style={{ padding: "10px 0", color: "#fff", fontSize: 13 }}>{r.description}</td>
                  <td style={{ padding: "10px 0", textAlign: "right", color: GOLD, fontSize: 13, fontWeight: 600 }}>{fmt(Number(r.amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  PROPOSALS TAB
// ═════════════════════════════════════════════════════════════════════
function ProposalsTab({
  event, revenue, proposals, venueSlug, showNew, setShowNew, onCreated,
}: {
  event: EventData; revenue: RevenueItem[]; proposals: Proposal[];
  venueSlug: string; showNew: boolean; setShowNew: (v: boolean) => void; onCreated: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    client_name: event.contact_name || "",
    client_email: event.contact_email || "",
    client_phone: event.contact_phone || "",
    client_company: "",
    tax_rate: 0,
    notes: "",
    terms: "",
    validity_days: 30,
    custom_items: [] as LineItem[],
  });

  const revenueItems: LineItem[] = revenue.map((r) => ({
    description: r.description, category: r.category, amount: Number(r.amount),
  }));
  const allItems = [...revenueItems, ...form.custom_items];
  const subtotal = allItems.reduce((s, i) => s + i.amount, 0);
  const taxAmount = subtotal * form.tax_rate;
  const total = subtotal + taxAmount;

  const addCustomItem = () => {
    setForm((f) => ({ ...f, custom_items: [...f.custom_items, { description: "", category: "other", amount: 0 }] }));
  };

  const removeCustomItem = (idx: number) => {
    setForm((f) => ({ ...f, custom_items: f.custom_items.filter((_, i) => i !== idx) }));
  };

  const updateCustomItem = (idx: number, field: string, value: string | number) => {
    setForm((f) => {
      const items = [...f.custom_items];
      items[idx] = { ...items[idx], [field]: value };
      return { ...f, custom_items: items };
    });
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/private-events/${event.id}/proposals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          line_items: allItems,
          tax_rate: form.tax_rate,
        }),
      });
      if (res.ok) onCreated();
      else alert("Failed to create proposal");
    } catch { alert("Error creating proposal"); }
    setSaving(false);
  };

  const handleDownloadPDF = async (proposal: Proposal) => {
    const { exportProposalPDF } = await import("@/lib/pdf/proposal-pdf");
    await exportProposalPDF({
      proposal_number: proposal.proposal_number,
      date: safeDate(proposal.created_at),
      valid_until: safeDate(proposal.valid_until),
      event_name: event.title,
      event_date: safeDate(event.date),
      event_venue: event.venue,
      client_name: proposal.client_name,
      client_email: proposal.client_email,
      client_phone: proposal.client_phone,
      client_company: proposal.client_company,
      line_items: proposal.line_items || [],
      subtotal: Number(proposal.subtotal),
      tax_rate: Number(proposal.tax_rate),
      tax_amount: Number(proposal.tax_amount),
      total: Number(proposal.total),
      notes: proposal.notes,
      terms: proposal.terms,
      venue_name: event.venue,
      venue_slug: venueSlug,
    });
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ color: "#fff", margin: 0, fontSize: 16 }}>Proposals ({proposals.length})</h3>
        {!showNew && <button style={btnPrimary} onClick={() => setShowNew(true)}>+ New Proposal</button>}
      </div>

      {showNew && (
        <div style={{ ...cardStyle, borderColor: `${GOLD}33` }}>
          <h4 style={{ color: GOLD, margin: "0 0 16px" }}>Create Proposal</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Client Name</label>
              <input style={inputStyle} value={form.client_name} onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Company</label>
              <input style={inputStyle} value={form.client_company} onChange={(e) => setForm((f) => ({ ...f, client_company: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input style={inputStyle} value={form.client_email} onChange={(e) => setForm((f) => ({ ...f, client_email: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Phone</label>
              <input style={inputStyle} value={form.client_phone} onChange={(e) => setForm((f) => ({ ...f, client_phone: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Tax Rate (%)</label>
              <input style={inputStyle} type="number" step="0.01" value={form.tax_rate * 100}
                onChange={(e) => setForm((f) => ({ ...f, tax_rate: Number(e.target.value) / 100 }))} />
            </div>
            <div>
              <label style={labelStyle}>Valid For (days)</label>
              <input style={inputStyle} type="number" value={form.validity_days}
                onChange={(e) => setForm((f) => ({ ...f, validity_days: Number(e.target.value) }))} />
            </div>
          </div>

          {/* Line items from revenue */}
          <h5 style={{ color: "rgba(255,255,255,0.6)", margin: "0 0 8px", fontSize: 13 }}>Revenue Items (auto-populated)</h5>
          {revenueItems.length === 0 && <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginBottom: 12 }}>No revenue items for this event.</p>}
          {revenueItems.map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4, padding: "4px 0", fontSize: 13 }}>
              <span style={{ color: "rgba(255,255,255,0.5)", flex: 1 }}>{item.description}</span>
              <span style={{ color: GOLD, fontWeight: 600 }}>{fmt(item.amount)}</span>
            </div>
          ))}

          {/* Custom line items */}
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h5 style={{ color: "rgba(255,255,255,0.6)", margin: 0, fontSize: 13 }}>Additional Items</h5>
              <button style={{ ...btnSecondary, padding: "4px 12px", fontSize: 12 }} onClick={addCustomItem}>+ Add Item</button>
            </div>
            {form.custom_items.map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input style={{ ...inputStyle, flex: 2 }} placeholder="Description" value={item.description}
                  onChange={(e) => updateCustomItem(i, "description", e.target.value)} />
                <input style={{ ...inputStyle, flex: 1 }} type="number" placeholder="Amount" value={item.amount || ""}
                  onChange={(e) => updateCustomItem(i, "amount", Number(e.target.value))} />
                <button onClick={() => removeCustomItem(i)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 16 }}>✕</button>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div style={{ marginTop: 16, padding: "12px 0", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>Subtotal</span>
              <span style={{ color: "#fff", fontSize: 13 }}>{fmt(subtotal)}</span>
            </div>
            {form.tax_rate > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>Tax ({(form.tax_rate * 100).toFixed(2)}%)</span>
                <span style={{ color: "#fff", fontSize: 13 }}>{fmt(taxAmount)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: GOLD, fontSize: 15, fontWeight: 700 }}>Total</span>
              <span style={{ color: GOLD, fontSize: 15, fontWeight: 700 }}>{fmt(total)}</span>
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>Notes</label>
            <textarea style={{ ...inputStyle, minHeight: 60 }} value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
            <button style={btnPrimary} onClick={handleCreate} disabled={saving}>
              {saving ? "Creating..." : "Create Proposal"}
            </button>
            <button style={btnSecondary} onClick={() => setShowNew(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Proposals list */}
      {proposals.map((p) => (
        <div key={p.id} style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span style={{ color: "#fff", fontWeight: 600, fontSize: 14 }}>{p.proposal_number}</span>
              <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginLeft: 12 }}>{p.client_name}</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {statusBadge(p.status)}
              <span style={{ color: GOLD, fontWeight: 700, fontSize: 15 }}>{fmt(Number(p.total))}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
            <span>Created: {safeDate(p.created_at)}</span>
            <span>Valid Until: {safeDate(p.valid_until)}</span>
            <span>{(p.line_items || []).length} items</span>
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <button style={{ ...btnSecondary, padding: "6px 14px", fontSize: 12 }} onClick={() => handleDownloadPDF(p)}>
              Download PDF
            </button>
          </div>
        </div>
      ))}

      {proposals.length === 0 && !showNew && (
        <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, textAlign: "center", padding: 40 }}>No proposals yet. Create one to get started.</p>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  CONTRACTS TAB
// ═════════════════════════════════════════════════════════════════════
function ContractsTab({
  event, revenue, contracts, venueSlug, showNew, setShowNew, onCreated,
}: {
  event: EventData; revenue: RevenueItem[]; contracts: RentalContract[];
  venueSlug: string; showNew: boolean; setShowNew: (v: boolean) => void; onCreated: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    client_name: event.contact_name || "",
    client_email: event.contact_email || "",
    client_phone: event.contact_phone || "",
    client_company: "",
    client_address: "",
    event_time_start: "",
    event_time_end: "",
    event_space: "Main Venue",
    expected_guests: 0,
    deposit_percent: 25,
    deposit_due_date: "",
    tax_rate: 0,
    insurance_required: false,
    insurance_details: "",
    additional_terms: "",
    custom_items: [] as LineItem[],
  });

  const revenueItems: LineItem[] = revenue.map((r) => ({
    description: r.description, amount: Number(r.amount),
  }));
  const allItems = [...revenueItems, ...form.custom_items];
  const subtotal = allItems.reduce((s, i) => s + i.amount, 0);
  const taxAmount = subtotal * form.tax_rate;
  const total = subtotal + taxAmount;
  const depositAmount = total * (form.deposit_percent / 100);

  const addCustomItem = () => {
    setForm((f) => ({ ...f, custom_items: [...f.custom_items, { description: "", amount: 0 }] }));
  };

  const removeCustomItem = (idx: number) => {
    setForm((f) => ({ ...f, custom_items: f.custom_items.filter((_, i) => i !== idx) }));
  };

  const updateCustomItem = (idx: number, field: string, value: string | number) => {
    setForm((f) => {
      const items = [...f.custom_items];
      items[idx] = { ...items[idx], [field]: value };
      return { ...f, custom_items: items };
    });
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/private-events/${event.id}/contracts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          line_items: allItems,
          event_name: event.title,
          event_date: event.date,
        }),
      });
      if (res.ok) onCreated();
      else alert("Failed to create contract");
    } catch { alert("Error creating contract"); }
    setSaving(false);
  };

  const handleDownloadPDF = async (c: RentalContract) => {
    const { exportRentalContractPDF } = await import("@/lib/pdf/rental-contract-pdf");
    await exportRentalContractPDF({
      contract_number: c.contract_number,
      date: safeDate(c.created_at),
      venue_name: event.venue,
      venue_slug: venueSlug,
      client_name: c.client_name,
      client_email: c.client_email,
      client_phone: c.client_phone,
      client_company: c.client_company,
      client_address: c.client_address,
      event_name: c.event_name || event.title,
      event_date: safeDate(c.event_date || event.date),
      event_time_start: c.event_time_start,
      event_time_end: c.event_time_end,
      event_space: c.event_space,
      expected_guests: c.expected_guests ?? undefined,
      line_items: c.line_items || [],
      subtotal: Number(c.subtotal),
      tax_rate: Number(c.tax_rate),
      tax_amount: Number(c.tax_amount),
      total: Number(c.total),
      deposit_percent: Number(c.deposit_percent),
      deposit_amount: Number(c.deposit_amount),
      deposit_due_date: c.deposit_due_date ? safeDate(c.deposit_due_date) : undefined,
      insurance_required: c.insurance_required,
      insurance_details: c.insurance_details,
      additional_terms: c.additional_terms,
    });
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ color: "#fff", margin: 0, fontSize: 16 }}>Rental Contracts ({contracts.length})</h3>
        {!showNew && <button style={btnPrimary} onClick={() => setShowNew(true)}>+ New Contract</button>}
      </div>

      {showNew && (
        <div style={{ ...cardStyle, borderColor: `${GOLD}33` }}>
          <h4 style={{ color: GOLD, margin: "0 0 16px" }}>Create Rental Contract</h4>

          {/* Client info */}
          <h5 style={{ color: "rgba(255,255,255,0.6)", margin: "0 0 8px", fontSize: 13 }}>Client Information</h5>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Client Name</label>
              <input style={inputStyle} value={form.client_name} onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Company</label>
              <input style={inputStyle} value={form.client_company} onChange={(e) => setForm((f) => ({ ...f, client_company: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input style={inputStyle} value={form.client_email} onChange={(e) => setForm((f) => ({ ...f, client_email: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Phone</label>
              <input style={inputStyle} value={form.client_phone} onChange={(e) => setForm((f) => ({ ...f, client_phone: e.target.value }))} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Address</label>
              <input style={inputStyle} value={form.client_address} onChange={(e) => setForm((f) => ({ ...f, client_address: e.target.value }))} />
            </div>
          </div>

          {/* Event details */}
          <h5 style={{ color: "rgba(255,255,255,0.6)", margin: "0 0 8px", fontSize: 13 }}>Event Details</h5>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Start Time</label>
              <input style={inputStyle} type="time" value={form.event_time_start} onChange={(e) => setForm((f) => ({ ...f, event_time_start: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>End Time</label>
              <input style={inputStyle} type="time" value={form.event_time_end} onChange={(e) => setForm((f) => ({ ...f, event_time_end: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Expected Guests</label>
              <input style={inputStyle} type="number" value={form.expected_guests || ""} onChange={(e) => setForm((f) => ({ ...f, expected_guests: Number(e.target.value) }))} />
            </div>
            <div>
              <label style={labelStyle}>Space</label>
              <input style={inputStyle} value={form.event_space} onChange={(e) => setForm((f) => ({ ...f, event_space: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Deposit %</label>
              <input style={inputStyle} type="number" value={form.deposit_percent} onChange={(e) => setForm((f) => ({ ...f, deposit_percent: Number(e.target.value) }))} />
            </div>
            <div>
              <label style={labelStyle}>Tax Rate (%)</label>
              <input style={inputStyle} type="number" step="0.01" value={form.tax_rate * 100}
                onChange={(e) => setForm((f) => ({ ...f, tax_rate: Number(e.target.value) / 100 }))} />
            </div>
          </div>

          {/* Revenue items */}
          <h5 style={{ color: "rgba(255,255,255,0.6)", margin: "0 0 8px", fontSize: 13 }}>Revenue Items</h5>
          {revenueItems.map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4, padding: "4px 0", fontSize: 13 }}>
              <span style={{ color: "rgba(255,255,255,0.5)", flex: 1 }}>{item.description}</span>
              <span style={{ color: GOLD, fontWeight: 600 }}>{fmt(item.amount)}</span>
            </div>
          ))}

          {/* Custom items */}
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h5 style={{ color: "rgba(255,255,255,0.6)", margin: 0, fontSize: 13 }}>Additional Items</h5>
              <button style={{ ...btnSecondary, padding: "4px 12px", fontSize: 12 }} onClick={addCustomItem}>+ Add</button>
            </div>
            {form.custom_items.map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input style={{ ...inputStyle, flex: 2 }} placeholder="Description" value={item.description}
                  onChange={(e) => updateCustomItem(i, "description", e.target.value)} />
                <input style={{ ...inputStyle, flex: 1 }} type="number" placeholder="Amount" value={item.amount || ""}
                  onChange={(e) => updateCustomItem(i, "amount", Number(e.target.value))} />
                <button onClick={() => removeCustomItem(i)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 16 }}>✕</button>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div style={{ marginTop: 16, padding: "12px 0", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>Subtotal</span><span style={{ color: "#fff", fontSize: 13 }}>{fmt(subtotal)}</span>
            </div>
            {form.tax_rate > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>Tax</span><span style={{ color: "#fff", fontSize: 13 }}>{fmt(taxAmount)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ color: GOLD, fontSize: 15, fontWeight: 700 }}>Total</span><span style={{ color: GOLD, fontSize: 15, fontWeight: 700 }}>{fmt(total)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>Deposit ({form.deposit_percent}%)</span>
              <span style={{ color: "#fff", fontSize: 13 }}>{fmt(depositAmount)}</span>
            </div>
          </div>

          {/* Insurance */}
          <div style={{ marginTop: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, color: "rgba(255,255,255,0.6)", fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={form.insurance_required}
                onChange={(e) => setForm((f) => ({ ...f, insurance_required: e.target.checked }))} />
              Insurance required
            </label>
          </div>

          {/* Additional terms */}
          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>Additional Terms</label>
            <textarea style={{ ...inputStyle, minHeight: 60 }} value={form.additional_terms}
              onChange={(e) => setForm((f) => ({ ...f, additional_terms: e.target.value }))} />
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
            <button style={btnPrimary} onClick={handleCreate} disabled={saving}>
              {saving ? "Creating..." : "Create Contract"}
            </button>
            <button style={btnSecondary} onClick={() => setShowNew(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Contracts list */}
      {contracts.map((c) => (
        <div key={c.id} style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span style={{ color: "#fff", fontWeight: 600, fontSize: 14 }}>{c.contract_number}</span>
              <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginLeft: 12 }}>{c.client_name}</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {statusBadge(c.status)}
              <span style={{ color: GOLD, fontWeight: 700, fontSize: 15 }}>{fmt(Number(c.total))}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
            <span>Created: {safeDate(c.created_at)}</span>
            <span>Deposit: {fmt(Number(c.deposit_amount))} ({c.deposit_percent}%)</span>
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <button style={{ ...btnSecondary, padding: "6px 14px", fontSize: 12 }} onClick={() => handleDownloadPDF(c)}>
              Download PDF
            </button>
          </div>
        </div>
      ))}

      {contracts.length === 0 && !showNew && (
        <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, textAlign: "center", padding: 40 }}>No rental contracts yet.</p>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  BILLING TAB
// ═════════════════════════════════════════════════════════════════════
function BillingTab({
  event, revenue, invoices, payments, showNew, setShowNew, onCreated,
}: {
  event: EventData; revenue: RevenueItem[]; invoices: Invoice[];
  payments: Payment[]; showNew: boolean; setShowNew: (v: boolean) => void; onCreated: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    client_name: event.contact_name || "",
    client_email: event.contact_email || "",
    client_phone: event.contact_phone || "",
    client_company: "",
    tax_rate: 0,
    due_date: (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split("T")[0]; })(),
    custom_items: [] as LineItem[],
    is_deposit: false,
    deposit_percent: 25,
  });

  const revenueItems: LineItem[] = revenue.map((r) => ({
    description: r.description, category: r.category, amount: Number(r.amount),
  }));
  const allItems = [...revenueItems, ...form.custom_items];
  const subtotal = allItems.reduce((s, i) => s + i.amount, 0);
  const taxAmount = subtotal * form.tax_rate;
  const total = subtotal + taxAmount;
  const invoiceTotal = form.is_deposit ? total * (form.deposit_percent / 100) : total;

  // Balance summary
  const totalOwed = invoices.reduce((s, inv) => s + Number(inv.total), 0);
  const totalPaid = invoices.reduce((s, inv) => s + Number(inv.amount_paid), 0);
  const totalRemaining = totalOwed - totalPaid;

  const addCustomItem = () => {
    setForm((f) => ({ ...f, custom_items: [...f.custom_items, { description: "", category: "other", amount: 0 }] }));
  };

  const removeCustomItem = (idx: number) => {
    setForm((f) => ({ ...f, custom_items: f.custom_items.filter((_, i) => i !== idx) }));
  };

  const updateCustomItem = (idx: number, field: string, value: string | number) => {
    setForm((f) => {
      const items = [...f.custom_items];
      items[idx] = { ...items[idx], [field]: value };
      return { ...f, custom_items: items };
    });
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      const finalItems = form.is_deposit
        ? [{ description: `Deposit (${form.deposit_percent}%)`, category: "deposit", amount: invoiceTotal }]
        : allItems;
      const finalSubtotal = form.is_deposit ? invoiceTotal : subtotal;
      const finalTax = form.is_deposit ? 0 : taxAmount;
      const finalTotal = form.is_deposit ? invoiceTotal : total;

      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: event.id,
          venue_id: event.venue_id,
          client_name: form.client_name,
          client_email: form.client_email,
          client_phone: form.client_phone,
          client_company: form.client_company,
          line_items: finalItems,
          subtotal: finalSubtotal,
          tax_rate: form.is_deposit ? 0 : form.tax_rate,
          tax_amount: finalTax,
          total: finalTotal,
          due_date: form.due_date,
          status: "draft",
        }),
      });
      if (res.ok) onCreated();
      else alert("Failed to create invoice");
    } catch { alert("Error creating invoice"); }
    setSaving(false);
  };

  const copyPaymentLink = (invoiceId: string) => {
    const url = `${window.location.origin}/pay/${invoiceId}`;
    navigator.clipboard.writeText(url);
    alert("Payment link copied to clipboard!");
  };

  return (
    <div>
      {/* Balance summary */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
        <div style={cardStyle}>
          <div style={labelStyle}>Total Invoiced</div>
          <div style={{ color: "#fff", fontSize: 22, fontWeight: 700 }}>{fmt(totalOwed)}</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>Total Paid</div>
          <div style={{ color: "#22c55e", fontSize: 22, fontWeight: 700 }}>{fmt(totalPaid)}</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>Balance Remaining</div>
          <div style={{ color: totalRemaining > 0 ? "#f59e0b" : "#22c55e", fontSize: 22, fontWeight: 700 }}>{fmt(totalRemaining)}</div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ color: "#fff", margin: 0, fontSize: 16 }}>Invoices ({invoices.length})</h3>
        {!showNew && <button style={btnPrimary} onClick={() => setShowNew(true)}>+ Create Invoice</button>}
      </div>

      {showNew && (
        <div style={{ ...cardStyle, borderColor: `${GOLD}33` }}>
          <h4 style={{ color: GOLD, margin: "0 0 16px" }}>Create Invoice</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Client Name</label>
              <input style={inputStyle} value={form.client_name} onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input style={inputStyle} value={form.client_email} onChange={(e) => setForm((f) => ({ ...f, client_email: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Due Date</label>
              <input style={inputStyle} type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Tax Rate (%)</label>
              <input style={inputStyle} type="number" step="0.01" value={form.tax_rate * 100}
                onChange={(e) => setForm((f) => ({ ...f, tax_rate: Number(e.target.value) / 100 }))} />
            </div>
          </div>

          {/* Deposit toggle */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, color: "rgba(255,255,255,0.6)", fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={form.is_deposit}
                onChange={(e) => setForm((f) => ({ ...f, is_deposit: e.target.checked }))} />
              This is a deposit invoice
            </label>
            {form.is_deposit && (
              <div style={{ marginTop: 8, maxWidth: 200 }}>
                <label style={labelStyle}>Deposit %</label>
                <input style={inputStyle} type="number" value={form.deposit_percent}
                  onChange={(e) => setForm((f) => ({ ...f, deposit_percent: Number(e.target.value) }))} />
              </div>
            )}
          </div>

          {/* Line items */}
          {!form.is_deposit && (
            <>
              <h5 style={{ color: "rgba(255,255,255,0.6)", margin: "0 0 8px", fontSize: 13 }}>Revenue Items</h5>
              {revenueItems.map((item, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4, padding: "4px 0", fontSize: 13 }}>
                  <span style={{ color: "rgba(255,255,255,0.5)", flex: 1 }}>{item.description}</span>
                  <span style={{ color: GOLD, fontWeight: 600 }}>{fmt(item.amount)}</span>
                </div>
              ))}
              <div style={{ marginTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <h5 style={{ color: "rgba(255,255,255,0.6)", margin: 0, fontSize: 13 }}>Additional Items</h5>
                  <button style={{ ...btnSecondary, padding: "4px 12px", fontSize: 12 }} onClick={addCustomItem}>+ Add</button>
                </div>
                {form.custom_items.map((item, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <input style={{ ...inputStyle, flex: 2 }} placeholder="Description" value={item.description}
                      onChange={(e) => updateCustomItem(i, "description", e.target.value)} />
                    <input style={{ ...inputStyle, flex: 1 }} type="number" placeholder="Amount" value={item.amount || ""}
                      onChange={(e) => updateCustomItem(i, "amount", Number(e.target.value))} />
                    <button onClick={() => removeCustomItem(i)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer" }}>✕</button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Total */}
          <div style={{ marginTop: 12, padding: "12px 0", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: GOLD, fontSize: 15, fontWeight: 700 }}>Invoice Total</span>
              <span style={{ color: GOLD, fontSize: 15, fontWeight: 700 }}>{fmt(invoiceTotal)}</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
            <button style={btnPrimary} onClick={handleCreate} disabled={saving}>
              {saving ? "Creating..." : "Create Invoice"}
            </button>
            <button style={btnSecondary} onClick={() => setShowNew(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Invoices list */}
      {invoices.map((inv) => (
        <div key={inv.id} style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span style={{ color: "#fff", fontWeight: 600, fontSize: 14 }}>{inv.invoice_number}</span>
              <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginLeft: 12 }}>{inv.client_name}</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {statusBadge(inv.status)}
              <span style={{ color: GOLD, fontWeight: 700, fontSize: 15 }}>{fmt(Number(inv.total))}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
            <span>Due: {safeDate(inv.due_date)}</span>
            <span>Paid: {fmt(Number(inv.amount_paid))}</span>
            <span>Balance: {fmt(Number(inv.balance_due))}</span>
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <button style={{ ...btnSecondary, padding: "6px 14px", fontSize: 12 }} onClick={() => copyPaymentLink(inv.id)}>
              Copy Payment Link
            </button>
            <a href={`/pay/${inv.id}`} target="_blank" rel="noopener noreferrer"
              style={{ ...btnSecondary, padding: "6px 14px", fontSize: 12, textDecoration: "none", display: "inline-block" }}>
              Open Payment Page
            </a>
          </div>
        </div>
      ))}

      {invoices.length === 0 && !showNew && (
        <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, textAlign: "center", padding: 40 }}>No invoices yet.</p>
      )}

      {/* Payment history */}
      {payments.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ color: "#fff", margin: "0 0 12px", fontSize: 16 }}>Payment History</h3>
          {payments.map((p) => (
            <div key={p.id} style={{ ...cardStyle, padding: "12px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ color: "#22c55e", fontWeight: 700, fontSize: 14 }}>{fmt(Number(p.amount))}</span>
                  <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginLeft: 12 }}>{p.payment_method} · {p.type}</span>
                </div>
                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>{safeDate(p.received_at)}</span>
              </div>
              {p.notes && <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, margin: "4px 0 0" }}>{p.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
