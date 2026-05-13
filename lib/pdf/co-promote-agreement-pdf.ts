/**
 * Co-Promote Agreement PDF Generator.
 *
 * Legal-style document for a contract between us (as Promoter/Buyer going
 * into a third-party venue's space) and the Venue Partner that provides
 * the room and takes a cut of revenue.
 */
import {
  addPdfHeader, drawFooter, loadVenueCoreFavicon, ensureSpace, drawClause,
  drawParagraph, fmt,
  MARGIN, PAGE_WIDTH, PAGE_HEIGHT, CONTENT_WIDTH, DARK, GOLD, MID_GRAY, LIGHT_GRAY,
  type Doc,
} from "./pdf-header";
import {
  type CoPromoteAgreement,
  type CoPromoteDealStructure,
  DEAL_STRUCTURE_LABELS,
  SETTLEMENT_TIMING_LABELS,
} from "@/lib/types/co-promote";

// ─── Deal clause text templates ──────────────────────────────────────────────
function dealClauseText(a: CoPromoteAgreement): string {
  const buyerPct = Number(a.buyer_percentage ?? 0).toFixed(2);
  const venuePct = Number(a.venue_percentage ?? 0).toFixed(2);
  const rent = fmt(a.flat_rent_amount || 0);

  const exclusions: string[] = [];
  if (!a.include_ticketing_fees) exclusions.push("ticketing fees");
  if (!a.include_facility_fees) exclusions.push("facility fees");
  if (!a.include_comps) exclusions.push("complimentary tickets");
  const exclusionText = exclusions.length > 0
    ? ` Excluded from the revenue base: ${exclusions.join(", ")}.`
    : "";

  switch (a.deal_structure) {
    case "rev_share_gross":
      return (
        `Promoter and Venue shall split gross ticket revenue at ${buyerPct}% to Promoter and ` +
        `${venuePct}% to Venue. The revenue base is calculated before any deductions for sales tax ` +
        `or show expenses.${exclusionText}`
      );
    case "rev_share_after_tax":
      return (
        `Promoter and Venue shall split gross ticket revenue at ${buyerPct}% to Promoter and ` +
        `${venuePct}% to Venue, calculated AFTER the deduction of all applicable fees, sales and ` +
        `use taxes and BEFORE any deduction for show expenses (artist guarantee, production, ` +
        `marketing, etc.). Promoter shall be solely responsible for all show expenses out of ` +
        `its ${buyerPct}% share.${exclusionText}`
      );
    case "rev_share_net":
      return (
        `Promoter and Venue shall split NET revenue at ${buyerPct}% to Promoter and ${venuePct}% ` +
        `to Venue. Net revenue is defined as gross ticket revenue minus sales taxes, all ` +
        `documented show expenses (artist guarantee, production, marketing), and any ` +
        `mutually-approved third-party costs.${exclusionText}`
      );
    case "flat_rent":
      return (
        `Promoter shall pay Venue a flat rental fee of ${rent} for the use of the premises on ` +
        `the Event Date. Promoter retains 100% of ticket revenue and bears 100% of show ` +
        `expenses. No revenue share applies to this agreement.`
      );
    case "rent_plus_rev_share":
      return (
        `Promoter shall pay Venue a flat rental fee of ${rent} AND an additional revenue ` +
        `share of ${venuePct}% of gross ticket revenue after sales tax. Promoter retains the ` +
        `remaining ${buyerPct}% and bears all show expenses.${exclusionText}`
      );
    default:
      return "";
  }
}

