/**
 * Offer PDF Generator — original multi-page full-width layout.
 * Each section gets its own full-width dark header bar.
 * Uses ensureSpace() for automatic page breaks.
 */
import type { TicketScalingRow, ExpenseItem, VariableExpenseItem } from "../types/offer";
import type { Venue } from "../types/venue";
import {
  addPdfHeader, drawFooter, ensureSpace,
  sanitize, formatTime12hr,
  MARGIN, PAGE_WIDTH, PAGE_HEIGHT, CONTENT_WIDTH, DARK, GOLD, MID_GRAY, LIGHT_GRAY,
  type Doc,
} from "./pdf-header";

export type OfferPdfData = {
  // Venue (event venue, not promoter)
  venue?: string;
  venue_address?: string;
  venue_contact?: string;
  venue_phone?: string;
  venue_capacity?: number;
  // Agency / Artist
  agency?: string;
  agent_name?: string;
  agent_phone?: string;
  agent_email?: string;
  artist_name?: string;
  event_date?: string;
  num_shows?: number;
  show_length?: string;
  show_time?: string;
  billing?: string;
  // Deal
  guarantee?: number;
  deal_type?: string;
  backend_percentage?: number;
  other_terms?: string;
  radius_distance?: string;
  radius_days_prior?: number;
  radius_days_after?: number;
  production_by?: string;
  deposit_amount?: number;
  deposit_pct?: number;
  deposit_due?: string;
  balance_due?: string;
  merch_split?: string;
  merch_seller?: string;
  comps?: number;
  artist_comps?: number;
  marketing_comps?: number;
  // Ticket scaling
  ticket_scaling?: TicketScalingRow[];
  // Expenses
  fixed_expenses?: ExpenseItem[];
  variable_expenses?: VariableExpenseItem[];
  total_fixed?: number;
  total_variable?: number;
  total_expenses?: number;
  // Revenue
  gross_potential?: number;
  adj_gross?: number;
  tax_rate?: number;
  tax_method?: "divisor" | "multiplier";
  net_potential?: number;
  splitpoint?: number;
  artist_backend?: number;
  // Offer validity
  offer_valid_days?: number;
};

