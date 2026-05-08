"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useVenue } from "@/app/components/VenueContext";
import Link from "next/link";
import { formatPhoneNumber } from "@/lib/formatPhone";

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
  client_name?: string;
  client_email?: string;
  client_phone?: string;
  client_billing_address?: string;
  client_company?: string;
  tax_exempt?: boolean;
  start_time?: string;
  end_time?: string;
};

type RevenueItem = {
  id: string;
  category: string;
  description: string;
  amount: number;
};

type QuoteLineItem = {
  category: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
};

type Quote = {
  id: string;
  proposal_number: string;
  version: number;
  status: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  client_company: string;
  line_items: QuoteLineItem[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  deposit_pct: number;
  deposit_amount: number;
  deposit_due: string;
  balance_due_date: string;
  cancellation_policy: string;
  valid_until: string;
  notes: string;
  terms: string;
  event_type_label: string;
  accepted_at: string | null;
  accepted_by: string | null;
  declined_at: string | null;
  created_at: string;
};

type LineItem = {
  description: string;
  category?: string;
  amount: number;
};

type Attachment = {
  id: string;
  event_id: string;
  file_url: string;
  file_name: string;
  file_type: string;
  created_at: string;
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
const btnDanger: React.CSSProperties = {
  background: "transparent", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8,
  padding: "6px 14px", fontWeight: 600, cursor: "pointer", fontSize: 12,
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)",
  color: "#fff", fontSize: 14,
};

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    confirmed: "#22c55e", hold: "#f59e0b", cancelled: "#ef4444",
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

function formatTime12hr(time: string | undefined) {
  if (!time) return "—";
  // Handle full timestamps like "2026-03-31T12:30:00+00:00"
  let timeStr = time;
  const tMatch = time.match(/T(\d{2}:\d{2})/);
  if (tMatch) timeStr = tMatch[1];
  const match = timeStr.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return time;
  let hours = parseInt(match[1]);
  const minutes = match[2];
  const ampm = hours >= 12 ? "PM" : "AM";
  if (hours === 0) hours = 12;
  else if (hours > 12) hours -= 12;
  return `${hours}:${minutes} ${ampm}`;
}

// ═════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════
export default function PrivateEventManagement() {
  const { id } = useParams<{ id: string }>();
  const { venueSlug } = useVenue();

  const [event, setEvent] = useState<EventData | null>(null);
  const [revenue, setRevenue] = useState<RevenueItem[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [tab, setTab] = useState<"details" | "client" | "attachments" | "billing" | "quote">("details");
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);

  // Invoices & payments
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  // ── Load event ─────────────────────────────────────────────────
  const loadEvent = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/events/${id}`);
      if (res.ok) {
        const data = await res.json();
        setEvent(data);
      }
    } catch { /* ignore */ }
  }, [id]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadEvent();
      setLoading(false);
    })();
  }, [loadEvent]);

  // ── Load revenue items ────────────────────────────────────────
  const loadRevenue = useCallback(async () => {
    if (!id || !event?.venue_id) return;
    try {
      const res = await fetch(`/api/private-events/${id}/revenue?venue_id=${event.venue_id}`);
      if (res.ok) setRevenue(await res.json());
    } catch { /* ignore */ }
  }, [id, event?.venue_id]);

  // ── Load attachments ──────────────────────────────────────────
  const loadAttachments = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/private-events/${id}/attachments`);
      if (res.ok) setAttachments(await res.json());
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

  const loadQuotes = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/private-events/${id}/proposals`);
      if (res.ok) setQuotes(await res.json());
    } catch { /* ignore */ }
  }, [id]);

  useEffect(() => {
    if (tab === "attachments") loadAttachments();
    if (tab === "billing") { loadRevenue(); loadInvoices(); }
    if (tab === "quote") loadQuotes();
  }, [tab, loadAttachments, loadRevenue, loadInvoices, loadQuotes]);

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

  // ═══════════════════════════════════════════════════════════════
  //  TABS
  // ═══════════════════════════════════════════════════════════════
  const tabs = [
    { key: "details" as const, label: "Event Details" },
    { key: "client" as const, label: "Client Details" },
    { key: "quote" as const, label: "Quote" },
    { key: "attachments" as const, label: "Attachments" },
    { key: "billing" as const, label: "Billing" },
  ];

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
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "10px 24px", border: "none", background: "none", cursor: "pointer",
              color: tab === t.key ? GOLD : "rgba(255,255,255,0.45)",
              borderBottom: tab === t.key ? `2px solid ${GOLD}` : "2px solid transparent",
              fontWeight: tab === t.key ? 700 : 500, fontSize: 14,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "details" && <EventDetailsTab event={event} onUpdate={loadEvent} />}
      {tab === "client" && <ClientDetailsTab event={event} onUpdate={loadEvent} />}
      {tab === "quote" && (
        <QuoteTab event={event} quotes={quotes} onUpdate={() => { loadQuotes(); loadEvent(); }} venueSlug={venueSlug} />
      )}
      {tab === "attachments" && <AttachmentsTab eventId={event.id} attachments={attachments} onUpdate={loadAttachments} />}
      {tab === "billing" && (
        <BillingTab
          event={event}
          revenue={revenue}
          invoices={invoices}
          payments={payments}
          venueSlug={venueSlug}
          onRevenueUpdate={loadRevenue}
          onInvoiceCreated={() => loadInvoices()}
        />
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  TAB 1: EVENT DETAILS
// ═════════════════════════════════════════════════════════════════════
function EventDetailsTab({ event, onUpdate }: { event: EventData; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  // Extract HH:MM from timestamptz values (e.g. "2026-03-31T12:30:00+00:00" → "12:30")
  const extractTime = (val?: string | null) => {
    if (!val) return "";
    // If it's already HH:MM format
    if (/^\d{2}:\d{2}$/.test(val)) return val;
    // If it's a full timestamp, extract time portion
    const match = val.match(/T(\d{2}:\d{2})/);
    if (match) return match[1];
    // If it looks like a time with seconds
    const timeMatch = val.match(/^(\d{2}:\d{2}):\d{2}/);
    if (timeMatch) return timeMatch[1];
    return val;
  };

  const [form, setForm] = useState({
    title: event.title,
    date: event.date?.split("T")[0] || "",
    start_time: extractTime(event.start_time),
    end_time: extractTime(event.end_time),
    venue: event.venue,
    booking_status: event.booking_status || "confirmed",
    description: event.description || "",
  });

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    try {
      const dateTime = form.start_time
        ? `${form.date}T${form.start_time}:00`
        : `${form.date}T19:00:00`;

      // Build full timestamps for start_time/end_time (timestamptz columns need date+time)
      const startTimestamp = form.start_time ? `${form.date}T${form.start_time}:00` : null;
      const endTimestamp = form.end_time ? `${form.date}T${form.end_time}:00` : null;

      const payload = {
        title: form.title,
        date: dateTime,
        venue: form.venue,
        booking_status: form.booking_status,
        description: form.description || null,
        start_time: startTimestamp,
        end_time: endTimestamp,
      };

      console.log("Saving event details:", payload);

      const res = await fetch(`/api/events/${event.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const result = await res.json();
        console.log("Event saved successfully:", result);
        setEditing(false);
        onUpdate();
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error("Event save failed:", res.status, errData);
        setSaveError(errData.error || `Save failed (${res.status})`);
      }
    } catch (err) {
      console.error("Event save error:", err);
      setSaveError("Network error — could not save");
    }
    setSaving(false);
  };

  const bookingStatuses = ["confirmed", "hold", "cancelled"];

  if (editing) {
    return (
      <div style={cardStyle}>
        <h3 style={{ color: GOLD, margin: "0 0 16px", fontSize: 15 }}>Edit Event Details</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Event Name</label>
            <input style={inputStyle} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <label style={labelStyle}>Venue</label>
            <input style={inputStyle} value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} />
          </div>
          <div>
            <label style={labelStyle}>Date</label>
            <input style={inputStyle} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div>
            <label style={labelStyle}>Start Time</label>
            <input style={inputStyle} type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
          </div>
          <div>
            <label style={labelStyle}>End Time</label>
            <input style={inputStyle} type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
          </div>
          <div>
            <label style={labelStyle}>Booking Status</label>
            <select style={{ ...inputStyle, appearance: "auto" as const }} value={form.booking_status}
              onChange={(e) => setForm({ ...form, booking_status: e.target.value })}>
              {bookingStatuses.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Notes</label>
            <textarea style={{ ...inputStyle, minHeight: 80 }} value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        </div>
        {saveError && <p style={{ color: "#ef4444", fontSize: 13, marginTop: 8 }}>{saveError}</p>}
        <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
          <button style={btnPrimary} onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
          <button style={btnSecondary} onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ color: GOLD, margin: 0, fontSize: 15 }}>Event Details</h3>
          <button style={{ ...btnSecondary, padding: "6px 14px", fontSize: 12 }} onClick={() => setEditing(true)}>Edit</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div><div style={labelStyle}>Event Name</div><div style={valueStyle}>{event.title}</div></div>
          <div><div style={labelStyle}>Venue</div><div style={valueStyle}>{event.venue}</div></div>
          <div><div style={labelStyle}>Date</div><div style={valueStyle}>{safeDate(event.date)}</div></div>
          <div><div style={labelStyle}>Time</div><div style={valueStyle}>{formatTime12hr(event.start_time)} – {formatTime12hr(event.end_time)}</div></div>
          <div>
            <div style={labelStyle}>Booking Status</div>
            <div style={{ marginTop: 4 }}>
              {statusBadge(event.booking_status || "confirmed")}
            </div>
          </div>
          {event.description && (
            <div style={{ gridColumn: "1 / -1" }}>
              <div style={labelStyle}>Notes</div>
              <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, whiteSpace: "pre-wrap" }}>{event.description}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  TAB 2: CLIENT DETAILS
