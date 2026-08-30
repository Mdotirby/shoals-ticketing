"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { formatPhoneNumber } from "@/lib/formatPhone";
import Link from "next/link";
import PDFPreviewModal from "@/app/components/admin/PDFPreviewModal";
import { rateLabel } from "@/lib/fees/rates";

type Order = {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  quantity: number;
  total_amount: number;
  created_at: string;
  source?: string | null;
  promo_code_id?: string | null;
  promo_codes?: {
    code: string;
    discount_type: "fixed" | "percentage";
    discount_value: string | number;
  } | null;
};

type ViewStats = {
  total_views: number;
  unique_views: number;
  purchase_views: number;
  views_without_purchase: number;
  conversion_rate: string;
};

type EventInfo = {
  title: string;
  venue: string;
  date: string;
  closed_out_at?: string | null;
  closed_out_note?: string | null;
};

type OrderSortKey = "customer_name" | "quantity" | "total_amount" | "created_at";

/** Clickable column header for the orders table. */
function SortHeader({
  label, sortKey, activeKey, dir, onSort,
}: {
  label: string;
  sortKey: OrderSortKey;
  activeKey: OrderSortKey;
  dir: "asc" | "desc";
  onSort: (key: OrderSortKey) => void;
}) {
  const active = activeKey === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
      title={`Sort by ${label.toLowerCase()}`}
    >
      {label}
      <span style={{ opacity: active ? 0.9 : 0.25, marginLeft: 4, fontSize: 10 }}>
        {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
      </span>
    </th>
  );
}

function SourceBadge({ source }: { source: string | null }) {
  const src = (source || "online").toLowerCase();
  const palette: Record<string, { bg: string; color: string; border: string; label: string }> = {
    online:        { bg: "rgba(59,130,246,0.1)",  color: "#60a5fa", border: "rgba(59,130,246,0.3)", label: "Online" },
    box_office:    { bg: "rgba(251,191,36,0.1)",  color: "#fbbf24", border: "rgba(251,191,36,0.3)", label: "Box Office" },
    inline_checkout:{bg: "rgba(59,130,246,0.1)",  color: "#60a5fa", border: "rgba(59,130,246,0.3)", label: "Online" },
    // Card-present sale taken on a Stripe Terminal reader at the door. Given
    // its own colour rather than sharing Box Office's: both are door sales,
    // but only this one is card-present, which is a different Stripe rate
    // (2.7% + $0.05) and a different reconciliation path.
    terminal:      { bg: "rgba(168,85,247,0.12)", color: "#c084fc", border: "rgba(168,85,247,0.35)", label: "Terminal" },
    comp:          { bg: "rgba(34,197,94,0.12)",  color: "#22c55e", border: "rgba(34,197,94,0.35)", label: "Comp" },
  };
  // Unknown sources fall back to a neutral label rather than silently reading
  // as "Online" — a Terminal sale used to be mislabelled that way.
  const p =
    palette[src] ??
    { bg: "rgba(148,163,184,0.12)", color: "#94a3b8", border: "rgba(148,163,184,0.35)", label: src || "Unknown" };
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 6,
      fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
      background: p.bg, color: p.color, border: `1px solid ${p.border}`,
      whiteSpace: "nowrap",
    }}>
      {p.label}
    </span>
  );
}