export async function exportOfferPDF(data: OfferPdfData, venue: Venue | null): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: [PAGE_WIDTH, PAGE_HEIGHT], compress: true });

  const venueSlug = venue?.slug || "";
  const venueName = String(data.venue || venue?.name || "Venue");
  const venueAddr = String(
    data.venue_address || [venue?.address_street, venue?.address_city, venue?.address_state, venue?.address_zip]
      .filter(Boolean).join(", ") || ""
  );

  // ── HEADER (compact with buyer info LEFT, venue RIGHT) ──
  let y = await addPdfHeader(doc, {
    title: "Artist Offer",
    venueName,
    venueAddress: venueAddr,
    venueSlug,
    logoUrl: venue?.logo_url,
    compact: true,
    showTitle: false,
    showBuyerInfo: true,
    offerValidDays: data.offer_valid_days || 14,
    buyerInfo: {
      company: venue?.name || String(data.venue || ""),
      contact: venue?.contract_signatory || venue?.buyer_name || data.venue_contact || undefined,
      email: venue?.buyer_email || undefined,
      phone: venue?.buyer_phone || data.venue_phone || undefined,
      address: venue?.promoter_address || undefined,
    },
  });

  // ── Compact font constants for 1-page layout ──
  const S = 7;      // small text
  const M = 7.5;    // medium text
  const H = 8;      // section header text
  const RH = 3.8;   // row height
  const halfW = CONTENT_WIDTH / 2 - 4;
  const leftX = MARGIN + 2;
  const rightX = MARGIN + halfW + 8;

  /** Draw a compact section header bar */
  const secH = (title: string, yPos: number, width?: number): number => {
    const w = width ?? CONTENT_WIDTH;
    doc.setFillColor(...DARK);
    doc.rect(MARGIN, yPos, w, 5.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(H);
    doc.setTextColor(...GOLD);
    doc.text(title.toUpperCase(), MARGIN + 2, yPos + 3.8);
    doc.setTextColor(...DARK);
    return yPos + 9;
  };

  /** Draw compact label:value pair with text wrapping. Returns new Y. */
  const lv = (label: string, val: string, yPos: number, opts?: { x?: number; valX?: number; maxW?: number; color?: [number, number, number] }): number => {
    const x = opts?.x ?? leftX;
    const valXPos = opts?.valX ?? (x + 28);
    const maxW = opts?.maxW ?? 52;
    const lines: string[] = doc.splitTextToSize(val || "—", maxW);
    const neededHeight = Math.max(1, lines.length) * RH;
    yPos = ensureSpace(doc, neededHeight, yPos);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(S);
    doc.setTextColor(80, 80, 80);
    doc.text(`${label}:`, x, yPos);
    doc.setFont("helvetica", opts?.color ? "bold" : "normal");
    doc.setFontSize(M);
    doc.setTextColor(...(opts?.color || [0, 0, 0]));
    for (let i = 0; i < lines.length; i++) {
      doc.text(lines[i], valXPos, yPos + i * RH);
    }
    doc.setTextColor(0, 0, 0);
    return yPos + neededHeight;
  };

  // ════════════════════════════════════════════════════════
  //  VENUE + AGENCY/ARTIST — two columns
  // ════════════════════════════════════════════════════════
  y = ensureSpace(doc, 10, y);
  y = secH("Venue & Artist", y);
  const infoStartY = y;

  // Left column: Venue
  let ly = infoStartY;
  ly = lv("Venue", String(data.venue || "—"), ly);
  ly = lv("Address", String(data.venue_address || "—"), ly, { maxW: 50 });
  if (data.venue_contact) ly = lv("Contact", String(data.venue_contact), ly);
  if (data.venue_phone) ly = lv("Phone", String(data.venue_phone), ly);
  if (data.venue_capacity) ly = lv("Capacity", String(data.venue_capacity), ly);

  // Right column: Agency/Artist
  let ry = infoStartY;
  const rValX = rightX + 24;
  ry = lv("Artist", String(data.artist_name || "—"), ry, { x: rightX, valX: rValX, maxW: 50 });
  ry = lv("Agency", String(data.agency || "—"), ry, { x: rightX, valX: rValX, maxW: 50 });
  ry = lv("Agent", String(data.agent_name || "—"), ry, { x: rightX, valX: rValX, maxW: 50 });
  ry = lv("Phone", String(data.agent_phone || "—"), ry, { x: rightX, valX: rValX, maxW: 50 });
  ry = lv("Email", String(data.agent_email || "—"), ry, { x: rightX, valX: rValX, maxW: 50 });
  const dateStr = data.event_date
    ? new Date(String(data.event_date).slice(0, 10) + "T12:00:00").toLocaleDateString()
    : "TBD";
  ry = lv("Date", dateStr, ry, { x: rightX, valX: rValX, maxW: 50 });
  ry = lv("Shows", `${data.num_shows || 1} × ${data.show_length || "—"}`, ry, { x: rightX, valX: rValX, maxW: 50 });
  ry = lv("Show Time", formatTime12hr(String(data.show_time || "")) || "—", ry, { x: rightX, valX: rValX, maxW: 50 });
  ry = lv("Billing", String(data.billing || "—"), ry, { x: rightX, valX: rValX, maxW: 50 });

  y = Math.max(ly, ry) + 1;

  // ════════════════════════════════════════════════════════
  //  DEAL — two columns (left/right split)
  // ════════════════════════════════════════════════════════
  y = ensureSpace(doc, 10, y);
  y = secH("Deal", y);
  const dealStartY = y;

  // Left column
  let dlY = dealStartY;
  dlY = lv("Guarantee", `$${Number(data.guarantee || 0).toLocaleString()}`, dlY);
  dlY = lv("Deal Type", String(data.deal_type || "FLAT"), dlY);
  dlY = lv("Backend %", `${data.backend_percentage || 0}%`, dlY);
  dlY = lv("Radius", `${data.radius_distance || "—"}mi | ${data.radius_days_prior || "—"}d prior | ${data.radius_days_after || "—"}d after`, dlY, { maxW: 50 });
  dlY = lv("Production", String(data.production_by || "—"), dlY);
  dlY = lv("Other Terms", String(data.other_terms || "—"), dlY, { maxW: 50 });

  // Right column
  let drY = dealStartY;
  drY = lv("Deposit", `$${Number(data.deposit_amount || 0).toLocaleString()} (${data.deposit_pct || 0}%)`, drY, { x: rightX, valX: rValX, maxW: 50 });
  drY = lv("Dep. Due", String(data.deposit_due || "—"), drY, { x: rightX, valX: rValX, maxW: 50 });
  drY = lv("Bal. Due", String(data.balance_due || "Day of Show"), drY, { x: rightX, valX: rValX, maxW: 50 });
  drY = lv("Merch", String(data.merch_split || "—"), drY, { x: rightX, valX: rValX, maxW: 50 });
  drY = lv("Seller", String(data.merch_seller || "—"), drY, { x: rightX, valX: rValX, maxW: 50 });
  drY = lv("Comps", `${data.comps || 0} total | ${data.artist_comps || 0} artist | ${data.marketing_comps || 0} mktg`, drY, { x: rightX, valX: rValX, maxW: 50 });

  y = Math.max(dlY, drY) + 1;

  // ════════════════════════════════════════════════════════
  //  TICKET SCALING — compact table
  // ════════════════════════════════════════════════════════
  const scaling = (data.ticket_scaling || []) as TicketScalingRow[];
  if (scaling.length > 0) {
    y = ensureSpace(doc, 10, y);
    y = secH("Ticket Scaling", y);

    const tCols = [
      MARGIN + 2,    // Tier name
      MARGIN + 32,   // Seats
      MARGIN + 46,   // Comps
      MARGIN + 58,   // Kills
      MARGIN + 70,   // Sellable
      MARGIN + 86,   // Net Price
      MARGIN + 104,  // Fac. Fee
      MARGIN + 120,  // Tkt Fee
      MARGIN + 136,  // Price
      MARGIN + 154,  // Gross
    ];
    const tHeaders = ["Scaling", "Seats", "Comps", "Kills", "Sell", "Net $", "Fac.", "Tkt.", "Price", "Gross"];

    // Header row
    doc.setFillColor(...LIGHT_GRAY);
    doc.rect(MARGIN, y - 1.5, CONTENT_WIDTH, 4.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(80, 80, 80);
    tHeaders.forEach((h, i) => doc.text(h, tCols[i], y + 1.5));
    y += 5;

    // Data rows
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(0, 0, 0);
    const tierMaxW = tCols[1] - tCols[0] - 2;
    for (const r of scaling) {
      y = ensureSpace(doc, RH + 1, y);
      const facFee = r.facility_fee || 0;
      const tktFee = r.ticketing_fee || (r.price - (r.net_price || 0) - facFee);
      const tierName = doc.splitTextToSize(r.name, tierMaxW)[0] || r.name;
      const values = [
        tierName, String(r.seats), String(r.comps), String(r.kills), String(r.sellable_cap),
        `$${(r.net_price || 0).toFixed(2)}`, `$${facFee.toFixed(2)}`, `$${(tktFee > 0 ? tktFee : 0).toFixed(2)}`,
        `$${r.price?.toFixed(2)}`, `$${(r.sellable_cap * r.price).toLocaleString()}`
      ];
      values.forEach((v, i) => doc.text(v, tCols[i], y));
      y += RH;
    }
    y += 1;
  }

  // ════════════════════════════════════════════════════════
  //  EXPENSES — two columns (fixed left, variable right)
  // ════════════════════════════════════════════════════════
  y = ensureSpace(doc, 10, y);
  y = secH("Expenses", y);
  const fe = (data.fixed_expenses || []) as ExpenseItem[];
  const ve = (data.variable_expenses || []) as VariableExpenseItem[];

  const expStartY = y;

  // ── Fixed Expenses (left column) ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(80, 80, 80);
  doc.text("FIXED", leftX, y);
  doc.text("Est.", leftX + 60, y);
  let fixY = y + RH;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(0, 0, 0);
  for (const e of fe) {
    if (e.amount > 0) {
      fixY = ensureSpace(doc, RH + 1, fixY);
      const name = doc.splitTextToSize(e.name, 56)[0] || e.name;
      doc.text(name, leftX, fixY);
      doc.text(`$${e.amount.toLocaleString()}`, leftX + 60, fixY);
      fixY += RH;
    }
  }
  fixY += 0.5;
  doc.setFont("helvetica", "bold");
  doc.text("Fixed Total", leftX, fixY);
  doc.text(`$${Number(data.total_fixed || 0).toLocaleString()}`, leftX + 60, fixY);
  fixY += RH;

  // ── Variable Expenses (right column) ──
  let varY = expStartY;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(80, 80, 80);
  doc.text("VARIABLE", rightX, varY);
  doc.text("Rate", rightX + 48, varY);
  doc.text("$", rightX + 64, varY);
  varY += RH;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(0, 0, 0);
  for (const e of ve) {
    if (e.amount > 0) {
      varY = ensureSpace(doc, RH + 1, varY);
      const name = doc.splitTextToSize(e.name, 44)[0] || e.name;
      doc.text(name, rightX, varY);
      doc.text(`${(e.rate * 100).toFixed(2)}%`, rightX + 48, varY);
      doc.text(`$${e.amount.toLocaleString()}`, rightX + 64, varY);
      varY += RH;
    }
  }
  varY += 0.5;
  doc.setFont("helvetica", "bold");
  doc.text("Variable Total", rightX, varY);
  doc.text(`$${Number(data.total_variable || 0).toLocaleString()}`, rightX + 64, varY);
  varY += RH;

  y = Math.max(fixY, varY) + 1;

  // Total expenses highlight bar
  doc.setFillColor(...GOLD);
  doc.rect(MARGIN, y - 0.5, CONTENT_WIDTH, 5.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...DARK);
  doc.text(`Total Expenses:  $${Number(data.total_expenses || 0).toLocaleString()}`, MARGIN + 3, y + 3);
  y += 7.5;

  // ════════════════════════════════════════════════════════
  //  REVENUE BREAKDOWN + POTENTIAL AT SELLOUT — side by side
  // ════════════════════════════════════════════════════════
  y = ensureSpace(doc, 10, y);
  const revStartY = y;

  // ── Left: Revenue Breakdown ──
  const secHLeft = (title: string, yPos: number): number => {
    doc.setFillColor(...DARK);
    doc.rect(MARGIN, yPos, halfW + 2, 5.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(H);
    doc.setTextColor(...GOLD);
    doc.text(title.toUpperCase(), MARGIN + 2, yPos + 3.8);
    doc.setTextColor(...DARK);
    return yPos + 9;
  };
  const secHRight = (title: string, yPos: number): number => {
    doc.setFillColor(...DARK);
    doc.rect(rightX - 4, yPos, halfW + 5, 5.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(H);
    doc.setTextColor(...GOLD);
    doc.text(title.toUpperCase(), rightX - 2, yPos + 3.8);
    doc.setTextColor(...DARK);
    return yPos + 9;
  };

  let revY = secHLeft("Revenue Breakdown", revStartY);
  const totalSellable = scaling.reduce((s: number, r: TicketScalingRow) => s + (r.sellable_cap || 0), 0);
  const pdfFacilityFee = scaling.length > 0 ? (scaling[0] as TicketScalingRow).facility_fee || 0 : 0;
  const pdfTicketingFee = scaling.length > 0 ? ((scaling[0] as TicketScalingRow).ticketing_fee || ((scaling[0] as TicketScalingRow).price - (scaling[0] as TicketScalingRow).net_price - pdfFacilityFee)) : 0;
  const totalFacilityFeeRevenue = totalSellable * pdfFacilityFee;
  const totalTicketingFeeRevenue = totalSellable * pdfTicketingFee;

  revY = lv("Fac. Fee/Tkt", `$${pdfFacilityFee.toFixed(2)}`, revY);
  revY = lv("Total Fac. Rev", `$${totalFacilityFeeRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, revY);
  revY = lv("Tkt Fee/Tkt", `$${pdfTicketingFee.toFixed(2)}`, revY);
  revY = lv("Total Tkt Rev", `$${totalTicketingFeeRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, revY);
  revY = lv("Combined Rev", `$${(totalFacilityFeeRevenue + totalTicketingFeeRevenue).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, revY);

  // ── Right: Potential at Sellout ──
  // Compute gross & adj gross from tier data so the PDF is always correct
  const grossPotential = scaling.length > 0
    ? scaling.reduce((sum: number, t: TicketScalingRow) => sum + (t.sellable_cap * t.price), 0)
    : Number(data.gross_potential || 0);
  const adjGross = scaling.length > 0
    ? scaling.reduce((sum: number, t: TicketScalingRow) => sum + (t.sellable_cap * (t.net_price || 0)), 0)
    : Number(data.adj_gross || 0);
  const rawTaxRate = Number(data.tax_rate || 0);
  // Normalize: if stored as percentage (e.g. 9.5), convert to decimal (0.095)
  const taxRateDecimal = rawTaxRate > 1 ? rawTaxRate / 100 : rawTaxRate;
  const taxMethod = data.tax_method || "divisor";
  let netPotential: number;
  let taxAmount: number;
  if (taxMethod === "divisor") {
    netPotential = adjGross / (1 + taxRateDecimal);
    taxAmount = adjGross - netPotential;
  } else {
    taxAmount = adjGross * taxRateDecimal;
    netPotential = adjGross - taxAmount;
  }
  // Round to 2 decimal places
  netPotential = Math.round(netPotential * 100) / 100;
  taxAmount = Math.round(taxAmount * 100) / 100;

  let potY = secHRight("Potential at Sellout", revStartY);
  potY = lv("Gross Pot.", `$${grossPotential.toLocaleString()}`, potY, { x: rightX, valX: rValX, maxW: 50 });
  potY = lv("Adj. Gross", `$${adjGross.toLocaleString()}`, potY, { x: rightX, valX: rValX, maxW: 50 });
  const taxPct = taxRateDecimal * 100;
  potY = lv(`Tax (${taxPct.toFixed(1)}% ${taxMethod})`, `$${taxAmount.toFixed(2)}`, potY, { x: rightX, valX: rValX, maxW: 50 });
  potY = lv("Net Pot.", `$${netPotential.toLocaleString()}`, potY, { x: rightX, valX: rValX, maxW: 50 });
  potY = lv("Expenses", `$${Number(data.total_expenses || 0).toLocaleString()}`, potY, { x: rightX, valX: rValX, maxW: 50 });
  if (data.deal_type !== "FLAT") {
    potY = lv("Splitpoint", `$${Number(data.splitpoint || 0).toLocaleString()}`, potY, { x: rightX, valX: rValX, maxW: 50 });
  }

  y = Math.max(revY, potY) + 1;

  // ════════════════════════════════════════════════════════
  //  ARTIST POTENTIAL AT SELLOUT — compact
  // ════════════════════════════════════════════════════════
  y = ensureSpace(doc, 10, y);
  y = secH("Artist Potential at Sellout", y);

  const guarantee = Number(data.guarantee || 0);
  const splitpoint = Number(data.splitpoint || 0);
  const backendPct = Number(data.backend_percentage || 0) / 100;
  const dealType = String(data.deal_type || "FLAT").toUpperCase();

  // Draw inline: Guarantee + Backend + Artist Total on one or two lines
  doc.setFont("helvetica", "normal");
  doc.setFontSize(M);
  doc.setTextColor(0, 0, 0);

  let artistTotal = guarantee;
  let backendAmt = 0;
  let backendLabel = "";

  if (dealType === "VS") {
    artistTotal = splitpoint * backendPct;
    backendAmt = Math.max(artistTotal - guarantee, 0);
    backendLabel = "Backend (VS)";
  } else if (dealType === "PLUS") {
    backendAmt = splitpoint * backendPct;
    artistTotal = guarantee + backendAmt;
    backendLabel = "Backend (PLUS)";
  }

  y = lv("Guarantee", `$${guarantee.toLocaleString()}`, y);
  if (backendLabel) {
    y = lv(backendLabel, `$${backendAmt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, y);
  }
  // Gold highlight for artist total
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, MARGIN + CONTENT_WIDTH, y);
  y += 3;
  y = lv("ARTIST TOTAL", `$${artistTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, y, { color: GOLD });
  y += 2;

  drawFooter(doc, "Artist Offer");

  // Save
  const fileDateStr = data.event_date
    ? new Date(String(data.event_date).slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }).replace(/\//g, ".")
    : "TBD";
  const city = venue?.address_city || "City";
  const state = venue?.address_state || "ST";
  doc.save(`${sanitize(String(data.artist_name || "Offer"))}.${fileDateStr}.${city},${state}.pdf`);
}