// ═════════════════════════════════════════════════════════════════════
function ClientDetailsTab({ event, onUpdate }: { event: EventData; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    client_name: event.client_name || event.contact_name || "",
    client_email: event.client_email || event.contact_email || "",
    client_phone: event.client_phone || event.contact_phone || "",
    client_billing_address: event.client_billing_address || "",
    client_company: event.client_company || "",
    tax_exempt: event.tax_exempt || false,
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/events/${event.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: form.client_name || null,
          client_email: form.client_email || null,
          client_phone: form.client_phone || null,
          client_billing_address: form.client_billing_address || null,
          client_company: form.client_company || null,
          tax_exempt: form.tax_exempt,
          // Keep old fields in sync
          contact_name: form.client_name || null,
          contact_email: form.client_email || null,
          contact_phone: form.client_phone || null,
        }),
      });
      if (res.ok) {
        setEditing(false);
        onUpdate();
      }
    } catch { /* ignore */ }
    setSaving(false);
  };

  if (editing) {
    return (
      <div style={cardStyle}>
        <h3 style={{ color: GOLD, margin: "0 0 16px", fontSize: 15 }}>Edit Client Details</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Client Name</label>
            <input style={inputStyle} value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
          </div>
          <div>
            <label style={labelStyle}>Company</label>
            <input style={inputStyle} value={form.client_company} onChange={(e) => setForm({ ...form, client_company: e.target.value })} />
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input style={inputStyle} type="email" value={form.client_email} onChange={(e) => setForm({ ...form, client_email: e.target.value })} />
          </div>
          <div>
            <label style={labelStyle}>Phone</label>
            <input style={inputStyle} value={form.client_phone} onChange={(e) => setForm({ ...form, client_phone: formatPhoneNumber(e.target.value) })} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Billing Address</label>
            <input style={inputStyle} value={form.client_billing_address} onChange={(e) => setForm({ ...form, client_billing_address: e.target.value })} />
          </div>
          <div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, color: "rgba(255,255,255,0.6)", fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={form.tax_exempt}
                onChange={(e) => setForm({ ...form, tax_exempt: e.target.checked })}
                style={{ accentColor: GOLD }} />
              Tax Exempt
            </label>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
          <button style={btnPrimary} onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
          <button style={btnSecondary} onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </div>
    );
  }

  const clientName = event.client_name || event.contact_name;
  const clientEmail = event.client_email || event.contact_email;
  const clientPhone = event.client_phone || event.contact_phone;

  return (
    <div>
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ color: GOLD, margin: 0, fontSize: 15 }}>Client Details</h3>
          <button style={{ ...btnSecondary, padding: "6px 14px", fontSize: 12 }} onClick={() => setEditing(true)}>Edit</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div><div style={labelStyle}>Client Name</div><div style={valueStyle}>{clientName || "—"}</div></div>
          <div><div style={labelStyle}>Company</div><div style={valueStyle}>{event.client_company || "—"}</div></div>
          <div><div style={labelStyle}>Email</div><div style={valueStyle}>{clientEmail || "—"}</div></div>
          <div><div style={labelStyle}>Phone</div><div style={valueStyle}>{clientPhone || "—"}</div></div>
          <div style={{ gridColumn: "1 / -1" }}><div style={labelStyle}>Billing Address</div><div style={valueStyle}>{event.client_billing_address || "—"}</div></div>
          <div>
            <div style={labelStyle}>Tax Exempt</div>
            <div style={valueStyle}>{event.tax_exempt ? "Yes" : "No"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  TAB 3: ATTACHMENTS
// ═════════════════════════════════════════════════════════════════════
function AttachmentsTab({ eventId, attachments, onUpdate }: { eventId: string; attachments: Attachment[]; onUpdate: () => void }) {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      // Upload file via existing upload endpoint
      const formData = new FormData();
      formData.append("file", file);

      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) throw new Error("Upload failed");
      const { url } = await uploadRes.json();

      // Create attachment record
      const attachRes = await fetch(`/api/private-events/${eventId}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_url: url,
          file_name: file.name,
          file_type: file.type || "application/pdf",
        }),
      });

      if (attachRes.ok) onUpdate();
      else alert("Failed to save attachment record");
    } catch {
      alert("Upload failed");
    }
    setUploading(false);
    // Reset input
    e.target.value = "";
  };

  const handleDelete = async (attachmentId: string) => {
    if (!confirm("Delete this attachment?")) return;
    try {
      const res = await fetch(`/api/private-events/${eventId}/attachments?id=${attachmentId}`, {
        method: "DELETE",
      });
      if (res.ok) onUpdate();
      else alert("Failed to delete attachment");
    } catch { alert("Delete failed"); }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ color: "#fff", margin: 0, fontSize: 16 }}>Attachments ({attachments.length})</h3>
        <label style={{ ...btnPrimary, display: "inline-block", cursor: "pointer" }}>
          {uploading ? "Uploading..." : "+ Upload File"}
          <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" onChange={handleUpload}
            style={{ display: "none" }} disabled={uploading} />
        </label>
      </div>

      {attachments.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: "center", padding: 40 }}>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>No attachments yet. Upload PDFs, documents, or images.</p>
        </div>
      ) : (
        <div>
          {attachments.map((a) => (
            <div key={a.id} style={{ ...cardStyle, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px" }}>
              <div>
                <div style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>{a.file_name}</div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 2 }}>
                  {safeDate(a.created_at)} · {a.file_type}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <a href={a.file_url} target="_blank" rel="noopener noreferrer"
                  style={{ ...btnSecondary, padding: "6px 14px", fontSize: 12, textDecoration: "none" }}>
                  Download
                </a>
                <button style={btnDanger} onClick={() => handleDelete(a.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  TAB 4: BILLING
// ═════════════════════════════════════════════════════════════════════
function BillingTab({
  event, revenue, invoices, payments, venueSlug, onRevenueUpdate, onInvoiceCreated,
}: {
  event: EventData; revenue: RevenueItem[]; invoices: Invoice[];
  payments: Payment[]; venueSlug: string; onRevenueUpdate: () => void; onInvoiceCreated: () => void;
}) {
  const [showNewInvoice, setShowNewInvoice] = useState(false);
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [deletingInvoiceId, setDeletingInvoiceId] = useState<string | null>(null);

  // ── Line items state (editable) ──
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [editingItems, setEditingItems] = useState(false);

  // Initialize line items from revenue
  useEffect(() => {
    if (revenue.length > 0 && lineItems.length === 0) {
      setLineItems(revenue.map((r) => ({ description: r.description || r.category, category: r.category, amount: Number(r.amount) })));
    }
  }, [revenue, lineItems.length]);

  const taxExempt = event.tax_exempt || false;
  const TAX_RATE = taxExempt ? 0 : 0.095;
  const subtotal = lineItems.reduce((s, i) => s + i.amount, 0);
  const taxAmount = subtotal * TAX_RATE;
  const total = subtotal + taxAmount;

  // Balance summary
  const totalOwed = invoices.reduce((s, inv) => s + Number(inv.total), 0);
  const totalPaid = invoices.reduce((s, inv) => s + Number(inv.amount_paid), 0);
  const totalRemaining = totalOwed - totalPaid;

  const addLineItem = () => {
    setLineItems((prev) => [...prev, { description: "", amount: 0 }]);
    setEditingItems(true);
  };

  const removeLineItem = (idx: number) => {
    setLineItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateLineItem = (idx: number, field: string, value: string | number) => {
    setLineItems((prev) => {
      const items = [...prev];
      items[idx] = { ...items[idx], [field]: value };
      return items;
    });
  };

  const saveLineItems = async () => {
    // Save to revenue API
    try {
      // Delete existing revenue items first, then re-insert
      const items = lineItems.filter((i) => i.description && i.amount > 0);
      await fetch(`/api/private-events/${event.id}/revenue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venue_id: event.venue_id,
          items: items.map((i, idx) => ({
            category: i.category || "other",
            description: i.description,
            amount: i.amount,
            sort_order: idx,
          })),
          replace: true,
        }),
      });
      setEditingItems(false);
      onRevenueUpdate();
    } catch { alert("Failed to save line items"); }
  };

  // ── Delete Invoice ──
  const handleDeleteInvoice = async (invoiceId: string) => {
    if (!confirm("Are you sure you want to permanently delete this invoice? This cannot be undone.")) return;
    setDeletingInvoiceId(invoiceId);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, { method: "DELETE" });
      if (res.ok) {
        onInvoiceCreated(); // refresh invoices list
      } else {
        alert("Failed to delete invoice");
      }
    } catch {
      alert("Failed to delete invoice");
    }
    setDeletingInvoiceId(null);
  };

  // ── Generate Proposal PDF ──
  const handleGenerateProposal = async () => {
    const { exportProposalPDF } = await import("@/lib/pdf/proposal-pdf");
    const clientName = event.client_name || event.contact_name || "Client";
    await exportProposalPDF({
      proposal_number: `PROP-${Date.now().toString(36).toUpperCase()}`,
      date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      valid_until: (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }); })(),
      event_name: event.title,
      event_date: safeDate(event.date),
      event_venue: event.venue,
      client_name: clientName,
      client_email: event.client_email || event.contact_email,
      client_phone: event.client_phone || event.contact_phone,
      client_company: event.client_company,
      line_items: lineItems.filter((i) => i.amount > 0),
      subtotal,
      tax_rate: TAX_RATE,
      tax_amount: taxAmount,
      total,
      notes: "",
      terms: "",
      venue_name: event.venue,
      venue_slug: venueSlug,
    });
  };

  // ── Generate Invoice ──
  const handleCreateInvoice = async () => {
    setSavingInvoice(true);
    try {
      const clientName = event.client_name || event.contact_name || "Client";
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: event.id,
          venue_id: event.venue_id,
          client_name: clientName,
          client_email: event.client_email || event.contact_email,
          client_phone: event.client_phone || event.contact_phone,
          client_company: event.client_company,
          line_items: lineItems.filter((i) => i.amount > 0),
          subtotal,
          tax_rate: TAX_RATE,
          tax_amount: taxAmount,
          total,
          due_date: (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split("T")[0]; })(),
          status: "draft",
        }),
      });
      if (res.ok) {
        setShowNewInvoice(false);
        onInvoiceCreated();
      } else alert("Failed to create invoice");
    } catch { alert("Error creating invoice"); }
    setSavingInvoice(false);
  };

  // ── Generate Rental Contract PDF ──
  const handleGenerateContract = async () => {
    const { exportRentalContractPDF } = await import("@/lib/pdf/rental-contract-pdf");
    const clientName = event.client_name || event.contact_name || "Client";
    await exportRentalContractPDF({
      contract_number: `RC-${Date.now().toString(36).toUpperCase()}`,
      date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      venue_name: event.venue,
      venue_slug: venueSlug,
      client_name: clientName,
      client_email: event.client_email || event.contact_email,
      client_phone: event.client_phone || event.contact_phone,
      client_company: event.client_company,
      client_address: event.client_billing_address,
      event_name: event.title,
      event_date: safeDate(event.date),
      event_time_start: event.start_time,
      event_time_end: event.end_time,
      line_items: lineItems.filter((i) => i.amount > 0),
      subtotal,
      tax_rate: TAX_RATE,
      tax_amount: taxAmount,
      total,
      deposit_percent: 20,
      deposit_amount: total * 0.2,
      insurance_required: true,
    });
  };

  const handleDownloadInvoicePDF = async (inv: Invoice) => {
    const { exportInvoicePDF } = await import("@/lib/pdf/invoice-pdf");
    const clientName = event.client_name || event.contact_name || "Client";
    const paymentUrl = `${window.location.origin}/pay/${inv.id}`;
    await exportInvoicePDF({
      invoice_number: inv.invoice_number,
      invoice_date: new Date(inv.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      due_date: new Date(inv.due_date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      client_name: inv.client_name || clientName,
      client_email: inv.client_email || event.client_email || event.contact_email,
      client_phone: inv.client_phone || event.client_phone || event.contact_phone,
      client_company: event.client_company,
      client_address: event.client_billing_address,
      event_name: event.title,
      event_date: safeDate(event.date),
      line_items: inv.line_items || [],
      subtotal: Number(inv.subtotal),
      tax_rate: Number(inv.tax_rate),
      tax_amount: Number(inv.tax_amount),
      total: Number(inv.total),
      amount_paid: Number(inv.amount_paid),
      balance_due: Number(inv.balance_due),
      tax_exempt: event.tax_exempt || false,
      payment_url: paymentUrl,
      venue_name: event.venue,
      venue_slug: venueSlug,
    });
  };

  const copyPaymentLink = (invoiceId: string) => {
    const url = `${window.location.origin}/pay/${invoiceId}`;
    navigator.clipboard.writeText(url);
    alert("Payment link copied to clipboard!");
  };

  return (
    <div>
      {/* ── LINE ITEMS SECTION ── */}
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ color: GOLD, margin: 0, fontSize: 15 }}>Line Items</h3>
          <div style={{ display: "flex", gap: 8 }}>
            {editingItems && (
              <button style={{ ...btnPrimary, padding: "6px 14px", fontSize: 12 }} onClick={saveLineItems}>Save Items</button>
            )}
            <button style={{ ...btnSecondary, padding: "6px 14px", fontSize: 12 }} onClick={addLineItem}>+ Add Item</button>
          </div>
        </div>

        {/* Table */}
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <th style={{ textAlign: "left", padding: "8px 0", color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 500 }}>DESCRIPTION</th>
              <th style={{ textAlign: "right", padding: "8px 0", color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 500, width: 140 }}>AMOUNT</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((item, i) => (
              <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <td style={{ padding: "8px 0" }}>
                  {editingItems ? (
                    <input style={{ ...inputStyle, padding: "6px 10px" }} value={item.description}
                      onChange={(e) => updateLineItem(i, "description", e.target.value)} placeholder="Description" />
                  ) : (
                    <span style={{ color: "#fff", fontSize: 14 }}>{item.description}</span>
                  )}
                </td>
                <td style={{ padding: "8px 0", textAlign: "right" }}>
                  {editingItems ? (
                    <input style={{ ...inputStyle, padding: "6px 10px", textAlign: "right" }} type="number" value={item.amount || ""}
                      onChange={(e) => updateLineItem(i, "amount", Number(e.target.value))} step="0.01" />
                  ) : (
                    <span style={{ color: GOLD, fontSize: 14, fontWeight: 600 }}>{fmt(item.amount)}</span>
                  )}
                </td>
                <td style={{ padding: "8px 0", textAlign: "center" }}>
                  {editingItems && (
                    <button onClick={() => removeLineItem(i)}
                      style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 16 }}>✕</button>
                  )}
                </td>
              </tr>
            ))}
            {lineItems.length === 0 && (
              <tr>
                <td colSpan={3} style={{ padding: 20, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
                  No line items. Click &quot;+ Add Item&quot; to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Summary */}
        <div style={{ marginTop: 16, padding: "12px 0", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>Subtotal</span>
            <span style={{ color: "#fff", fontSize: 13 }}>{fmt(subtotal)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
              Tax {taxExempt ? "(Exempt)" : `(${(TAX_RATE * 100).toFixed(1)}%)`}
            </span>
            <span style={{ color: "#fff", fontSize: 13 }}>{fmt(taxAmount)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: GOLD, fontSize: 16, fontWeight: 700 }}>Total</span>
            <span style={{ color: GOLD, fontSize: 16, fontWeight: 700 }}>{fmt(total)}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
          <button style={btnPrimary} onClick={handleGenerateProposal}>Generate Proposal</button>
          <button style={btnPrimary} onClick={handleCreateInvoice} disabled={savingInvoice}>
            {savingInvoice ? "Creating..." : "Generate Invoice"}
          </button>
          <button style={btnPrimary} onClick={handleGenerateContract}>Generate Contract</button>
        </div>
      </div>

      {/* ── INVOICE BALANCE SUMMARY ── */}
      {invoices.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
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
      )}

      {/* ── INVOICES LIST ── */}
      {invoices.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ color: "#fff", margin: "0 0 12px", fontSize: 16 }}>Invoices ({invoices.length})</h3>
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
                <button style={{ ...btnSecondary, padding: "6px 14px", fontSize: 12 }} onClick={() => handleDownloadInvoicePDF(inv)}>
                  PDF
                </button>
                <button
                  style={{ ...btnDanger, padding: "6px 14px", fontSize: 12 }}
                  onClick={() => handleDeleteInvoice(inv.id)}
                  disabled={deletingInvoiceId === inv.id}
                >
                  {deletingInvoiceId === inv.id ? "Deleting..." : "Delete Invoice"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── PAYMENT HISTORY ── */}
      {payments.length > 0 && (
        <div>
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

// ═════════════════════════════════════════════════════════════════════
//  TAB 5: QUOTE BUILDER
// ═════════════════════════════════════════════════════════════════════

const QUOTE_CATEGORIES = [
  "Room Rental", "A/V Production", "Food & Beverage", "Staffing",
  "Setup & Teardown", "Décor & Linens", "Entertainment", "Additional Fees", "Custom",
];

const QUOTE_TEMPLATES: Record<string, Omit<QuoteLineItem, "amount">[]> = {
  wedding: [
    { category: "Room Rental",    description: "Main Hall — Full Day",            quantity: 1, unit_price: 2500 },
    { category: "A/V Production", description: "Sound System & Lighting Package", quantity: 1, unit_price: 800  },
    { category: "Staffing",       description: "Event Coordinator",               quantity: 1, unit_price: 500  },
    { category: "Staffing",       description: "Bartender",                       quantity: 2, unit_price: 250  },
    { category: "Décor & Linens", description: "House Linens Package",            quantity: 1, unit_price: 300  },
    { category: "Additional Fees",description: "Cake Cutting Fee",                quantity: 1, unit_price: 150  },
  ],
  corporate: [
    { category: "Room Rental",    description: "Main Hall",                       quantity: 1, unit_price: 1500 },
    { category: "A/V Production", description: "Sound & Projection Package",      quantity: 1, unit_price: 600  },
    { category: "Food & Beverage",description: "F&B Minimum",                     quantity: 1, unit_price: 1000 },
    { category: "Staffing",       description: "Event Coordinator",               quantity: 1, unit_price: 350  },
  ],
  birthday: [
    { category: "Room Rental",    description: "Main Hall",                       quantity: 1, unit_price: 1200 },
    { category: "Food & Beverage",description: "Bar Package",                     quantity: 1, unit_price: 800  },
    { category: "Staffing",       description: "Bartender",                       quantity: 1, unit_price: 250  },
    { category: "Entertainment",  description: "DJ Fee",                          quantity: 1, unit_price: 500  },
  ],
};

function emptyLineItem(): QuoteLineItem {
  return { category: "Room Rental", description: "", quantity: 1, unit_price: 0, amount: 0 };
}

function emptyQuoteForm(event: EventData): {
  line_items: QuoteLineItem[];
  notes: string; terms: string; valid_days: number;
  deposit_pct: number; deposit_due: string; balance_due_date: string;
  cancellation_policy: string; event_type_label: string; tax_exempt: boolean;
} {
  return {
    line_items: [emptyLineItem()],
    notes: "", terms: "",
    valid_days: 14,
    deposit_pct: 25,
    deposit_due: "On Acceptance",
    balance_due_date: "30 Days Before Event",
    cancellation_policy: "Cancellations made more than 30 days before the event date will receive a refund of the deposit less a 10% administrative fee. Cancellations within 30 days of the event are non-refundable.",
    event_type_label: "",
    tax_exempt: event.tax_exempt || false,
  };
}

function QuoteTab({ event, quotes, onUpdate, venueSlug }: {
  event: EventData;
  quotes: Quote[];
  onUpdate: () => void;
  venueSlug: string;
}) {
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [form, setForm] = useState(() => emptyQuoteForm(event));
  const [saving, setSaving] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);

  const TAX_RATE = form.tax_exempt ? 0 : 0.095;
  const subtotal = form.line_items.reduce((s, i) => s + i.amount, 0);
  const taxAmount = Math.round(subtotal * TAX_RATE * 100) / 100;
  const total = subtotal + taxAmount;
  const depositAmount = Math.round(total * (form.deposit_pct / 100) * 100) / 100;

  const updateLineItem = (idx: number, field: keyof QuoteLineItem, val: string | number) => {
    setForm((prev) => {
      const items = prev.line_items.map((item, i) => {
        if (i !== idx) return item;
        const updated = { ...item, [field]: val };
        // Recalculate amount when qty or unit_price changes
        if (field === "quantity" || field === "unit_price") {
          updated.amount = Math.round(Number(updated.quantity) * Number(updated.unit_price) * 100) / 100;
        }
        return updated;
      });
      return { ...prev, line_items: items };
    });
  };

  const applyTemplate = (key: string) => {
    const tpl = QUOTE_TEMPLATES[key];
    if (!tpl) return;
    setForm((prev) => ({
      ...prev,
      line_items: tpl.map((t) => ({ ...t, amount: Math.round(t.quantity * t.unit_price * 100) / 100 })),
    }));
  };

  const openNew = () => {
    setEditingQuote(null);
    setForm(emptyQuoteForm(event));
    setShowBuilder(true);
  };

  const openEdit = (q: Quote) => {
    setEditingQuote(q);
    setForm({
      line_items: q.line_items || [emptyLineItem()],
      notes: q.notes || "",
      terms: q.terms || "",
      valid_days: q.valid_until
        ? Math.max(1, Math.ceil((new Date(q.valid_until).getTime() - Date.now()) / 86400000))
        : 14,
      deposit_pct: q.deposit_pct || 25,
      deposit_due: q.deposit_due || "On Acceptance",
      balance_due_date: q.balance_due_date || "30 Days Before Event",
      cancellation_policy: q.cancellation_policy || "",
      event_type_label: q.event_type_label || "",
      tax_exempt: event.tax_exempt || false,
    });
    setShowBuilder(true);
  };

  const saveQuote = async (): Promise<Quote | null> => {
    setSaving(true);
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + form.valid_days);

    const payload = {
      line_items: form.line_items.filter((i) => i.description && i.amount >= 0),
      subtotal,
      tax_rate: TAX_RATE,
      tax_amount: taxAmount,
      total,
      deposit_pct: form.deposit_pct,
      deposit_amount: depositAmount,
      deposit_due: form.deposit_due,
      balance_due_date: form.balance_due_date,
      cancellation_policy: form.cancellation_policy,
      notes: form.notes,
      terms: form.terms,
      valid_until: validUntil.toISOString().split("T")[0],
      event_type_label: form.event_type_label,
      client_name: event.client_name || event.contact_name || "",
      client_email: event.client_email || event.contact_email || "",
      client_phone: event.client_phone || event.contact_phone || "",
      client_company: event.client_company || "",
      status: editingQuote?.status === "accepted" ? "accepted" : "draft",
    };

    try {
      let res: Response;
      if (editingQuote) {
        res = await fetch(`/api/private-events/${event.id}/proposals/${editingQuote.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`/api/private-events/${event.id}/proposals`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      if (!res.ok) { alert("Failed to save quote"); setSaving(false); return null; }
      const saved = await res.json();
      onUpdate();
      return saved;
    } catch { alert("Error saving quote"); setSaving(false); return null; }
    finally { setSaving(false); }
  };

  const handleSaveDraft = async () => {
    const saved = await saveQuote();
    if (saved) { setShowBuilder(false); setEditingQuote(null); }
  };

  const handleDownloadPDF = async (q?: Quote) => {
    let quote = q ?? editingQuote;
    // If called from builder, save first
    if (!q) {
      const saved = await saveQuote();
      if (!saved) return;
      quote = saved;
    }
    if (!quote) return;
    setDownloadingId(quote.id);
    try {
      const { exportProposalPDF } = await import("@/lib/pdf/proposal-pdf");
      const validDate = quote.valid_until
        ? new Date(quote.valid_until + "T12:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
        : "—";
      await exportProposalPDF({
        proposal_number: `${quote.proposal_number}${(quote.version || 1) > 1 ? `-v${quote.version}` : ""}`,
        date: new Date(quote.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
        valid_until: validDate,
        event_name: event.title,
        event_date: safeDate(event.date),
        event_venue: event.venue,
        client_name: quote.client_name || event.client_name || event.contact_name || "Client",
        client_email: quote.client_email || event.client_email || event.contact_email,
        client_phone: quote.client_phone || event.client_phone || event.contact_phone,
        client_company: quote.client_company || event.client_company,
        event_type_label: quote.event_type_label || undefined,
        line_items: (quote.line_items || []).map((i) => ({
          description: i.description,
          category: i.category,
          amount: i.amount,
        })),
        subtotal: quote.subtotal,
        tax_rate: quote.tax_rate,
        tax_amount: quote.tax_amount,
        total: quote.total,
        deposit_pct: quote.deposit_pct || undefined,
        deposit_amount: quote.deposit_amount || undefined,
        deposit_due: quote.deposit_due || undefined,
        balance_due_date: quote.balance_due_date || undefined,
        cancellation_policy: quote.cancellation_policy || undefined,
        notes: quote.notes || undefined,
        terms: quote.terms || undefined,
        venue_name: event.venue,
        venue_slug: venueSlug,
      });
      if (!q) { setShowBuilder(false); setEditingQuote(null); onUpdate(); }
    } finally { setDownloadingId(null); }
  };

  const handleAccept = async (q: Quote) => {
    if (!confirm(`Mark "${q.proposal_number}" as accepted and confirm this event booking?`)) return;
    setAcceptingId(q.id);
    try {
      const res = await fetch(`/api/private-events/${event.id}/proposals/${q.id}/accept`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepted_by: "Admin" }),
      });
      if (res.ok) { onUpdate(); }
      else alert("Failed to accept quote");
    } finally { setAcceptingId(null); }
  };

  const handleDecline = async (q: Quote) => {
    if (!confirm(`Mark "${q.proposal_number}" as declined?`)) return;
    setDecliningId(q.id);
    try {
      const res = await fetch(`/api/private-events/${event.id}/proposals/${q.id}/decline`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) { onUpdate(); }
      else alert("Failed to decline quote");
    } finally { setDecliningId(null); }
  };

  const handleDelete = async (q: Quote) => {
    if (!confirm(`Delete quote ${q.proposal_number}? This cannot be undone.`)) return;
    await fetch(`/api/private-events/${event.id}/proposals/${q.id}`, { method: "DELETE" });
    onUpdate();
  };

  // ── LIST VIEW ─────────────────────────────────────────────────────
  if (!showBuilder) {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <h3 style={{ color: "#fff", margin: 0, fontSize: 16 }}>Quotes & Estimates</h3>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, margin: "4px 0 0" }}>
              Build a quote, download the PDF, and send it manually. Mark accepted when the client confirms.
            </p>
          </div>
          <button onClick={openNew} style={btnPrimary}>+ New Quote</button>
        </div>

        {quotes.length === 0 ? (
          <div style={{ ...cardStyle, textAlign: "center", padding: "48px 24px" }}>
            <p style={{ color: "rgba(255,255,255,0.3)", margin: "0 0 16px", fontSize: 15 }}>No quotes yet</p>
            <button onClick={openNew} style={btnPrimary}>Build First Quote</button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {quotes.map((q) => (
              <div key={q.id} style={{ ...cardStyle, marginBottom: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                      <span style={{ color: GOLD, fontWeight: 700, fontSize: 15 }}>{q.proposal_number}</span>
                      {(q.version || 1) > 1 && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>v{q.version}</span>}
                      {statusBadge(q.status || "draft")}
                    </div>
                    <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
                      Created {safeDate(q.created_at)}
                      {q.valid_until && ` · Valid until ${safeDate(q.valid_until)}`}
                      {q.accepted_at && ` · Accepted ${safeDate(q.accepted_at)}${q.accepted_by ? ` by ${q.accepted_by}` : ""}`}
                    </div>
                    {q.event_type_label && (
                      <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 2 }}>{q.event_type_label}</div>
                    )}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>{fmt(q.total)}</div>
                    {(q.deposit_pct > 0) && (
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>
                        Deposit: {fmt(q.deposit_amount)} ({q.deposit_pct}%)
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                  <button
                    onClick={() => handleDownloadPDF(q)}
                    disabled={downloadingId === q.id}
                    style={{ ...btnPrimary, fontSize: 12, padding: "8px 16px" }}
                  >
                    {downloadingId === q.id ? "Generating..." : "⬇ Download PDF"}
                  </button>
                  {q.status !== "accepted" && (
                    <>
                      <button onClick={() => openEdit(q)} style={{ ...btnSecondary, fontSize: 12, padding: "8px 16px" }}>
                        Edit
                      </button>
                      <button
                        onClick={() => handleAccept(q)}
                        disabled={acceptingId === q.id}
                        style={{
                          fontSize: 12, padding: "8px 16px", borderRadius: 8, fontWeight: 600, cursor: "pointer",
                          background: "rgba(34,197,94,0.12)", color: "#22c55e",
                          border: "1px solid rgba(34,197,94,0.3)",
                        }}
                      >
                        {acceptingId === q.id ? "Confirming..." : "✓ Mark Accepted"}
                      </button>
                      {q.status !== "declined" && (
                        <button
                          onClick={() => handleDecline(q)}
                          disabled={decliningId === q.id}
                          style={{ ...btnDanger, fontSize: 12, padding: "8px 14px" }}
                        >
                          {decliningId === q.id ? "..." : "Mark Declined"}
                        </button>
                      )}
                    </>
                  )}
                  {q.status === "accepted" && (
                    <span style={{ fontSize: 12, color: "#22c55e", padding: "8px 0" }}>
                      ✓ Event confirmed from this quote
                    </span>
                  )}
                  <button onClick={() => handleDelete(q)} style={{ ...btnDanger, fontSize: 11, padding: "6px 10px", marginLeft: "auto" }}>
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

  // ── BUILDER VIEW ──────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <button
            onClick={() => { setShowBuilder(false); setEditingQuote(null); }}
            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 13, padding: 0, marginBottom: 6 }}
          >
            ← Back to Quotes
          </button>
          <h3 style={{ color: GOLD, margin: 0, fontSize: 18 }}>
            {editingQuote ? `Edit ${editingQuote.proposal_number}` : "New Quote"}
          </h3>
          <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, margin: "4px 0 0" }}>
            {event.title} · {safeDate(event.date)}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={handleSaveDraft} disabled={saving} style={{ ...btnSecondary, fontSize: 13 }}>
            {saving ? "Saving..." : "Save Draft"}
          </button>
          <button
            onClick={() => handleDownloadPDF()}
            disabled={saving || !!downloadingId}
            style={{ ...btnPrimary, fontSize: 13 }}
          >
            {downloadingId ? "Generating PDF..." : saving ? "Saving..." : "Save & Download PDF"}
          </button>
        </div>
      </div>

      {/* Template selector */}
      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>
          Start from template (optional)
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { key: "wedding", label: "Wedding Reception" },
            { key: "corporate", label: "Corporate Event" },
            { key: "birthday", label: "Birthday / Social" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => applyTemplate(t.key)}
              style={{
                padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                background: "rgba(208,194,144,0.08)", color: GOLD,
                border: "1px solid rgba(208,194,144,0.2)",
              }}
            >
              {t.label}
            </button>
          ))}
          <button
            onClick={() => setForm((p) => ({ ...p, line_items: [emptyLineItem()] }))}
            style={{
              padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
              background: "transparent", color: "rgba(255,255,255,0.4)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            Start Blank
          </button>
        </div>
      </div>

      {/* Event type label */}
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Event Type (for PDF)</label>
        <input
          style={inputStyle}
          value={form.event_type_label}
          onChange={(e) => setForm((p) => ({ ...p, event_type_label: e.target.value }))}
          placeholder="e.g. Wedding Reception, Corporate Dinner, Birthday Party"
        />
      </div>

      {/* Line items */}
      <div style={{ ...cardStyle }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h4 style={{ color: "#fff", margin: 0, fontSize: 15 }}>Line Items</h4>
          <button
            onClick={() => setForm((p) => ({ ...p, line_items: [...p.line_items, emptyLineItem()] }))}
            style={{ ...btnSecondary, fontSize: 12, padding: "6px 14px" }}
          >
            + Add Item
          </button>
        </div>

        {/* Header row */}
        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 60px 90px 90px 32px", gap: 8, marginBottom: 8, padding: "0 0 8px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          {["Category", "Description", "Qty", "Unit Price", "Total", ""].map((h) => (
            <span key={h} style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, fontWeight: 600, textTransform: "uppercase" }}>{h}</span>
          ))}
        </div>

        {form.line_items.map((item, idx) => (
          <div key={idx} style={{ display: "grid", gridTemplateColumns: "160px 1fr 60px 90px 90px 32px", gap: 8, marginBottom: 8, alignItems: "center" }}>
            <select
              value={item.category}
              onChange={(e) => updateLineItem(idx, "category", e.target.value)}
              style={{ ...inputStyle, padding: "7px 10px", fontSize: 12 }}
            >
              {QUOTE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              style={{ ...inputStyle, fontSize: 13 }}
              value={item.description}
              onChange={(e) => updateLineItem(idx, "description", e.target.value)}
              placeholder="Description"
            />
            <input
              type="number" min="1"
              style={{ ...inputStyle, fontSize: 13, textAlign: "right" }}
              value={item.quantity}
              onChange={(e) => updateLineItem(idx, "quantity", parseFloat(e.target.value) || 1)}
            />
            <input
              type="number" min="0" step="0.01"
              style={{ ...inputStyle, fontSize: 13, textAlign: "right" }}
              value={item.unit_price}
              onChange={(e) => updateLineItem(idx, "unit_price", parseFloat(e.target.value) || 0)}
            />
            <div style={{ color: "#fff", fontSize: 13, fontWeight: 600, textAlign: "right", paddingRight: 4 }}>
              {fmt(item.amount)}
            </div>
            <button
              onClick={() => setForm((p) => ({ ...p, line_items: p.line_items.filter((_, i) => i !== idx) }))}
              style={{ background: "none", border: "none", color: "rgba(255,80,80,0.6)", cursor: "pointer", fontSize: 16, padding: 0 }}
              title="Remove"
            >×</button>
          </div>
        ))}

        {/* Totals */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: 12, paddingTop: 12, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <div style={{ display: "flex", gap: 40 }}>
            <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>Subtotal</span>
            <span style={{ color: "#fff", fontSize: 13, fontWeight: 600, minWidth: 80, textAlign: "right" }}>{fmt(subtotal)}</span>
          </div>
          {!form.tax_exempt && (
            <div style={{ display: "flex", gap: 40 }}>
              <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>Tax (9.5%)</span>
              <span style={{ color: "#fff", fontSize: 13, fontWeight: 600, minWidth: 80, textAlign: "right" }}>{fmt(taxAmount)}</span>
            </div>
          )}
          <div style={{ display: "flex", gap: 40 }}>
            <span style={{ color: GOLD, fontSize: 16, fontWeight: 700 }}>Total</span>
            <span style={{ color: GOLD, fontSize: 16, fontWeight: 700, minWidth: 80, textAlign: "right" }}>{fmt(total)}</span>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
            <input type="checkbox" checked={form.tax_exempt} onChange={(e) => setForm((p) => ({ ...p, tax_exempt: e.target.checked }))} />
            Tax Exempt
          </label>
        </div>
      </div>

      {/* Payment Terms */}
      <div style={{ ...cardStyle }}>
        <h4 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>Payment Terms</h4>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Deposit %</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="number" min="0" max="100"
                style={{ ...inputStyle, flex: 1 }}
                value={form.deposit_pct}
                onChange={(e) => setForm((p) => ({ ...p, deposit_pct: parseFloat(e.target.value) || 0 }))}
              />
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, whiteSpace: "nowrap" }}>
                = {fmt(depositAmount)}
              </span>
            </div>
          </div>
          <div>
            <label style={labelStyle}>Deposit Due</label>
            <select style={inputStyle} value={form.deposit_due} onChange={(e) => setForm((p) => ({ ...p, deposit_due: e.target.value }))}>
              <option>On Acceptance</option>
              <option>Within 7 Days</option>
              <option>Within 14 Days</option>
              <option>Within 30 Days</option>
              <option>Custom</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Balance Due</label>
            <select style={inputStyle} value={form.balance_due_date} onChange={(e) => setForm((p) => ({ ...p, balance_due_date: e.target.value }))}>
              <option>30 Days Before Event</option>
              <option>14 Days Before Event</option>
              <option>7 Days Before Event</option>
              <option>Day of Show</option>
              <option>Custom</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Quote Valid For (days)</label>
            <input
              type="number" min="1"
              style={inputStyle}
              value={form.valid_days}
              onChange={(e) => setForm((p) => ({ ...p, valid_days: parseInt(e.target.value) || 14 }))}
            />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Cancellation Policy</label>
          <textarea
            style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
            value={form.cancellation_policy}
            onChange={(e) => setForm((p) => ({ ...p, cancellation_policy: e.target.value }))}
            placeholder="Describe your cancellation and refund terms..."
          />
        </div>
      </div>

      {/* Notes & Terms */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
        <div style={cardStyle}>
          <label style={{ ...labelStyle, marginBottom: 8, display: "block" }}>Internal Notes (not on PDF)</label>
          <textarea
            style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            placeholder="Notes for your team only..."
          />
        </div>
        <div style={cardStyle}>
          <label style={{ ...labelStyle, marginBottom: 8, display: "block" }}>Terms & Conditions (on PDF)</label>
          <textarea
            style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
            value={form.terms}
            onChange={(e) => setForm((p) => ({ ...p, terms: e.target.value }))}
            placeholder="Additional terms for the client..."
          />
        </div>
      </div>

      {/* Bottom actions */}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button
          onClick={() => { setShowBuilder(false); setEditingQuote(null); }}
          style={{ ...btnSecondary, fontSize: 13, color: "rgba(255,255,255,0.5)", borderColor: "rgba(255,255,255,0.15)" }}
        >
          Cancel
        </button>
        <button onClick={handleSaveDraft} disabled={saving} style={{ ...btnSecondary, fontSize: 13 }}>
          {saving ? "Saving..." : "Save Draft"}
        </button>
        <button
          onClick={() => handleDownloadPDF()}
          disabled={saving || !!downloadingId}
          style={{ ...btnPrimary, fontSize: 13 }}
        >
          {downloadingId ? "Generating PDF..." : "Save & Download PDF"}
        </button>
      </div>
    </div>
  );
}