export default function EventSalesDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [viewStats, setViewStats] = useState<ViewStats | null>(null);
  const [revSummary, setRevSummary] = useState<{
    grossRevenue: number; ticketRevenue: number; serviceFeesGross: number;
    taxCollected: number; processingFees: number; netToVenue: number;
    refundTotal: number; saleCount: number; refundCount: number;
  } | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showPreview, setShowPreview] = useState(false);

  // ── Settlement: existing-or-create ────────────────────────────────────────
  const [settlementId, setSettlementId] = useState<string | null>(null);
  const [settlementStatus, setSettlementStatus] = useState<"draft" | "finalized" | null>(null);
  const [creatingSettlement, setCreatingSettlement] = useState(false);

  // ── Close-Out Show ────────────────────────────────────────────────────────
  // Locks the event from public ticket sales and adds it to the past archive.
  const [closingOut, setClosingOut] = useState(false);
  const isClosedOut = !!event?.closed_out_at;

  const handleCloseOut = async () => {
    if (!event) return;
    if (isClosedOut) {
      if (!confirm("Reopen this show?\n\nReopening will put it back on customer-facing pages and allow ticket sales again.")) return;
      setClosingOut(true);
      try {
        const res = await fetch(`/api/events/${id}/closeout`, { method: "DELETE" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Failed to reopen show");
        setEvent((prev) => prev ? { ...prev, closed_out_at: null, closed_out_note: null } : prev);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to reopen show");
      } finally {
        setClosingOut(false);
      }
      return;
    }
    const note = prompt(
      "Close out this show?\n\nThis will:\n  • lock new ticket purchases\n  • hide it from upcoming events\n  • move it to the public Past Shows archive\n\nOptional note (e.g. attendance, weather):",
      ""
    );
    if (note === null) return; // cancelled
    setClosingOut(true);
    try {
      const res = await fetch(`/api/events/${id}/closeout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to close out show");
      setEvent((prev) => prev ? {
        ...prev,
        closed_out_at: data.closed_out_at ?? new Date().toISOString(),
        closed_out_note: data.closed_out_note ?? note.trim() ?? null,
      } : prev);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to close out show");
    } finally {
      setClosingOut(false);
    }
  };

  const handleSettlementClick = async () => {
    if (settlementId) {
      router.push(`/admin/settlements/${settlementId}`);
      return;
    }
    setCreatingSettlement(true);
    try {
      const res = await fetch("/api/settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to create settlement");
      router.push(`/admin/settlements/${data.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not create settlement";
      alert(msg);
    } finally {
      setCreatingSettlement(false);
    }
  };

  // ── "Issue Comp Tickets" modal state ───────────────────────────────────────
  const [compOpen, setCompOpen] = useState(false);
  const [compName, setCompName] = useState("");
  const [compEmail, setCompEmail] = useState("");
  const [compPhone, setCompPhone] = useState("");
  const [compQty, setCompQty] = useState("1");
  const [compNote, setCompNote] = useState("");
  const [compSaving, setCompSaving] = useState(false);
  const [compError, setCompError] = useState<string | null>(null);
  const [compSuccess, setCompSuccess] = useState<string | null>(null);

  // ── Orders table: name lookup + sorting ────────────────────────────────────
  // Will-call needs the same interaction as the door scanner: type a name, see
  // the ticket. The table was purchase-ordered with no search at all.
  const [orderSearch, setOrderSearch] = useState("");
  const [orderSort, setOrderSort] = useState<OrderSortKey>("created_at");
  const [orderSortDir, setOrderSortDir] = useState<"asc" | "desc">("desc");

  const toggleOrderSort = (key: OrderSortKey) => {
    if (orderSort === key) {
      setOrderSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setOrderSort(key);
      // Names read naturally A→Z; money and dates read biggest/newest first.
      setOrderSortDir(key === "customer_name" ? "asc" : "desc");
    }
  };

  const term = orderSearch.trim().toLowerCase();
  const visibleOrders = orders
    .filter((o) => {
      if (!term) return true;
      return (
        (o.customer_name || "").toLowerCase().includes(term) ||
        (o.customer_email || "").toLowerCase().includes(term) ||
        (o.customer_phone || "").toLowerCase().includes(term)
      );
    })
    .slice()
    .sort((a, b) => {
      const dir = orderSortDir === "asc" ? 1 : -1;
      switch (orderSort) {
        case "customer_name":
          return dir * (a.customer_name || "").localeCompare(b.customer_name || "", "en", { sensitivity: "base" });
        case "quantity":
          return dir * ((a.quantity || 1) - (b.quantity || 1));
        case "total_amount":
          return dir * ((a.total_amount || 0) - (b.total_amount || 0));
        default:
          return dir * ((new Date(a.created_at).getTime() || 0) - (new Date(b.created_at).getTime() || 0));
      }
    });

  const resetCompForm = () => {
    setCompName(""); setCompEmail(""); setCompPhone(""); setCompQty("1");
    setCompNote(""); setCompError(null); setCompSuccess(null);
  };

  const submitComp = async () => {
    setCompError(null);
    setCompSuccess(null);
    if (!compName.trim()) { setCompError("Name is required."); return; }
    if (!compEmail.trim() || !compEmail.includes("@")) { setCompError("Valid email is required."); return; }
    const qty = Math.max(1, Math.min(50, parseInt(compQty, 10) || 1));
    setCompSaving(true);
    try {
      const res = await fetch("/api/admin/comps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: id,
          buyer_name: compName.trim(),
          buyer_email: compEmail.trim(),
          buyer_phone: compPhone.trim() || undefined,
          quantity: qty,
          note: compNote.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to issue comp tickets");
      setCompSuccess(`${qty} comp ticket${qty > 1 ? "s" : ""} issued & emailed to ${compEmail.trim()}.`);
      // Refresh the orders list so the new comp shows up immediately
      const refreshed = await fetch(`/api/orders?event_id=${id}`).then((r) => r.json());
      if (Array.isArray(refreshed)) setOrders(refreshed);
      // Clear the form but keep the modal open so the user sees the success msg
      setCompName(""); setCompEmail(""); setCompPhone(""); setCompQty("1"); setCompNote("");
    } catch (err: unknown) {
      setCompError(err instanceof Error ? err.message : "Failed to issue comp tickets");
    } finally {
      setCompSaving(false);
    }
  };

  useEffect(() => {
    async function loadData() {
      try {
        const [eventData, ordersData] = await Promise.all([
          fetch(`/api/events/${id}`).then((r) => r.json()),
          fetch(`/api/orders?event_id=${id}`).then((r) => r.json()),
        ]);
        if (eventData && !eventData.error) setEvent(eventData);
        if (Array.isArray(ordersData)) setOrders(ordersData);

        // Fetch revenue summary from settlement ledger
        try {
          const revRes = await fetch(`/api/events/${id}/revenue-summary`);
          if (revRes.ok) {
            const revData = await revRes.json();
            if (!revData.error) setRevSummary(revData);
          }
        } catch { /* non-critical */ }

        // Fetch view stats separately — may fail for events with no views
        try {
          const viewsRes = await fetch(`/api/events/${id}/views`);
          if (viewsRes.ok) {
            const viewsData = await viewsRes.json();
            if (viewsData && !viewsData.error) setViewStats(viewsData);
          }
        } catch {
          // views endpoint failed — leave viewStats as null
        }

        // Check whether a settlement already exists for this event so the
        // header button can read "Open Settlement" vs. "Create Settlement".
        try {
          const setRes = await fetch(`/api/settlements?event_id=${id}`);
          if (setRes.ok) {
            const setData = await setRes.json();
            if (Array.isArray(setData) && setData.length > 0) {
              setSettlementId(setData[0].id);
              setSettlementStatus(setData[0].status ?? "draft");
            }
          }
        } catch {
          // settlements endpoint failed — leave button as "Create Settlement"
        }
      } catch {
        // ignore fetch errors
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [id]);

  const totalRevenue = orders.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
  const totalTickets = orders.reduce((s, o) => s + (Number(o.quantity) || 1), 0);

  const refreshRevSummary = async () => {
    try {
      const res = await fetch(`/api/events/${id}/revenue-summary`);
      if (res.ok) { const d = await res.json(); if (!d.error) setRevSummary(d); }
    } catch { /* ignore */ }
  };

  const handleBackfill = async () => {
    setBackfilling(true);
    try {
      const res = await fetch(`/api/events/${id}/revenue-summary/backfill`, { method: "POST" });
      const data = await res.json();
      if (res.ok) await refreshRevSummary();
      else alert(data.error || "Backfill failed");
    } catch { alert("Backfill failed"); }
    finally { setBackfilling(false); }
  };

  if (loading) {
    return (
      <div className="admin-form-page">
        <h1 className="admin-page-title">Event Sales</h1>
        <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading…</p>
      </div>
    );
  }

  const printOrderReceipt = async (o: Order) => {
    if (!event) return;
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
    const gold: [number, number, number] = [255, 255, 255];
    const dark: [number, number, number] = [11, 13, 29];
    const W = 215.9;

    doc.setFillColor(...dark);
    doc.rect(0, 0, W, 279, "F");

    // Header bar
    doc.setFillColor(...gold);
    doc.rect(0, 0, W, 22, "F");
    doc.setTextColor(...dark);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Order Receipt", 14, 10);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`VenueCore · ${new Date(o.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`, 14, 17);

    let y = 36;

    const sectionHeader = (title: string) => {
      doc.setTextColor(...gold);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(title, 14, y);
      y += 5;
      doc.setDrawColor(...gold);
      doc.setLineWidth(0.2);
      doc.line(14, y, 200, y);
      y += 5;
    };

    const row = (label: string, value: string, highlight = false) => {
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(160, 160, 160);
      doc.text(label, 14, y);
      if (highlight) {
        doc.setTextColor(...gold);
        doc.setFont("helvetica", "bold");
      } else {
        doc.setTextColor(255, 255, 255);
      }
      doc.text(value, 110, y);
      y += 7;
    };

    const safeDate = (d: string) => (d && d.length === 10 && d[4] === "-")
      ? new Date(d + "T12:00:00")
      : new Date(d.replace(/[+-]\d{2}:\d{2}$/, "").replace(/Z$/, ""));

    sectionHeader("EVENT");
    row("Event", event.title);
    row("Venue", event.venue);
    row("Date", safeDate(event.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }));

    y += 4;
    sectionHeader("CUSTOMER");
    row("Name", o.customer_name || "—");
    row("Email", o.customer_email || "—");
    if (o.customer_phone) row("Phone", o.customer_phone);

    y += 4;
    sectionHeader("ORDER DETAILS");
    row("Order ID", o.id.slice(0, 8).toUpperCase());
    row("Order Date", new Date(o.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }));
    row("Quantity", `${o.quantity || 1} ticket${(o.quantity || 1) !== 1 ? "s" : ""}`);
    if (o.promo_codes?.code) {
      const disc = o.promo_codes.discount_type === "percentage"
        ? `${Number(o.promo_codes.discount_value)}% off`
        : `$${Number(o.promo_codes.discount_value).toFixed(2)} off`;
      row("Promo Code", `${o.promo_codes.code} (${disc})`);
    }

    y += 4;
    doc.setDrawColor(...gold);
    doc.setLineWidth(0.4);
    doc.line(14, y, 200, y);
    y += 7;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...gold);
    doc.text("TOTAL PAID", 14, y);
    doc.text(`$${(o.total_amount || 0).toFixed(2)}`, 110, y);

    y += 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text("All sales are final. This receipt is your proof of purchase.", 14, y);

    doc.save(`Receipt-${o.id.slice(0, 8).toUpperCase()}.pdf`);
  };

  const exportOrdersPDF = async () => {
    if (!event) return;
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
    const gold: [number, number, number] = [255, 255, 255];
    const dark: [number, number, number] = [11, 13, 29];
    const W = 215.9;

    doc.setFillColor(...dark);
    doc.rect(0, 0, W, 279, "F");

    // Header
    doc.setFillColor(...gold);
    doc.rect(0, 0, W, 22, "F");
    doc.setTextColor(...dark);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(`${event.title} — Orders Report`, 14, 14);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`${event.venue}  ·  ${((d: string) => (d && d.length === 10 && d[4] === "-") ? new Date(d + "T12:00:00") : new Date(d.replace(/[+-]\d{2}:\d{2}$/, "").replace(/Z$/, "")))(event.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`, 14, 19);

    // Table header
    let y = 34;
    doc.setTextColor(...gold);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("Name", 14, y);
    doc.text("Email", 60, y);
    doc.text("Phone", 120, y);
    doc.text("Qty", 160, y);
    doc.text("Total", 175, y);
    y += 2;
    doc.setDrawColor(...gold);
    doc.setLineWidth(0.3);
    doc.line(14, y, 200, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    orders.forEach((o, i) => {
      if (y > 255) { doc.addPage(); doc.setFillColor(...dark); doc.rect(0, 0, W, 279, "F"); y = 20; }
      doc.setTextColor(255, 255, 255);
      doc.text((o.customer_name || "—").slice(0, 25), 14, y);
      doc.setFontSize(7);
      doc.text((o.customer_email || "—").slice(0, 35), 60, y);
      doc.setFontSize(9);
      doc.text(o.customer_phone || "—", 120, y);
      doc.text(String(o.quantity || 1), 160, y);
      doc.setTextColor(...gold);
      doc.text(`$${(o.total_amount || 0).toFixed(2)}`, 175, y);
      y += 6;
    });

    // Footer totals
    y += 4;
    doc.setDrawColor(...gold);
    doc.line(14, y, 200, y);
    y += 6;
    doc.setTextColor(...gold);
    doc.setFont("helvetica", "bold");
    doc.text(`Total Orders: ${orders.length}`, 14, y);
    doc.text(`Tickets Sold: ${totalTickets}`, 80, y);
    doc.text(`Gross Receipts: $${totalRevenue.toFixed(2)}`, 140, y);

    const dateStr = ((d: string) => (d && d.length === 10 && d[4] === "-") ? new Date(d + "T12:00:00") : new Date(d.replace(/[+-]\d{2}:\d{2}$/, "").replace(/Z$/, "")))(event.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).replace(/,/g, "").replace(/\s+/g, "_");
    doc.save(`${event.title.replace(/[^a-z0-9]/gi, "_")}-${dateStr}-Orders_Report.pdf`);
  };

  return (
    <div className="admin-form-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">
            {event?.title || "Event Sales"}
            {isClosedOut && (
              <span style={{
                marginLeft: 12,
                display: "inline-block",
                padding: "3px 9px",
                borderRadius: 4,
                background: "rgba(239,68,68,0.12)",
                border: "1px solid rgba(239,68,68,0.35)",
                color: "#f87171",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 1,
                textTransform: "uppercase",
                verticalAlign: "middle",
              }}>
                Closed Out
              </span>
            )}
          </h1>
          {event && (
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 14, margin: "4px 0 0" }}>
              {event.venue} · {((d: string) => (d && d.length === 10 && d[4] === "-") ? new Date(d + "T12:00:00") : new Date(d.replace(/[+-]\d{2}:\d{2}$/, "").replace(/Z$/, "")))(event.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          )}
          {isClosedOut && event?.closed_out_note && (
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, margin: "2px 0 0", fontStyle: "italic" }}>
              Note: {event.closed_out_note}
            </p>
          )}
        </div>
        <div className="admin-page-header-actions">
          <button
            className="admin-header-btn"
            style={{
              background: settlementId
                ? "rgba(255, 255, 255, 0.12)"
                : "rgba(255, 255, 255, 0.18)",
              borderColor: "rgba(255, 255, 255, 0.45)",
              color: "#ffffff",
              fontWeight: 700,
            }}
            onClick={handleSettlementClick}
            disabled={creatingSettlement}
            title={
              settlementId
                ? settlementStatus === "finalized"
                  ? "View finalized settlement (read-only)"
                  : "Open this event's settlement (draft)"
                : "Create a new settlement for this event using actual order data"
            }
          >
            {creatingSettlement
              ? "Creating…"
              : settlementId
              ? settlementStatus === "finalized"
                ? "View Settlement (Finalized)"
                : "Open Settlement (Draft)"
              : "+ Create Settlement"}
          </button>
          <button
            className="admin-header-btn"
            style={{
              background: "rgba(34,197,94,0.1)",
              borderColor: "rgba(34,197,94,0.35)",
              color: "#4ade80",
            }}
            onClick={() => { resetCompForm(); setCompOpen(true); }}
          >
            + Issue Comp Tickets
          </button>
          <button
            className="admin-header-btn"
            style={{
              background: isClosedOut ? "rgba(255, 255, 255, 0.1)" : "rgba(239,68,68,0.1)",
              borderColor: isClosedOut ? "rgba(255, 255, 255, 0.35)" : "rgba(239,68,68,0.35)",
              color: isClosedOut ? "#ffffff" : "#f87171",
            }}
            onClick={handleCloseOut}
            disabled={closingOut}
            title={
              isClosedOut
                ? "Reopen this show — puts it back on customer-facing pages."
                : "Close out this show — locks ticket sales and moves it to the public past-shows archive."
            }
          >
            {closingOut
              ? (isClosedOut ? "Reopening…" : "Closing…")
              : (isClosedOut ? "Reopen Show" : "Close Out Show")}
          </button>
          {orders.length > 0 && (
            <button className="admin-header-btn" onClick={() => setShowPreview(true)}>
              Print Orders Report
            </button>
          )}
          <Link href="/admin/orders" className="admin-sponsor-edit-btn">← Back to Sales</Link>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="dash-kpi-grid">
        <div className="dash-kpi-card">
          <span className="dash-kpi-label">Total Orders</span>
          <span className="dash-kpi-value">{orders.length}</span>
        </div>
        <div className="dash-kpi-card">
          <span className="dash-kpi-label">Tickets Sold</span>
          <span className="dash-kpi-value">{totalTickets}</span>
        </div>
        <div className="dash-kpi-card">
          <span className="dash-kpi-label">Total Revenue</span>
          <span className="dash-kpi-value">${totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="dash-kpi-card">
          <span className="dash-kpi-label">Avg. Order Value</span>
          <span className="dash-kpi-value">
            ${orders.length > 0 ? (totalRevenue / orders.length).toFixed(2) : "0.00"}
          </span>
        </div>
      </div>

      {/* ── Revenue Breakdown ── */}
      {revSummary && (
        <div className="portal-card" style={{ marginTop: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <h2 className="portal-card-title" style={{ margin: 0 }}>Revenue Breakdown</h2>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontStyle: "italic" }}>
                {revSummary.saleCount} sale{revSummary.saleCount !== 1 ? "s" : ""}
                {revSummary.refundCount > 0 && `, ${revSummary.refundCount} refund${revSummary.refundCount !== 1 ? "s" : ""}`}
                {orders.length > revSummary.saleCount + revSummary.refundCount && (
                  <span style={{ color: "#f59e0b" }}>
                    {" · "}{orders.length - revSummary.saleCount - revSummary.refundCount} order{orders.length - revSummary.saleCount - revSummary.refundCount !== 1 ? "s" : ""} not yet in ledger
                  </span>
                )}
              </span>
            </div>
            <button
              onClick={handleBackfill}
              disabled={backfilling}
              title="Recalculates all ledger entries with correct face value pricing"
              style={{
                padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)",
                color: "#fbbf24", cursor: backfilling ? "wait" : "pointer",
              }}
            >
              {backfilling ? "Recalculating…" : "Recalculate"}
            </button>
          </div>

          {/* Top row — the big four */}
          <div className="dash-kpi-grid" style={{ marginBottom: 12 }}>
            <div className="dash-kpi-card">
              <span className="dash-kpi-label">Ticket Revenue</span>
              <span className="dash-kpi-value">${revSummary.ticketRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 4, display: "block" }}>face value only</span>
            </div>
            <div className="dash-kpi-card">
              <span className="dash-kpi-label">Service Fees</span>
              <span className="dash-kpi-value">${revSummary.serviceFeesGross.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 4, display: "block" }}>ticketing fees collected</span>
            </div>
            <div className="dash-kpi-card">
              <span className="dash-kpi-label">Taxes Collected</span>
              <span className="dash-kpi-value">${revSummary.taxCollected.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 4, display: "block" }}>sales tax</span>
            </div>
            <div className="dash-kpi-card">
              <span className="dash-kpi-label">Processing Fees</span>
              <span className="dash-kpi-value" style={{ color: "#f87171" }}>
                −${revSummary.processingFees.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 4, display: "block" }}>Stripe {rateLabel()}</span>
            </div>
          </div>

          {/* Summary row */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr",
            gap: 12, padding: "14px 16px",
            background: "rgba(255, 255, 255, 0.05)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            borderRadius: 10,
          }}>
            <div>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1 }}>Gross Receipts</span>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#ffffff", marginTop: 4 }}>
                ${revSummary.grossRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </div>
              {revSummary.refundTotal > 0 && (
                <div style={{ fontSize: 11, color: "#f87171", marginTop: 2 }}>
                  −${revSummary.refundTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })} refunded
                </div>
              )}
            </div>
            <div>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1 }}>Net to Venue</span>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#22c55e", marginTop: 4 }}>
                ${revSummary.netToVenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>
                after fees &amp; processing
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Marketing Data ── */}
      {viewStats && typeof viewStats === "object" && typeof viewStats.total_views === "number" && (
        <div className="portal-card" style={{ marginTop: 20 }}>
          <h2 className="portal-card-title">Marketing Analytics</h2>
          <div className="dash-kpi-grid">
            <div className="dash-kpi-card">
              <span className="dash-kpi-label">Total Page Views</span>
              <span className="dash-kpi-value">{viewStats.total_views}</span>
            </div>
            <div className="dash-kpi-card">
              <span className="dash-kpi-label">Unique Visitors</span>
              <span className="dash-kpi-value">{viewStats.unique_views}</span>
            </div>
            <div className="dash-kpi-card">
              <span className="dash-kpi-label">Views → Purchase</span>
              <span className="dash-kpi-value">{viewStats.purchase_views}</span>
            </div>
            <div className="dash-kpi-card">
              <span className="dash-kpi-label">Views w/o Purchase</span>
              <span className="dash-kpi-value">{viewStats.views_without_purchase}</span>
            </div>
            <div className="dash-kpi-card">
              <span className="dash-kpi-label">Conversion Rate</span>
              <span className="dash-kpi-value">{viewStats.conversion_rate}%</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Orders Table ── */}
      <div style={{ marginTop: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h2 className="portal-card-title">
            Orders ({term ? `${visibleOrders.length} of ${orders.length}` : orders.length})
          </h2>
          {orders.length > 0 && (
            <div style={{ position: "relative", minWidth: 220 }}>
              <input
                type="text"
                className="admin-form-input"
                placeholder="Search name, email, or phone…"
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                autoComplete="off"
                style={{ paddingRight: 30 }}
              />
              {orderSearch && (
                <button
                  type="button"
                  onClick={() => setOrderSearch("")}
                  aria-label="Clear search"
                  style={{
                    position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", color: "rgba(255,255,255,0.5)",
                    cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 2,
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          )}
        </div>
        {orders.length === 0 ? (
          <p style={{ color: "rgba(255,255,255,0.4)" }}>No orders yet for this event.</p>
        ) : visibleOrders.length === 0 ? (
          <p style={{ color: "rgba(255,255,255,0.4)" }}>
            No orders matching &ldquo;{orderSearch.trim()}&rdquo;.
          </p>
        ) : (
          <div className="report-table-wrapper">
            <table className="dash-table report-table">
              <thead>
                <tr>
                  <SortHeader label="Buyer" sortKey="customer_name" activeKey={orderSort} dir={orderSortDir} onSort={toggleOrderSort} />
                  <th>Email</th>
                  <th>Phone</th>
                  <SortHeader label="Qty" sortKey="quantity" activeKey={orderSort} dir={orderSortDir} onSort={toggleOrderSort} />
                  <SortHeader label="Total" sortKey="total_amount" activeKey={orderSort} dir={orderSortDir} onSort={toggleOrderSort} />
                  <th>Promo</th>
                  <th>Source</th>
                  <SortHeader label="Date" sortKey="created_at" activeKey={orderSort} dir={orderSortDir} onSort={toggleOrderSort} />
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map((o) => (
                  <tr key={o.id}>
                    <td>{o.customer_name || "—"}</td>
                    <td>{o.customer_email || "—"}</td>
                    <td>{o.customer_phone || "—"}</td>
                    <td>{o.quantity || 1}</td>
                    <td>${(o.total_amount || 0).toFixed(2)}</td>
                    <td>
                      {o.promo_codes?.code ? (
                        <span style={{
                          display: "inline-block", padding: "2px 8px", borderRadius: 6,
                          fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
                          background: "rgba(168,85,247,0.12)",
                          border: "1px solid rgba(168,85,247,0.3)",
                          color: "#c084fc",
                        }}>
                          {o.promo_codes.code}
                          {o.promo_codes.discount_type === "percentage"
                            ? ` (${Number(o.promo_codes.discount_value)}%)`
                            : ` ($${Number(o.promo_codes.discount_value).toFixed(2)})`}
                        </span>
                      ) : (
                        <span style={{ color: "rgba(255,255,255,0.3)" }}>—</span>
                      )}
                    </td>
                    <td><SourceBadge source={o.source ?? null} /></td>
                    <td>
                      {new Date(o.created_at).toLocaleDateString("en-US", {
                        month: "short", day: "numeric", year: "numeric",
                        hour: "numeric", minute: "2-digit",
                      })}
                    </td>
                    <td style={{ whiteSpace: "nowrap", display: "flex", gap: 6, alignItems: "center" }}>
                      <button
                        onClick={() => printOrderReceipt(o)}
                        style={{
                          display: "inline-block",
                          padding: "4px 10px",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          background: "rgba(255,255,255,0.05)",
                          border: "1px solid rgba(255,255,255,0.12)",
                          color: "rgba(255,255,255,0.55)",
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Receipt
                      </button>
                      <Link
                        href={`/admin/orders/${id}/${o.id}`}
                        style={{
                          display: "inline-block",
                          padding: "4px 12px",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          background: "rgba(255, 255, 255, 0.08)",
                          border: "1px solid rgba(255, 255, 255, 0.2)",
                          color: "#ffffff",
                          textDecoration: "none",
                          whiteSpace: "nowrap",
                        }}
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid rgba(255, 255, 255, 0.2)" }}>
                  <td colSpan={3} style={{ fontWeight: 700, color: "#ffffff" }}>Gross Receipts</td>
                  <td style={{ fontWeight: 700, color: "#ffffff" }}>{totalTickets}</td>
                  <td style={{ fontWeight: 700, color: "#ffffff" }}>${totalRevenue.toFixed(2)}</td>
                  <td /><td /><td /><td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* PDF Preview Modal */}
      {showPreview && (
        <PDFPreviewModal
          title={`${event?.title || "Event"} — Orders Report`}
          rows={orders.map((o) => ({
            name: `${o.customer_name || "—"} · ${o.customer_email || "—"}`,
            quantity: o.quantity || 1,
          }))}
          onDownload={exportOrdersPDF}
          onClose={() => setShowPreview(false)}
        />
      )}

      {/* ── Issue Comp Tickets Modal ─────────────────────────────────────── */}
      {compOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => !compSaving && setCompOpen(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16, zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 480,
              background: "#131629",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 14,
              padding: 24,
            }}
          >
            <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800, color: "#fff" }}>
              Issue Comp Tickets
            </h2>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>
              Generates a $0 order with QR tickets and emails them to the recipient —
              same flow as any paid checkout. Tracked as <strong style={{ color: "#4ade80" }}>source = comp</strong>.
            </p>

            {compError && (
              <div className="admin-form-error" style={{ marginBottom: 14 }}>{compError}</div>
            )}
            {compSuccess && (
              <div className="admin-form-success" style={{ marginBottom: 14 }}>{compSuccess}</div>
            )}

            <div style={{ display: "grid", gap: 12 }}>
              <label className="admin-form-label">
                Full Name
                <input
                  type="text"
                  className="admin-form-input"
                  value={compName}
                  onChange={(e) => setCompName(e.target.value)}
                  placeholder="Jane Doe"
                  disabled={compSaving}
                />
              </label>
              <label className="admin-form-label">
                Email
                <input
                  type="email"
                  className="admin-form-input"
                  value={compEmail}
                  onChange={(e) => setCompEmail(e.target.value)}
                  placeholder="jane@example.com"
                  disabled={compSaving}
                />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
                <label className="admin-form-label">
                  Phone <span style={{ opacity: 0.5, fontSize: 11 }}>(optional)</span>
                  <input
                    type="tel"
                    className="admin-form-input"
                    value={compPhone}
                    onChange={(e) => setCompPhone(formatPhoneNumber(e.target.value))}
                    placeholder="(555) 123-4567"
                    disabled={compSaving}
                  />
                </label>
                <label className="admin-form-label">
                  Quantity
                  <input
                    type="number"
                    min="1"
                    max="50"
                    className="admin-form-input"
                    value={compQty}
                    onChange={(e) => setCompQty(e.target.value)}
                    disabled={compSaving}
                  />
                </label>
              </div>
              <label className="admin-form-label">
                Internal Note <span style={{ opacity: 0.5, fontSize: 11 }}>(optional)</span>
                <input
                  type="text"
                  className="admin-form-input"
                  value={compNote}
                  onChange={(e) => setCompNote(e.target.value)}
                  placeholder="e.g. Instagram giveaway winner"
                  disabled={compSaving}
                />
              </label>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>
              <button
                type="button"
                className="admin-sponsor-edit-btn"
                onClick={() => setCompOpen(false)}
                disabled={compSaving}
              >
                Close
              </button>
              <button
                type="button"
                className="admin-form-submit"
                style={{
                  background: "rgba(34,197,94,0.15)",
                  borderColor: "rgba(34,197,94,0.4)",
                  color: "#4ade80",
                  opacity: compSaving ? 0.6 : 1,
                }}
                onClick={submitComp}
                disabled={compSaving}
              >
                {compSaving ? "Issuing…" : "Issue & Email Tickets"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
