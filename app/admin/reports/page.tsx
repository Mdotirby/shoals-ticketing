"use client";

import { useEffect, useState, useCallback } from "react";

// ── Types ────────────────────────────────────────────────────────────
type EventOption = { id: string; title: string; venue_id?: string };
type VenueOption = { id: string; name: string };

type ReportCardType = "ticket-audit" | "monthly-revenue" | "expenses" | "orders";

type ReportCardConfig = {
  key: ReportCardType;
  title: string;
  description: string;
  icon: string;
  filters: ("event" | "venue" | "dateRange")[];
  hasPDF: boolean;
};

const REPORT_CARDS: ReportCardConfig[] = [
  {
    key: "ticket-audit",
    title: "Ticket Audit Report",
    description:
      "Per-event ticket inventory and revenue breakdown by tier. Includes capacity, percent of house, fees, and tax. No customer data.",
    icon: "",
    filters: ["event", "venue", "dateRange"],
    hasPDF: true,
  },
  {
    key: "monthly-revenue",
    title: "Monthly Revenue Report",
    description:
      "Cross-event revenue summary with profit split calculations, ticketing rebates, and facility fee splits per the management agreement.",
    icon: "",
    filters: ["venue", "dateRange"],
    hasPDF: false,
  },
  {
    key: "expenses",
    title: "Expense Report",
    description:
      "Operational expenses grouped by event or category. Includes settlement expenses and vendor costs.",
    icon: "",
    filters: ["event", "venue", "dateRange"],
    hasPDF: false,
  },
  {
    key: "orders",
    title: "Orders Report",
    description:
      "Per-event order detail with customer data, quantities, and revenue. Full order history export.",
    icon: "",
    filters: ["event", "venue", "dateRange"],
    hasPDF: false,
  },
];

