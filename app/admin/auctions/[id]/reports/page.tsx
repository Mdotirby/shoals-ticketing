"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import jsPDF from "jspdf";
import "jspdf-autotable";
import type { AuctionReportType } from "@/lib/types/auction";

const REPORT_TABS: { key: AuctionReportType; label: string }[] = [
  { key: "item_report", label: "Item Report" },
  { key: "all_bidders", label: "All Bidders" },
  { key: "winning_bidders", label: "Winning Bidders" },
  { key: "paid_by_cc", label: "Paid by CC" },
  { key: "gross_receipts", label: "Gross Receipts" },
];

type Column = { key: string; label: string };

function formatCell(key: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (key.includes("bid") || key.includes("price") || key.includes("amount") || key.includes("total") || key.includes("paid") || key.includes("fee") || key.includes("increment") || key.includes("reserve")) {
    if (typeof value === "number") return `$${value.toFixed(2)}`;
    if (typeof value === "string" && !isNaN(Number(value))) return `$${Number(value).toFixed(2)}`;
  }
  if (key.includes("timestamp") || key.includes("_at")) {
    return new Date(String(value)).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  }
  return String(value);
}

export default function AdminAuctionReportsPage() {
  const params = useParams();
  const auctionId = params.id as string;

  const [reportType, setReportType] = useState<AuctionReportType>("item_report");
  const [reportData, setReportData] = useState<{
    title: string;
    org_name: string;
    auction_name: string;
    auction_date: string;
    columns: Column[];
    rows: Record<string, unknown>[];
    summary?: Record<string, unknown>;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchReport = async (type: AuctionReportType) => {
    setLoading(true);
    setError("");
    setReportData(null);

    const res = await fetch(`/api/auctions/${auctionId}/reports?type=${type}`);
    if (!res.ok) {
      const d = await res.json();
      setError(d.error || "Failed to load report.");
      setLoading(false);
      return;
    }

    const data = await res.json();
    setReportData(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchReport(reportType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportType, auctionId]);

  const exportPDF = () => {
    if (!reportData) return;

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });

    // Header
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(reportData.title, 14, 18);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`${reportData.auction_name} — ${reportData.org_name}`, 14, 26);

    // Table
    const headers = reportData.columns.map((c) => c.label);
    const body = reportData.rows.map((row) =>
      reportData.columns.map((c) => formatCell(c.key, row[c.key]))
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (doc as any).autoTable({
      head: [headers],
      body,
      startY: 32,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [255, 255, 255], textColor: [11, 13, 29] },
    });

    // Summary if present (gross receipts)
    if (reportData.summary) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const finalY = (doc as any).lastAutoTable?.finalY || 180;
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Summary", 14, finalY + 10);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      if (reportData.summary.total_items !== undefined) {
        doc.text(`Total Items: ${reportData.summary.total_items}`, 14, finalY + 18);
      }
      if (reportData.summary.total_receipts !== undefined) {
        doc.text(
          `Total Receipts: $${Number(reportData.summary.total_receipts).toFixed(2)}`,
          14,
          finalY + 25
        );
      }
    }

    // Filename: orgname_auctiondate_reportname.pdf
    const dateStr = reportData.auction_date
      ? new Date(reportData.auction_date).toISOString().split("T")[0]
      : "undated";
    const orgSlug = reportData.org_name.toLowerCase().replace(/\s+/g, "-");
    const reportSlug = (reportData as Record<string, unknown>).report_type || reportType;
    const filename = `${orgSlug}_${dateStr}_${reportSlug}.pdf`;

    doc.save(filename);
  };

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">Auction Reports</h1>
        <button
          onClick={exportPDF}
          disabled={!reportData || reportData.rows.length === 0}
          className="admin-btn admin-btn-primary"
        >
          Export PDF
        </button>
      </div>

      {/* Report Tabs */}
      <div className="admin-tabs" style={{ marginBottom: 20 }}>
        {REPORT_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setReportType(tab.key)}
            className={`admin-tab ${reportType === tab.key ? "active" : ""}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && <div className="admin-error-banner">{error}</div>}

      {loading && <div className="admin-page-loading">Loading report…</div>}

      {reportData && !loading && (
        <>
          <h2 style={{ color: "#ffffff", fontSize: 18, marginBottom: 12 }}>
            {reportData.title}
          </h2>

          {reportData.rows.length === 0 ? (
            <p style={{ color: "rgba(255,255,255,0.5)" }}>No data for this report.</p>
          ) : (
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    {reportData.columns.map((col) => (
                      <th key={col.key}>{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reportData.rows.map((row, i) => (
                    <tr key={i}>
                      {reportData.columns.map((col) => (
                        <td key={col.key}>{formatCell(col.key, row[col.key])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Gross Receipts Summary */}
          {reportData.summary && (
            <div className="auction-report-summary">
              <h3>Summary</h3>
              <p>Total Items: {String(reportData.summary.total_items)}</p>
              <p>
                Total Receipts: $
                {Number(reportData.summary.total_receipts).toFixed(2)}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
