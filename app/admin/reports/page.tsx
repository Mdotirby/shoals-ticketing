"use client";

import { useEffect, useState } from "react";

type ReportType = "tickets" | "tiers" | "checkins";
type EventOption = { id: string; title: string };

const REPORT_TABS: { key: ReportType; label: string }[] = [
  { key: "tickets", label: "Ticket Audit" },
  { key: "tiers", label: "Tier Breakdown" },
  { key: "checkins", label: "Check-in Logs" },
];

// Column definitions per report type
const COLUMNS: Record<ReportType, { key: string; label: string }[]> = {
  tickets: [
    { key: "customer_name", label: "Name" },
    { key: "customer_email", label: "Email" },
    { key: "event_title", label: "Event" },
    { key: "venue", label: "Venue" },
    { key: "is_scanned", label: "Scanned" },
    { key: "purchased_at", label: "Purchased" },
  ],
  tiers: [
    { key: "event_title", label: "Event" },
    { key: "tier_name", label: "Tier" },
    { key: "price", label: "Price" },
    { key: "count", label: "Tickets Sold" },
    { key: "revenue", label: "Revenue" },
  ],
  checkins: [
    { key: "customer_name", label: "Name" },
    { key: "customer_email", label: "Email" },
    { key: "event_title", label: "Event" },
    { key: "venue", label: "Venue" },
    { key: "scanned_at", label: "Scanned At" },
  ],
};

function formatCell(key: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (key === "is_scanned") return value ? "✅ Yes" : "❌ No";
  if (key === "price" || key === "revenue") {
    return `$${Number(value).toFixed(2)}`;
  }
  if (key.includes("_at") || key === "purchased_at" || key === "event_date") {
    return new Date(String(value)).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return String(value);
}

export default function AdminReportsPage() {
  const [reportType, setReportType] = useState<ReportType>("tickets");
  const [eventId, setEventId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [events, setEvents] = useState<EventOption[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Fetch events for filter dropdown
  useEffect(() => {
    fetch("/api/events")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setEvents(data);
      })
      .catch(() => {});
  }, []);

  const fetchReport = async () => {
    setLoading(true);
    const params = new URLSearchParams({ type: reportType });
    if (eventId) params.set("event_id", eventId);
    if (startDate) params.set("start", startDate);
    if (endDate) params.set("end", endDate);

    try {
      const res = await fetch(`/api/admin/reports?${params}`);
      const data = await res.json();
      if (data.rows) setRows(data.rows);
      else setRows([]);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch on filter change
  useEffect(() => {
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportType, eventId, startDate, endDate]);

  // ── CSV Export ──
  const exportCSV = () => {
    const cols = COLUMNS[reportType];
    const header = cols.map((c) => c.label).join(",");
    const csvRows = rows.map((row) =>
      cols
        .map((c) => {
          const val = formatCell(c.key, row[c.key]);
          // Escape commas/quotes for CSV
          return `"${val.replace(/"/g, '""')}"`;
        })
        .join(",")
    );
    const csv = [header, ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${reportType}-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── PDF Export ──
  const exportPDF = async () => {
    setExporting(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;

      const doc = new jsPDF({ orientation: "landscape" });
      const cols = COLUMNS[reportType];

      const title =
        reportType === "tickets"
          ? "Ticket Audit Report"
          : reportType === "tiers"
          ? "Tier Sales Breakdown"
          : "Check-in Logs";

      doc.setFontSize(18);
      doc.text(title, 14, 20);

      doc.setFontSize(10);
      const filterText = [
        eventId
          ? `Event: ${events.find((e) => e.id === eventId)?.title || eventId}`
          : "All Events",
        startDate ? `From: ${startDate}` : "",
        endDate ? `To: ${endDate}` : "",
      ]
        .filter(Boolean)
        .join("  |  ");
      doc.text(filterText, 14, 28);

      const tableData = rows.map((row) =>
        cols.map((c) => formatCell(c.key, row[c.key]))
      );

      autoTable(doc, {
        startY: 34,
        head: [cols.map((c) => c.label)],
        body: tableData,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 30, 60] },
      });

      doc.save(
        `${reportType}-report-${new Date().toISOString().slice(0, 10)}.pdf`
      );
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setExporting(false);
    }
  };

  const cols = COLUMNS[reportType];

  return (
    <div className="admin-form-page">
      <h1 className="admin-page-title">Reports</h1>

      {/* ── Report Type Tabs ── */}
      <div className="report-tabs">
        {REPORT_TABS.map((tab) => (
          <button
            key={tab.key}
            className={`report-tab ${reportType === tab.key ? "active" : ""}`}
            onClick={() => setReportType(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="report-filters">
        <label className="report-filter-label">
          Event
          <select
            className="admin-form-input"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
          >
            <option value="">All Events</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title}
              </option>
            ))}
          </select>
        </label>

        <label className="report-filter-label">
          Start Date
          <input
            type="date"
            className="admin-form-input"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>

        <label className="report-filter-label">
          End Date
          <input
            type="date"
            className="admin-form-input"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </label>

        <div className="report-export-btns">
          <button
            className="report-export-btn"
            onClick={exportCSV}
            disabled={rows.length === 0}
          >
            📄 Export CSV
          </button>
          <button
            className="report-export-btn report-export-pdf"
            onClick={exportPDF}
            disabled={rows.length === 0 || exporting}
          >
            {exporting ? "Generating…" : "📑 Export PDF"}
          </button>
        </div>
      </div>

      {/* ── Results Table ── */}
      {loading && (
        <p className="dash-loading">Loading report…</p>
      )}

      {!loading && rows.length === 0 && (
        <p className="dash-empty">No data found for the selected filters.</p>
      )}

      {!loading && rows.length > 0 && (
        <div className="report-table-wrapper">
          <table className="dash-table report-table">
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {cols.map((c) => (
                    <td key={c.key}>{formatCell(c.key, row[c.key])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="report-row-count">{rows.length} row{rows.length !== 1 ? "s" : ""}</p>
        </div>
      )}
    </div>
  );
}
