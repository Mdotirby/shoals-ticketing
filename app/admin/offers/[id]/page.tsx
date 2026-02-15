"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getCookie } from "@/lib/cookies";
import type { ArtistOffer } from "@/lib/types/offer";
import type { Venue } from "@/lib/types/venue";

export default function AdminOfferDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [offer, setOffer] = useState<ArtistOffer | null>(null);
  const [venue, setVenue] = useState<Venue | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const venueId = getCookie("venue-id");

    Promise.all([
      fetch(`/api/offers/${id}`).then((r) => r.json()),
      venueId
        ? fetch("/api/venues").then((r) => r.json()).then((vs: Venue[]) => vs.find((v) => v.id === venueId) || null)
        : Promise.resolve(null),
    ])
      .then(([offerData, venueData]) => {
        if (offerData.error) return;
        setOffer(offerData);
        setVenue(venueData);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const exportPDF = async () => {
    if (!offer) return;
    setExporting(true);

    try {
      const { default: jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
      const pc = venue?.primary_color || "#d0c290";
      const sc = venue?.secondary_color || "#0b0d1d";
      const hexToRgb = (hex: string) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return [r, g, b] as [number, number, number];
      };

      const pRgb = hexToRgb(pc);
      const sRgb = hexToRgb(sc);
      let y = 10;

      // Header bar
      doc.setFillColor(...sRgb);
      doc.rect(0, 0, 220, 28, "F");
      doc.setFillColor(...pRgb);
      doc.rect(0, 28, 220, 1, "F");

      // Venue info (right)
      doc.setTextColor(...pRgb);
      doc.setFontSize(16);
      doc.text(venue?.name || "Venue", 200, 12, { align: "right" });
      doc.setFontSize(10);
      doc.text(`Capacity: ${venue?.capacity || "—"}`, 200, 18, { align: "right" });
      if (venue?.address_street) {
        doc.text(`${venue.address_street}, ${venue.address_city || ""} ${venue.address_state || ""} ${venue.address_zip || ""}`, 200, 23, { align: "right" });
      }

      y = 34;
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(14);
      doc.text(`${offer.artist_name} — Offer Sheet`, 10, y);
      y += 8;

      // Agency & Artist section
      doc.setFontSize(9);
      const infoRows = [
        ["Agency", offer.agency || "—", "Agent", offer.agent_name || "—"],
        ["Phone", offer.agent_phone || "—", "Email", offer.agent_email || "—"],
        ["Date", offer.event_date ? new Date(offer.event_date).toLocaleDateString() : "—", "Day", offer.day_of_event || "—"],
        ["Shows", String(offer.num_shows || 1), "Length", offer.show_length || "—"],
        ["Time", offer.show_time || "—", "Billing", offer.billing || "—"],
      ];

      autoTable(doc, {
        startY: y,
        body: infoRows,
        theme: "plain",
        styles: { fontSize: 8, cellPadding: 1.5 },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 25 }, 2: { fontStyle: "bold", cellWidth: 25 } },
      });

      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

      // Deal section
      doc.setFontSize(10);
      doc.setTextColor(...pRgb);
      doc.text("Deal", 10, y);
      y += 4;

      const dealRows = [
        ["Guarantee", `$${(offer.guarantee || 0).toLocaleString()}`, "Deal Type", offer.deal_type || "—"],
        ["Backend %", offer.backend_percentage || "—", "Radius", `${offer.radius_distance || "—"} mi`],
        ["Deposit", `$${(offer.deposit_amount || 0).toLocaleString()}`, "Balance Due", offer.balance_due || "—"],
        ["Merch", offer.merch_split || "—", "Who Sells", offer.merch_seller || "—"],
        ["Comps", String(offer.comps || 0), "Production", offer.production_by || "—"],
      ];

      autoTable(doc, {
        startY: y,
        body: dealRows,
        theme: "grid",
        styles: { fontSize: 8, cellPadding: 1.5 },
        headStyles: { fillColor: sRgb },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 25 }, 2: { fontStyle: "bold", cellWidth: 25 } },
      });

      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

      // Ticket Scaling
      if (offer.ticket_scaling && offer.ticket_scaling.length > 0) {
        doc.setTextColor(...pRgb);
        doc.text("Ticket Scaling", 10, y);
        y += 4;

        autoTable(doc, {
          startY: y,
          head: [["Tier", "Seats", "Comps", "Kills", "Sellable", "Price", "Net", "Gross"]],
          body: offer.ticket_scaling.map((r) => [
            r.name, r.seats, r.comps, r.kills, r.sellable_cap,
            `$${r.price.toFixed(2)}`, `$${r.net_price.toFixed(2)}`,
            `$${(r.sellable_cap * r.price).toLocaleString()}`,
          ]),
          theme: "grid",
          styles: { fontSize: 8 },
          headStyles: { fillColor: sRgb, textColor: pRgb },
        });

        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
      }

      // Expenses
      doc.setTextColor(...pRgb);
      doc.text("Expenses", 10, y);
      y += 4;

      const expBody: string[][] = [];
      const fe = offer.fixed_expenses || [];
      const ve = offer.variable_expenses || [];
      const maxLen = Math.max(fe.length, ve.length);
      for (let i = 0; i < maxLen; i++) {
        expBody.push([
          fe[i]?.name || "", fe[i] ? `$${fe[i].amount.toFixed(2)}` : "",
          ve[i]?.name || "", ve[i] ? String(ve[i].rate) : "", ve[i] ? `$${ve[i].amount.toFixed(2)}` : "",
        ]);
      }
      expBody.push(["Fixed Total", `$${(offer.total_fixed || 0).toFixed(2)}`, "Variable Total", "", `$${(offer.total_variable || 0).toFixed(2)}`]);

      autoTable(doc, {
        startY: y,
        head: [["Fixed Expenses", "Est.", "Variable Expenses", "Rate", "$"]],
        body: expBody,
        theme: "grid",
        styles: { fontSize: 7 },
        headStyles: { fillColor: sRgb, textColor: pRgb },
      });

      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 2;
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      doc.text(`Total Expenses: $${(offer.total_expenses || 0).toLocaleString()}`, 10, y + 4);
      y += 10;

      // Potential at Sellout
      doc.setTextColor(...pRgb);
      doc.setFontSize(10);
      doc.text("Potential at Sellout", 10, y);
      y += 4;

      const pasRows = [
        ["Gross Potential", `$${(offer.gross_potential || 0).toLocaleString()}`],
        ["Adj. Gross", `$${(offer.adj_gross || 0).toLocaleString()}`],
        ["Tax", `$${((offer.adj_gross || 0) * (offer.tax_rate || 0)).toFixed(2)}`],
        ["Net Potential", `$${(offer.net_potential || 0).toLocaleString()}`],
        ["Total Expenses", `$${(offer.total_expenses || 0).toLocaleString()}`],
        ["Splitpoint", `$${(offer.splitpoint || 0).toLocaleString()}`],
        ["", ""],
        ["Guarantee", `$${(offer.guarantee || 0).toLocaleString()}`],
        ["Artist Backend", `$${(offer.artist_backend || 0).toLocaleString()}`],
        ["Pot. Walkout", `$${(offer.pot_walkout || 0).toLocaleString()}`],
      ];

      autoTable(doc, {
        startY: y,
        body: pasRows,
        theme: "plain",
        styles: { fontSize: 8 },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 40 } },
      });

      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(`Offer Good for ${offer.offer_valid_days || 14} days from ${new Date().toLocaleDateString()}`, 10, y);

      // Filename: ArtistName.EventDate.City,State.pdf
      const dateStr = offer.event_date ? new Date(offer.event_date).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }).replace(/\//g, ".") : "TBD";
      const city = venue?.address_city || "City";
      const state = venue?.address_state || "ST";
      const filename = `${offer.artist_name.replace(/\s+/g, "_")}.${dateStr}.${city},${state}.pdf`;

      doc.save(filename);
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-form-page">
        <h1 className="admin-page-title">Offer Detail</h1>
        <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading…</p>
      </div>
    );
  }

  if (!offer) {
    return (
      <div className="admin-form-page">
        <h1 className="admin-page-title">Offer Not Found</h1>
      </div>
    );
  }

  return (
    <div className="admin-form-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">{offer.artist_name}</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="report-export-btn report-export-pdf" onClick={exportPDF} disabled={exporting}>
            {exporting ? "Generating…" : "Export PDF"}
          </button>
          <button className="admin-sponsor-edit-btn" onClick={() => router.push("/admin/offers")}>
            Back to Booking
          </button>
        </div>
      </div>

      <div className="offer-detail-grid">
        <div className="offer-detail-section">
          <h3>Agency</h3>
          <p>{offer.agency || "—"} · {offer.agent_name || "—"}</p>
          <p>{offer.agent_phone || "—"} · {offer.agent_email || "—"}</p>
        </div>
        <div className="offer-detail-section">
          <h3>Event</h3>
          <p>{offer.event_date ? new Date(offer.event_date).toLocaleDateString() : "TBD"} · {offer.day_of_event || "—"}</p>
          <p>{offer.show_time || "—"} · {offer.billing || "—"}</p>
        </div>
        <div className="offer-detail-section">
          <h3>Deal</h3>
          <p>Guarantee: <strong>${(offer.guarantee || 0).toLocaleString()}</strong> ({offer.deal_type || "FLAT"})</p>
          <p>Backend: {offer.backend_percentage || "0"}%</p>
        </div>
        <div className="offer-detail-section">
          <h3>Financials</h3>
          <p>Gross: ${(offer.gross_potential || 0).toLocaleString()}</p>
          <p>Net: ${(offer.net_potential || 0).toLocaleString()}</p>
          <p>Expenses: ${(offer.total_expenses || 0).toLocaleString()}</p>
          <p>Splitpoint: <strong>${(offer.splitpoint || 0).toLocaleString()}</strong></p>
        </div>
      </div>

      <div className="offer-detail-section" style={{ marginTop: 20 }}>
        <span className={`admin-event-status ${offer.status === "draft" ? "status-draft" : "status-published"}`}>
          {offer.status}
        </span>
      </div>
    </div>
  );
}