// ─── Example settlement illustration ──────────────────────────────────────────
function buildSettlementExample(a: CoPromoteAgreement): {
  rows: Array<{ label: string; amount: string }>;
  heading: string;
} {
  const capacity = a.expected_capacity || 200;
  const avgPrice = 20; // illustrative
  const exampleGross = capacity * avgPrice;
  const taxRate = 0.0975; // illustrative 9.75%
  const tax = exampleGross * taxRate;
  const afterTax = exampleGross - tax;

  const buyerPct = Number(a.buyer_percentage ?? 0) / 100;
  const venuePct = Number(a.venue_percentage ?? 0) / 100;
  const rent = a.flat_rent_amount || 0;

  let base = afterTax;
  if (a.deal_structure === "rev_share_gross") base = exampleGross;
  if (a.deal_structure === "rev_share_net") base = afterTax; // nominal for illustration

  const rows: Array<{ label: string; amount: string }> = [];
  rows.push({ label: `Gross Revenue (${capacity} tickets @ ${fmt(avgPrice)})`, amount: fmt(exampleGross) });

  if (a.deal_structure !== "rev_share_gross" && a.deal_structure !== "flat_rent") {
    rows.push({ label: `Sales Tax (${(taxRate * 100).toFixed(1)}%)`, amount: `(${fmt(tax)})` });
    rows.push({ label: "Revenue Splitpoint", amount: fmt(base) });
  }

  if (a.deal_structure === "flat_rent") {
    rows.push({ label: `Venue Rental Fee (flat)`, amount: fmt(rent) });
    rows.push({ label: `Promoter keeps`, amount: fmt(exampleGross - rent) });
  } else if (a.deal_structure === "rent_plus_rev_share") {
    const venueRev = base * venuePct;
    rows.push({ label: `Venue Rental Fee (flat)`, amount: fmt(rent) });
    rows.push({ label: `+ Venue Rev Share (${(venuePct * 100).toFixed(0)}%)`, amount: fmt(venueRev) });
    rows.push({ label: `= Venue Total`, amount: fmt(rent + venueRev) });
    rows.push({ label: `Promoter Gross (before expenses)`, amount: fmt(base - venueRev - rent) });
  } else {
    const venueRev = base * venuePct;
    const buyerRev = base * buyerPct;
    rows.push({ label: `Venue (${(venuePct * 100).toFixed(0)}%)`, amount: fmt(venueRev) });
    rows.push({ label: `Promoter (${(buyerPct * 100).toFixed(0)}%)`, amount: fmt(buyerRev) });
  }

  return {
    heading: `Illustrative Settlement (at ${capacity} tickets sold)`,
    rows,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  CO-PROMOTE AGREEMENT PDF EXPORT
// ═════════════════════════════════════════════════════════════════════════════
export async function exportCoPromoteAgreementPDF(
  data: CoPromoteAgreement,
  ourVenueName?: string,
  ourVenueAddress?: string,
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: [PAGE_WIDTH, PAGE_HEIGHT], compress: true });
  const vcIcon = await loadVenueCoreFavicon();

  // ── HEADER ──
  let y = await addPdfHeader(doc, {
    title: "Co-Promotion Agreement",
    venueName: ourVenueName || data.buyer_company_name,
    venueAddress: ourVenueAddress,
    compact: true,
    showBuyerInfo: true,
    buyerInfo: {
      contact: data.partner_contact_name || "",
      company: data.partner_venue_name,
      phone: data.partner_phone || undefined,
      email: data.partner_email || undefined,
    },
  });

  // ── META ROW ──
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MID_GRAY);
  doc.text(
    `Agreement #: ${data.agreement_number}  |  Date: ${data.agreement_date}`,
    MARGIN, y
  );
  y += 6;

  // ── PREAMBLE ──
  y = drawParagraph(
    doc,
    `This Co-Promotion Agreement ("Agreement") is entered into as of ${data.agreement_date} ` +
    `by and between the following parties:`,
    y,
    { fontSize: 9 }
  );
  y += 4;

  const partyLabelW = 30;
  const partyValMaxW = CONTENT_WIDTH - partyLabelW - 6;

  // ── PROMOTER PARTY ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...DARK);
  y = ensureSpace(doc, 7, y);
  doc.text("PROMOTER:", MARGIN + 3, y);
  doc.setFont("helvetica", "normal");
  doc.text(
    doc.splitTextToSize(data.buyer_company_name, partyValMaxW)[0] || data.buyer_company_name,
    MARGIN + partyLabelW, y
  );
  y += 5;
  if (data.buyer_signatory_name) {
    const signLine = data.buyer_signatory_title
      ? `${data.buyer_signatory_name}, ${data.buyer_signatory_title}`
      : data.buyer_signatory_name;
    doc.text(doc.splitTextToSize(signLine, partyValMaxW)[0] || signLine, MARGIN + partyLabelW, y);
    y += 5;
  }
  if (data.buyer_address) {
    doc.text(doc.splitTextToSize(data.buyer_address, partyValMaxW)[0] || data.buyer_address, MARGIN + partyLabelW, y);
    y += 5;
  }
  if (data.buyer_email) {
    doc.text(`Email: ${data.buyer_email}`, MARGIN + partyLabelW, y);
    y += 5;
  }
  if (data.buyer_phone) {
    doc.text(`Phone: ${data.buyer_phone}`, MARGIN + partyLabelW, y);
    y += 5;
  }
  y += 3;

  // ── VENUE PARTY ──
  doc.setFont("helvetica", "bold");
  y = ensureSpace(doc, 7, y);
  doc.text("VENUE:", MARGIN + 3, y);
  doc.setFont("helvetica", "normal");
  doc.text(
    doc.splitTextToSize(data.partner_venue_name, partyValMaxW)[0] || data.partner_venue_name,
    MARGIN + partyLabelW, y
  );
  y += 5;
  if (data.partner_contact_name) {
    const contactLine = data.partner_contact_title
      ? `${data.partner_contact_name}, ${data.partner_contact_title}`
      : data.partner_contact_name;
    doc.text(doc.splitTextToSize(contactLine, partyValMaxW)[0] || contactLine, MARGIN + partyLabelW, y);
    y += 5;
  }
  if (data.partner_venue_address) {
    doc.text(doc.splitTextToSize(data.partner_venue_address, partyValMaxW)[0] || data.partner_venue_address, MARGIN + partyLabelW, y);
    y += 5;
  }
  if (data.partner_email) {
    doc.text(`Email: ${data.partner_email}`, MARGIN + partyLabelW, y);
    y += 5;
  }
  if (data.partner_phone) {
    doc.text(`Phone: ${data.partner_phone}`, MARGIN + partyLabelW, y);
    y += 5;
  }
  y += 6;

  // ═══════════════════════════════════════════════════════════════════════════
  // NUMBERED CLAUSES
  // ═══════════════════════════════════════════════════════════════════════════
  let clauseNum = 1;

  // §1 EVENT
  const eventTimes = [
    data.event_load_in_time && `Load-in ${data.event_load_in_time}`,
    data.event_doors_time && `Doors ${data.event_doors_time}`,
    data.event_show_time && `Show ${data.event_show_time}`,
    data.event_curfew && `Curfew ${data.event_curfew}`,
  ].filter(Boolean).join(" · ");

  y = drawClause(
    doc, clauseNum++, "Event",
    `The Parties agree to jointly promote the following event (the "Event") at Venue's premises:\n` +
    `Event Name: ${data.event_name || "TBD"}\n` +
    `Event Date: ${data.event_date}\n` +
    (eventTimes ? `Schedule: ${eventTimes}\n` : "") +
    (data.expected_capacity ? `Expected Capacity: ${data.expected_capacity}` : ""),
    y
  );

  // §2 REVENUE SPLIT
  y = drawClause(
    doc, clauseNum++,
    `Revenue Split — ${DEAL_STRUCTURE_LABELS[data.deal_structure as CoPromoteDealStructure]}`,
    dealClauseText(data),
    y
  );

  // §3 ILLUSTRATIVE SETTLEMENT TABLE
  y = ensureSpace(doc, 40, y);
  const example = buildSettlementExample(data);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.text(`§${clauseNum}  ${example.heading}`, MARGIN + 3, y);
  clauseNum++;
  y += 7;

  const tableX = MARGIN;
  const tableW = CONTENT_WIDTH;
  const amtX = tableX + tableW - 3;
  for (let i = 0; i < example.rows.length; i++) {
    y = ensureSpace(doc, 7, y);
    if (i % 2 === 0) {
      doc.setFillColor(249, 249, 246);
      doc.rect(tableX, y - 1, tableW, 7, "F");
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...DARK);
    const row = example.rows[i];
    doc.text(doc.splitTextToSize(row.label, tableW - 50)[0] || row.label, tableX + 3, y + 4);
    doc.text(row.amount, amtX, y + 4, { align: "right" });
    y += 7;
  }
  y += 4;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(...MID_GRAY);
  y = drawParagraph(
    doc,
    `Example uses an assumed avg ticket price of $30 and 9% tax for illustration only; actual ` +
    `settlement uses the real Event numbers.`,
    y,
    { fontSize: 8, indent: 3 }
  );
  y += 2;

  // §4 DEPOSIT (if any)
  if (data.deposit_amount && data.deposit_amount > 0) {
    const dueDate = data.deposit_due_date ? ` (due ${data.deposit_due_date})` : "";
    y = drawClause(
      doc, clauseNum++, "Deposit",
      `Promoter shall pay Venue a deposit of ${fmt(data.deposit_amount)}${dueDate}. The deposit ` +
      `will be applied against Venue's final settlement amount.`,
      y
    );
  }

  // §5 VENUE-PROVIDED SERVICES
  const services: string[] = [];
  if (data.venue_provides_staff) services.push("front-of-house staff");
  if (data.venue_provides_sound) services.push("sound system and engineer");
  if (data.venue_provides_lights) services.push("lighting");
  if (data.venue_provides_security) services.push("security personnel");
  if (data.venue_provides_bar) services.push("bar operations");

  if (services.length > 0) {
    y = drawClause(
      doc, clauseNum++, "Venue-Provided Services",
      `The Venue shall provide, at its own cost unless otherwise noted, the following services ` +
      `for the Event: ${services.join(", ")}.`,
      y
    );
  }

  // §6 ANCILLARY REVENUE (bar, merch)
  const ancillary: string[] = [];
  if (data.venue_bar_revenue_split) {
    ancillary.push(`Bar revenue: ${data.venue_bar_revenue_split}.`);
  } else if (data.venue_provides_bar) {
    ancillary.push(`Bar revenue shall be retained 100% by Venue.`);
  }
  if (data.venue_merch_fee_pct && data.venue_merch_fee_pct > 0) {
    ancillary.push(
      `Merchandise: Venue shall receive ${Number(data.venue_merch_fee_pct).toFixed(2)}% of artist ` +
      `merchandise gross sales sold on premises.`
    );
  }
  if (ancillary.length > 0) {
    y = drawClause(doc, clauseNum++, "Ancillary Revenue", ancillary.join(" "), y);
  }

  // §7 SETTLEMENT
  y = drawClause(
    doc, clauseNum++, "Settlement",
    `Final settlement between the Parties shall occur ${SETTLEMENT_TIMING_LABELS[data.settlement_timing].toLowerCase()} ` +
    `following the Event. Promoter shall provide Venue a full settlement statement including ` +
    `total tickets sold, gross revenue, applicable taxes, and the Venue's share.`,
    y
  );

  // §8 CANCELLATION / FORCE MAJEURE
  if (data.cancellation_policy) {
    y = drawClause(doc, clauseNum++, "Cancellation", data.cancellation_policy, y);
  }
  if (data.force_majeure_clause) {
    y = drawClause(doc, clauseNum++, "Force Majeure", data.force_majeure_clause, y);
  }

  // §9 MARKETING & RADIUS
  if (data.marketing_rights) {
    y = drawClause(doc, clauseNum++, "Marketing Rights", data.marketing_rights, y);
  }
  if (data.radius_clause) {
    y = drawClause(doc, clauseNum++, "Radius Clause", data.radius_clause, y);
  }

  // §10 CUSTOM CLAUSES
  if (Array.isArray(data.custom_clauses)) {
    for (const c of data.custom_clauses) {
      if (c.title && c.body) {
        y = drawClause(doc, clauseNum++, c.title, c.body, y);
      }
    }
  }

  // §11 ADDITIONAL TERMS
  if (data.additional_terms) {
    y = drawClause(doc, clauseNum++, "Additional Terms", data.additional_terms, y);
  }

  // ── SIGNATURE BLOCKS ──
  y = ensureSpace(doc, 45, y);
  y += 4;
  doc.setDrawColor(...DARK);
  doc.setLineWidth(0.3);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.text("SIGNATURES", MARGIN + 3, y);
  y += 8;

  const sigColW = (CONTENT_WIDTH - 10) / 2;
  const sigYStart = y;

  // Promoter sig
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.line(MARGIN + 3, y + 10, MARGIN + 3 + sigColW - 3, y + 10);
  doc.setTextColor(...MID_GRAY);
  doc.setFontSize(8);
  doc.text("Promoter Signature / Date", MARGIN + 3, y + 14);
  doc.setFontSize(9);
  doc.setTextColor(...DARK);
  doc.text(data.buyer_signatory_name || data.buyer_company_name, MARGIN + 3, y + 20);

  // Venue sig
  const col2X = MARGIN + sigColW + 10;
  doc.line(col2X, y + 10, col2X + sigColW - 3, y + 10);
  doc.setTextColor(...MID_GRAY);
  doc.setFontSize(8);
  doc.text("Venue Signature / Date", col2X, y + 14);
  doc.setFontSize(9);
  doc.setTextColor(...DARK);
  doc.text(data.partner_contact_name || data.partner_venue_name, col2X, y + 20);

  y = sigYStart + 24;

  // ── FOOTER ──
  drawFooter(doc, "Co-Promotion Agreement", { vcIconDataUrl: vcIcon ?? undefined });

  const filename = `CoPromote-${data.agreement_number}.pdf`;
  doc.save(filename);
}