// ── Formatters ───────────────────────────────────────────────────────
function fmt(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

// ── Main Component ───────────────────────────────────────────────────
export default function AdminReportsPage() {
  const [events, setEvents] = useState<EventOption[]>([]);
  const [venues, setVenues] = useState<VenueOption[]>([]);

  // Per-card state
  const [cardState, setCardState] = useState<
    Record<
      ReportCardType,
      {
        eventId: string;
        venueId: string;
        from: string;
        to: string;
        loading: boolean;
        exporting: string | null; // "csv" | "pdf" | null
        data: unknown;
        error: string | null;
      }
    >
  >({
    "ticket-audit": initCardState(),
    "monthly-revenue": initCardState(),
    expenses: initCardState(),
    orders: initCardState(),
  });

  // Load events + venues on mount
  useEffect(() => {
    fetch("/api/events")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setEvents(data);
      })
      .catch(() => {});

    fetch("/api/events")
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data)) return;
        // Extract unique venues
        const vMap = new Map<string, string>();
        for (const ev of data) {
          if (ev.venue_id && ev.venue) vMap.set(ev.venue_id, ev.venue);
        }
        setVenues(Array.from(vMap.entries()).map(([id, name]) => ({ id, name })));
      })
      .catch(() => {});
  }, []);

  const updateCard = useCallback(
    (key: ReportCardType, patch: Partial<(typeof cardState)[ReportCardType]>) => {
      setCardState((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
    },
    []
  );

  // ── Generate report ────────────────────────────────────────────
  const generateReport = useCallback(
    async (key: ReportCardType) => {
      const card = cardState[key];
      updateCard(key, { loading: true, error: null, data: null });

      const params = new URLSearchParams();
      if (card.eventId) params.set("event_id", card.eventId);
      if (card.venueId) params.set("venue_id", card.venueId);
      if (card.from) params.set("from", card.from);
      if (card.to) params.set("to", card.to);

      try {
        const res = await fetch(`/api/admin/reports/${key}?${params}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        updateCard(key, { data, loading: false });
      } catch (err) {
        updateCard(key, {
          error: err instanceof Error ? err.message : "Failed to load report",
          loading: false,
        });
      }
    },
    [cardState, updateCard]
  );

  // ── Export CSV ─────────────────────────────────────────────────
  const exportCSV = useCallback(
    async (key: ReportCardType) => {
      const card = cardState[key];
      updateCard(key, { exporting: "csv" });

      const params = new URLSearchParams({ format: "csv" });
      if (card.eventId) params.set("event_id", card.eventId);
      if (card.venueId) params.set("venue_id", card.venueId);
      if (card.from) params.set("from", card.from);
      if (card.to) params.set("to", card.to);

      try {
        const res = await fetch(`/api/admin/reports/${key}?${params}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${key}-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } catch {
        // silent
      } finally {
        updateCard(key, { exporting: null });
      }
    },
    [cardState, updateCard]
  );

  // ── Export PDF (ticket audit only for now) ─────────────────────
  const exportPDF = useCallback(
    async (key: ReportCardType) => {
      const card = cardState[key];
      updateCard(key, { exporting: "pdf" });

      try {
        // Ensure we have data
        let reportData = card.data;
        if (!reportData) {
          const params = new URLSearchParams();
          if (card.eventId) params.set("event_id", card.eventId);
          if (card.venueId) params.set("venue_id", card.venueId);
          if (card.from) params.set("from", card.from);
          if (card.to) params.set("to", card.to);

          const res = await fetch(`/api/admin/reports/${key}?${params}`);
          reportData = await res.json();
        }

        if (key === "ticket-audit") {
          const { generateTicketAuditPDF } = await import("@/lib/pdf/ticket-audit-pdf");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const buffer = await generateTicketAuditPDF(reportData as any);
          const blob = new Blob([buffer], { type: "application/pdf" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `ticket-audit-${new Date().toISOString().slice(0, 10)}.pdf`;
          a.click();
          URL.revokeObjectURL(url);
        }
      } catch (err) {
        console.error("PDF export failed:", err);
      } finally {
        updateCard(key, { exporting: null });
      }
    },
    [cardState, updateCard]
  );

  return (
    <div className="admin-form-page">
      <h1 className="admin-page-title">Reports</h1>
      <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: 24, fontSize: 14 }}>
        Generate, preview, and export financial reports. Select filters and click Generate.
      </p>

      <div className="report-cards-grid">
        {REPORT_CARDS.map((config) => {
          const state = cardState[config.key];
          return (
            <div key={config.key} className="report-card">
              {/* Card Header */}
              <div className="report-card-header">
                <span className="report-card-icon">{config.icon}</span>
                <div>
                  <h2 className="report-card-title">{config.title}</h2>
                  <p className="report-card-desc">{config.description}</p>
                </div>
              </div>

              {/* Filters */}
              <div className="report-card-filters">
                {config.filters.includes("event") && (
                  <label className="report-card-filter-label">
                    <span>Event</span>
                    <select
                      className="admin-form-input"
                      value={state.eventId}
                      onChange={(e) => updateCard(config.key, { eventId: e.target.value })}
                    >
                      <option value="">All Events</option>
                      {events.map((ev) => (
                        <option key={ev.id} value={ev.id}>
                          {ev.title}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {config.filters.includes("venue") && (
                  <label className="report-card-filter-label">
                    <span>Venue</span>
                    <select
                      className="admin-form-input"
                      value={state.venueId}
                      onChange={(e) => updateCard(config.key, { venueId: e.target.value })}
                    >
                      <option value="">All Venues</option>
                      {venues.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {config.filters.includes("dateRange") && (
                  <>
                    <label className="report-card-filter-label">
                      <span>From</span>
                      <input
                        type="date"
                        className="admin-form-input"
                        value={state.from}
                        onChange={(e) => updateCard(config.key, { from: e.target.value })}
                      />
                    </label>
                    <label className="report-card-filter-label">
                      <span>To</span>
                      <input
                        type="date"
                        className="admin-form-input"
                        value={state.to}
                        onChange={(e) => updateCard(config.key, { to: e.target.value })}
                      />
                    </label>
                  </>
                )}
              </div>

              {/* Action buttons */}
              <div className="report-card-actions">
                <button
                  className="report-card-btn report-card-btn-generate"
                  onClick={() => generateReport(config.key)}
                  disabled={state.loading}
                >
                  {state.loading ? "Generating…" : "Generate Report"}
                </button>
                <button
                  className="report-card-btn report-card-btn-csv"
                  onClick={() => exportCSV(config.key)}
                  disabled={!!state.exporting}
                >
                  {state.exporting === "csv" ? "Exporting…" : "Export CSV"}
                </button>
                {config.hasPDF && (
                  <button
                    className="report-card-btn report-card-btn-pdf"
                    onClick={() => exportPDF(config.key)}
                    disabled={!!state.exporting}
                  >
                    {state.exporting === "pdf" ? "Exporting…" : "Export PDF"}
                  </button>
                )}
              </div>

              {/* Error */}
              {state.error && (
                <div className="report-card-error">{state.error}</div>
              )}

              {/* Preview data table */}
              {state.data != null ? (
                <div className="report-card-preview">
                  <ReportPreview reportKey={config.key} data={state.data} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Helper ───────────────────────────────────────────────────────────
function initCardState() {
  return {
    eventId: "",
    venueId: "",
    from: "",
    to: "",
    loading: false,
    exporting: null as string | null,
    data: null as unknown,
    error: null as string | null,
  };
}

// ── Preview Tables ───────────────────────────────────────────────────
function ReportPreview({ reportKey, data }: { reportKey: ReportCardType; data: unknown }) {
  switch (reportKey) {
    case "ticket-audit":
      return <TicketAuditPreview data={data} />;
    case "monthly-revenue":
      return <MonthlyRevenuePreview data={data} />;
    case "expenses":
      return <ExpensePreview data={data} />;
    case "orders":
      return <OrdersPreview data={data} />;
    default:
      return null;
  }
}

// ── Ticket Audit Preview ─────────────────────────────────────────────
function TicketAuditPreview({ data }: { data: unknown }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any;
  if (!d?.events?.length) {
    return <p className="report-card-empty">No data found for the selected filters.</p>;
  }

  return (
    <div className="report-table-wrapper">
      <table className="report-table">
        <thead>
          <tr>
            <th>Tier</th>
            <th>Capacity</th>
            <th>Sold</th>
            <th>Comps</th>
            <th>% House</th>
            <th>Price</th>
            <th>Gross</th>
            <th>Ticketing</th>
            <th>Facility</th>
            <th>Tax</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {d.events.map((ev: any, ei: number) => (
            <>
              <tr key={`ev-${ei}`} className="report-table-event-row">
                <td colSpan={11}>
                  {ev.event_title}
                  {ev.event_date && (
                    <span className="report-table-event-date">
                      {" "}
                      — {new Date(ev.event_date).toLocaleDateString()}
                    </span>
                  )}
                </td>
              </tr>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {ev.tiers.map((t: any, ti: number) => (
                <tr key={`t-${ei}-${ti}`}>
                  <td>{t.tier_name}</td>
                  <td>{t.capacity}</td>
                  <td>{t.qty_sold}</td>
                  <td>{t.comps ?? 0}</td>
                  <td>{pct(t.pct_house)}</td>
                  <td>{fmt(t.price)}</td>
                  <td>{fmt(t.gross_sales)}</td>
                  <td>{fmt(t.ticketing_fees)}</td>
                  <td>{fmt(t.facility_fees)}</td>
                  <td>{fmt(t.tax_collected)}</td>
                  <td>{fmt(t.total_revenue)}</td>
                </tr>
              ))}
              <tr key={`sub-${ei}`} className="report-table-subtotal-row">
                <td>Subtotal</td>
                <td>{ev.subtotal.capacity}</td>
                <td>{ev.subtotal.qty_sold}</td>
                <td>{ev.subtotal.comps ?? 0}</td>
                <td>{pct(ev.subtotal.pct_house)}</td>
                <td></td>
                <td>{fmt(ev.subtotal.gross_sales)}</td>
                <td>{fmt(ev.subtotal.ticketing_fees)}</td>
                <td>{fmt(ev.subtotal.facility_fees)}</td>
                <td>{fmt(ev.subtotal.tax_collected)}</td>
                <td>{fmt(ev.subtotal.total_revenue)}</td>
              </tr>
            </>
          ))}
          <tr className="report-table-grand-row">
            <td>Grand Total</td>
            <td>{d.grand_total.capacity}</td>
            <td>{d.grand_total.qty_sold}</td>
            <td>{d.grand_total.comps ?? 0}</td>
            <td>{pct(d.grand_total.pct_house)}</td>
            <td></td>
            <td>{fmt(d.grand_total.gross_sales)}</td>
            <td>{fmt(d.grand_total.ticketing_fees)}</td>
            <td>{fmt(d.grand_total.facility_fees)}</td>
            <td>{fmt(d.grand_total.tax_collected)}</td>
            <td>{fmt(d.grand_total.total_revenue)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ── Monthly Revenue Preview ──────────────────────────────────────────
function MonthlyRevenuePreview({ data }: { data: unknown }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any;
  if (!d?.revenue_streams) {
    return <p className="report-card-empty">No data found.</p>;
  }

  return (
    <div className="report-revenue-preview">
      {/* Revenue streams */}
      <div className="report-mini-section">
        <h4>Revenue Streams</h4>
        <div className="report-kv-grid">
          <span>Ticket Revenue</span><span>{fmt(d.revenue_streams.ticket_revenue)}</span>
          <span>Ticketing Fees</span><span>{fmt(d.revenue_streams.ticketing_fees)}</span>
          <span>Facility Fees</span><span>{fmt(d.revenue_streams.facility_fees)}</span>
          <span>Tax Collected</span><span>{fmt(d.revenue_streams.tax_collected)}</span>
          <span className="report-kv-bold">Gross Revenue</span>
          <span className="report-kv-bold">{fmt(d.revenue_streams.gross_revenue)}</span>
        </div>
      </div>

      {/* Expenses */}
      <div className="report-mini-section">
        <h4>Expenses</h4>
        <div className="report-kv-grid">
          {d.expenses.by_category &&
            Object.entries(d.expenses.by_category).map(([cat, amt]) => (
              <>
                <span key={`${cat}-l`}>{cat}</span>
                <span key={`${cat}-v`}>{fmt(Number(amt))}</span>
              </>
            ))}
          <span className="report-kv-bold">Total Expenses</span>
          <span className="report-kv-bold">{fmt(d.expenses.total)}</span>
        </div>
      </div>

      {/* Profit & Share */}
      <div className="report-mini-section">
        <h4>Profit & Revenue Share</h4>
        <div className="report-kv-grid">
          <span>Net Profit</span><span>{fmt(d.profit.net_profit)}</span>
          <span>Profit Tier</span><span>{d.profit.profit_tier}</span>
          <span>Ownership Guarantee</span><span>{fmt(d.revenue_share.ownership_guarantee)}</span>
          <span>Management Share</span><span>{fmt(d.revenue_share.management_share)}</span>
          <span>Ownership Share</span><span>{fmt(d.revenue_share.ownership_share)}</span>
        </div>
      </div>

      {/* Totals */}
      <div className="report-mini-section report-mini-totals">
        <div className="report-kv-grid">
          <span className="report-kv-bold">Total to Management</span>
          <span className="report-kv-gold">{fmt(d.totals.total_to_management)}</span>
          <span className="report-kv-bold">Total to Ownership</span>
          <span className="report-kv-gold">{fmt(d.totals.total_to_ownership)}</span>
        </div>
      </div>

      {/* Event breakdown table */}
      {d.event_breakdown?.length > 0 && (
        <div className="report-table-wrapper" style={{ marginTop: 16 }}>
          <table className="report-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Date</th>
                <th>Type</th>
                <th>Ticket Rev</th>
                <th>Ticketing</th>
                <th>Facility</th>
                <th>Tax</th>
                <th>Gross</th>
              </tr>
            </thead>
            <tbody>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {d.event_breakdown.map((ev: any, i: number) => (
                <tr key={i}>
                  <td>{ev.event_title}</td>
                  <td>{ev.event_date ? new Date(ev.event_date).toLocaleDateString() : ""}</td>
                  <td>{ev.event_type}</td>
                  <td>{fmt(ev.ticket_revenue)}</td>
                  <td>{fmt(ev.ticketing_fees)}</td>
                  <td>{fmt(ev.facility_fees)}</td>
                  <td>{fmt(ev.tax_collected)}</td>
                  <td>{fmt(ev.gross)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Expense Preview ──────────────────────────────────────────────────
function ExpensePreview({ data }: { data: unknown }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any;
  if (!d?.rows?.length) {
    return <p className="report-card-empty">No expenses found.</p>;
  }

  return (
    <>
      {/* Category summary */}
      <div className="report-mini-section">
        <h4>By Category</h4>
        <div className="report-kv-grid">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {d.by_category?.map((c: any) => (
            <>
              <span key={`${c.category}-l`}>{c.category}</span>
              <span key={`${c.category}-v`}>{fmt(c.total)}</span>
            </>
          ))}
          <span className="report-kv-bold">Grand Total</span>
          <span className="report-kv-gold">{fmt(d.grand_total)}</span>
        </div>
      </div>

      {/* Detail table */}
      <div className="report-table-wrapper" style={{ marginTop: 12 }}>
        <table className="report-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Category</th>
              <th>Description</th>
              <th>Event</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {d.rows.slice(0, 50).map((r: any, i: number) => (
              <tr key={i}>
                <td>{r.expense_date}</td>
                <td>{r.category}</td>
                <td>{r.description}</td>
                <td>{r.event_title}</td>
                <td>{fmt(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {d.rows.length > 50 && (
          <p className="report-card-truncated">
            Showing 50 of {d.rows.length} rows. Export CSV for full data.
          </p>
        )}
      </div>
    </>
  );
}

// ── Orders Preview ───────────────────────────────────────────────────
function OrdersPreview({ data }: { data: unknown }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any;
  if (!d?.rows?.length) {
    return <p className="report-card-empty">No orders found.</p>;
  }

  return (
    <>
      {/* Summary */}
      <div className="report-mini-section">
        <div className="report-kv-grid">
          <span>Total Orders</span><span>{d.summary.total_orders}</span>
          <span>Total Tickets</span><span>{d.summary.total_tickets}</span>
          <span className="report-kv-bold">Total Revenue</span>
          <span className="report-kv-gold">{fmt(d.summary.total_revenue)}</span>
        </div>
      </div>

      {/* Orders table */}
      <div className="report-table-wrapper" style={{ marginTop: 12 }}>
        <table className="report-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Event</th>
              <th>Qty</th>
              <th>Amount</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {d.rows.slice(0, 50).map((r: any, i: number) => (
              <tr key={i}>
                <td>{r.customer_name}</td>
                <td>{r.customer_email}</td>
                <td>{r.event_title}</td>
                <td>{r.quantity}</td>
                <td>{fmt(r.total_amount)}</td>
                <td>{r.created_at?.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {d.rows.length > 50 && (
          <p className="report-card-truncated">
            Showing 50 of {d.rows.length} rows. Export CSV for full data.
          </p>
        )}
      </div>
    </>
  );
}
