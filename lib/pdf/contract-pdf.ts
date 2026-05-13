import type { Contract } from "../types/contract";
import type { ArtistOffer } from "../types/offer";
import type { Venue } from "../types/venue";
import {
  addPdfHeader, drawFooter, loadVenueCoreFavicon, ensureSpace, drawSectionHeader, drawLabelValue,
  drawDivider, drawParagraph, drawClause, fmt, sanitize, formatTime12hr,
  MARGIN, PAGE_WIDTH, PAGE_HEIGHT, CONTENT_WIDTH, DARK, GOLD, WHITE, MID_GRAY, LIGHT_GRAY,
  type Doc,
} from "./pdf-header";

// ── Helpers ──────────────────────────────────────────────────────────

function venueFullAddress(v: Venue): string {
  return [v.address_street, v.address_city, v.address_state, v.address_zip]
    .filter(Boolean)
    .join(", ");
}

// ═════════════════════════════════════════════════════════════════════
//  CONTRACT PDF EXPORT
// ═════════════════════════════════════════════════════════════════════
export async function exportContractPDF(
  contract: Contract,
  offer: ArtistOffer,
  venue: Venue
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: [PAGE_WIDTH, PAGE_HEIGHT], compress: true });
  const vcIcon = await loadVenueCoreFavicon();

  const artistName = offer.artist_name ?? "Artist";
  const eventDate = offer.event_date ?? new Date().toLocaleDateString();
  const eventVenueName = offer.venue ?? venue.name;
  const eventVenueAddr = offer.venue_address ?? venueFullAddress(venue);

  // ── Buyer / Promoter info — from venue's buyer fields (same as offer PDF) ──
  const buyerCompany = venue.name;
  const buyerContact = venue.contract_signatory || venue.buyer_name || undefined;
  const buyerAddr = venue.promoter_address ?? venueFullAddress(venue);
  const buyerFormatted = buyerContact
    ? `${buyerContact} c/o ${buyerCompany}`
    : buyerCompany;

  // ── HEADER ──
  let y = await addPdfHeader(doc, {
    title: "Performance Agreement",
    venueName: venue.name,
    venueAddress: venueFullAddress(venue),
    venueSlug: venue.slug,
    logoUrl: venue.logo_url,
    compact: true,
    showBuyerInfo: true,
    buyerInfo: {
      company: buyerCompany,
      contact: buyerContact,
      email: venue.buyer_email || undefined,
      phone: venue.buyer_phone || undefined,
      address: buyerAddr,
    },
  });

  // ── Parties ──
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...DARK);
  y = drawParagraph(doc, `This Performance Agreement ("Agreement") is entered into by and between:`, y);
  y += 2;
  y = drawParagraph(doc, `BUYER / PROMOTER: ${buyerFormatted}, ${buyerAddr}`, y, { bold: true, indent: 5 });
  y += 2;
  y = drawParagraph(doc, `ARTIST / PERFORMER: ${artistName}${offer.agency ? `, c/o ${offer.agency}` : ""}${offer.agent_name ? ` (Agent: ${offer.agent_name})` : ""}`, y, { bold: true, indent: 5 });
  y += 5;

  // ── ENGAGEMENT DETAILS ──
  y = drawSectionHeader(doc, "Engagement Details", y);
  y = drawLabelValue(doc, "Event Date", eventDate, y);
  y = drawLabelValue(doc, "Venue", `${eventVenueName}${eventVenueAddr ? `, ${eventVenueAddr}` : ""}`, y);
  if (offer.show_time) y = drawLabelValue(doc, "Show Time", formatTime12hr(offer.show_time), y);
  if (offer.billing) y = drawLabelValue(doc, "Billing", offer.billing, y);
  if (offer.num_shows) y = drawLabelValue(doc, "Number of Shows", String(offer.num_shows), y);
  if (offer.show_length) y = drawLabelValue(doc, "Set Length", offer.show_length, y);
  if (offer.day_of_event) y = drawLabelValue(doc, "Day of Event", offer.day_of_event, y);
  y += 3;

  // Show lineup
  if (offer.show_lineup?.length) {
    y = ensureSpace(doc, 8 + offer.show_lineup.length * 6, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Show Lineup:", MARGIN + 3, y + 4);
    y += 7;
    doc.setFont("helvetica", "normal");
    for (const item of offer.show_lineup) {
      y = ensureSpace(doc, 6, y);
      doc.text(`${formatTime12hr(item.time)} — ${item.artist} (${item.set_length})`, MARGIN + 8, y + 4);
      y += 6;
    }
    y += 3;
  }

  // ── COMPENSATION ──
  y = drawSectionHeader(doc, "Compensation", y);
  y = drawLabelValue(doc, "Guarantee", fmt(contract.guarantee ?? offer.guarantee), y);
  y = drawLabelValue(doc, "Deal Type", contract.deal_type ?? offer.deal_type ?? "—", y);
  if (contract.backend_percentage || offer.backend_percentage) {
    y = drawLabelValue(doc, "Backend %", `${contract.backend_percentage ?? offer.backend_percentage}%`, y);
  }
  if (contract.bonus_structure) {
    y = drawLabelValue(doc, "Bonus", contract.bonus_structure, y);
  }
  if (offer.other_terms) {
    y = drawLabelValue(doc, "Other Terms", offer.other_terms, y);
  }
  y += 3;

  // ── TICKET SCALING ──
  if (offer.ticket_scaling?.length) {
    y = drawSectionHeader(doc, "Ticket Scaling", y);
    const cols = ["Tier", "Seats", "Comps", "Kills", "Sellable", "Net Price", "Tkt Fee", "Fac. Fee", "Price"];
    const colX = [MARGIN + 3, MARGIN + 30, MARGIN + 44, MARGIN + 58, MARGIN + 74, MARGIN + 96, MARGIN + 118, MARGIN + 140, MARGIN + CONTENT_WIDTH - 3];

    y = ensureSpace(doc, 8, y);
    doc.setFillColor(...LIGHT_GRAY);
    doc.rect(MARGIN, y, CONTENT_WIDTH, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...DARK);
    cols.forEach((c, i) => {
      doc.text(c, colX[i], y + 5, i >= 1 ? { align: "right" } : undefined);
    });
    y += 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    const tierNameMaxW = colX[1] - colX[0] - 3; // max width before next column
    for (const r of offer.ticket_scaling) {
      y = ensureSpace(doc, 6, y);
      const ticketingFee = r.price - (r.net_price || 0) - (r.facility_fee || 0);
      const tierName: string = doc.splitTextToSize(r.name, tierNameMaxW)[0] || r.name;
      doc.text(tierName, colX[0], y + 4);
      doc.text(String(r.seats), colX[1], y + 4, { align: "right" });
      doc.text(String(r.comps), colX[2], y + 4, { align: "right" });
      doc.text(String(r.kills), colX[3], y + 4, { align: "right" });
      doc.text(String(r.sellable_cap), colX[4], y + 4, { align: "right" });
      doc.text(fmt(r.net_price), colX[5], y + 4, { align: "right" });
      doc.text(fmt(ticketingFee > 0 ? ticketingFee : 0), colX[6], y + 4, { align: "right" });
      doc.text(fmt(r.facility_fee), colX[7], y + 4, { align: "right" });
      doc.text(fmt(r.price), colX[8], y + 4, { align: "right" });
      y += 6;
    }
    y += 3;
  }

  // ── REVENUE ──
  if (offer.gross_potential != null || offer.adj_gross != null || offer.net_potential != null) {
    y = drawSectionHeader(doc, "Revenue", y);
    if (offer.gross_potential != null) y = drawLabelValue(doc, "Gross Revenue", fmt(offer.gross_potential), y);
    if (offer.adj_gross != null) y = drawLabelValue(doc, "Adjusted Gross", fmt(offer.adj_gross), y);
    if (offer.tax_rate != null) {
      const taxPct = (offer.tax_rate * 100).toFixed(2);
      const taxAmount = (offer.adj_gross ?? offer.gross_potential ?? 0) * offer.tax_rate;
      y = drawLabelValue(doc, "Tax Rate", `${taxPct}%`, y);
      y = drawLabelValue(doc, "Taxes", fmt(taxAmount), y);
    }
    if (offer.net_potential != null) y = drawLabelValue(doc, "Net Potential", fmt(offer.net_potential), y);
    y += 3;
  }

  // ── EXPENSES ──
  if (offer.fixed_expenses?.length || offer.variable_expenses?.length) {
    const fixedRows = (offer.fixed_expenses ?? []).filter(e => e.amount > 0);
    const varRows = (offer.variable_expenses ?? []).filter(e => e.amount > 0);
    const maxRows = Math.max(fixedRows.length, varRows.length);
    const neededHeight = 14 + maxRows * 5 + 12;
    y = ensureSpace(doc, neededHeight, y);

    y = drawSectionHeader(doc, "Expenses", y);
    const colMid = MARGIN + CONTENT_WIDTH / 2 + 2;
    const startY = y;

    // Fixed Expenses (left column)
    const fixedNameMaxW = colMid - MARGIN - 40; // available width for expense name
    if (fixedRows.length) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...DARK);
      doc.text("Fixed Expenses", MARGIN + 3, y + 4);
      doc.text("Amount", colMid - 8, y + 4, { align: "right" });
      y += 6;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      for (const e of fixedRows) {
        const eName: string = doc.splitTextToSize(e.name, fixedNameMaxW)[0] || e.name;
        doc.text(eName, MARGIN + 5, y + 4);
        doc.text(fmt(e.amount), colMid - 8, y + 4, { align: "right" });
        y += 5;
      }
      doc.setDrawColor(...MID_GRAY);
      doc.setLineWidth(0.2);
      doc.line(MARGIN + 3, y + 1, colMid - 5, y + 1);
      y += 3;
      doc.setFont("helvetica", "bold");
      doc.text("Fixed Total", MARGIN + 5, y + 4);
      doc.text(fmt(fixedRows.reduce((s, e) => s + e.amount, 0)), colMid - 8, y + 4, { align: "right" });
    }
    const fixedEndY = y + 6;

    // Variable Expenses (right column)
    y = startY;
    const varNameMaxW = CONTENT_WIDTH - (colMid - MARGIN) - 40; // available width for var expense name
    if (varRows.length) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...DARK);
      doc.text("Variable Expenses", colMid + 3, y + 4);
      doc.text("Amount", MARGIN + CONTENT_WIDTH - 3, y + 4, { align: "right" });
      y += 6;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      for (const e of varRows) {
        const varLabel = `${e.name} (${(e.rate * 100).toFixed(2)}%)`;
        const truncVarLabel: string = doc.splitTextToSize(varLabel, varNameMaxW)[0] || varLabel;
        doc.text(truncVarLabel, colMid + 5, y + 4);
        doc.text(fmt(e.amount), MARGIN + CONTENT_WIDTH - 3, y + 4, { align: "right" });
        y += 5;
      }
      doc.setDrawColor(...MID_GRAY);
      doc.setLineWidth(0.2);
      doc.line(colMid + 3, y + 1, MARGIN + CONTENT_WIDTH - 3, y + 1);
      y += 3;
      doc.setFont("helvetica", "bold");
      doc.text("Variable Total", colMid + 5, y + 4);
      doc.text(fmt(varRows.reduce((s, e) => s + e.amount, 0)), MARGIN + CONTENT_WIDTH - 3, y + 4, { align: "right" });
    }
    const varEndY = y + 6;

    y = Math.max(fixedEndY, varEndY) + 2;

    if (offer.total_expenses != null) {
      y = drawDivider(doc, y);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...DARK);
      doc.text("Total Expenses:", MARGIN + 3, y + 4);
      doc.text(fmt(offer.total_expenses), MARGIN + CONTENT_WIDTH - 3, y + 4, { align: "right" });
      y += 7;
    }
    y += 3;
  }

  // ── DEPOSIT & PAYMENT TERMS ──
  y = drawSectionHeader(doc, "Deposit & Payment Terms", y);
  if (contract.deposit_amount != null) {
    y = drawLabelValue(doc, "Deposit Amount", fmt(contract.deposit_amount), y);
  }
  if (offer.deposit_pct != null) {
    y = drawLabelValue(doc, "Deposit %", `${offer.deposit_pct}%`, y);
  }
  if (offer.deposit_due) {
    y = drawLabelValue(doc, "Deposit Due", offer.deposit_due, y);
  }
  if (offer.balance_due) {
    y = drawLabelValue(doc, "Balance Due", offer.balance_due, y);
  }
  y = drawParagraph(doc, "Balance of guarantee is due at settlement on the day of the performance unless otherwise specified above.", y + 2, { indent: 3 });
  y += 5;

  // ── STANDARD CLAUSES ──
  y = drawSectionHeader(doc, "Terms & Conditions", y);

  const radiusDist = offer.radius_distance ?? "100";
  const radiusPrior = offer.radius_days_prior ?? 60;
  const radiusAfter = offer.radius_days_after ?? 60;
  y = drawClause(doc, 1, "Radius Restriction",
    `Artist agrees not to perform within ${radiusDist} miles of ${eventVenueName} for ${radiusPrior} days prior to and ${radiusAfter} days following the engagement date without prior written consent of Buyer. Violation of this clause shall entitle Buyer to reduce the guarantee by fifty percent (50%) or cancel the engagement at Buyer's sole discretion.${contract.radius_clause ? ` Additional terms: ${contract.radius_clause}` : ""}`,
    y
  );

  y = drawClause(doc, 2, "Cancellation",
    `Either party may cancel this Agreement by providing written notice to the other party no less than thirty (30) days prior to the engagement date. In the event of cancellation by Buyer without cause within 30 days of the engagement, Buyer shall forfeit the deposit to Artist. In the event of cancellation by Artist without cause within 30 days, Artist shall return all deposits received. If ticket sales fall below a threshold mutually agreed upon in writing, Buyer may cancel or renegotiate terms with no less than fourteen (14) days notice. Force majeure events (as defined in §3) are excluded from these cancellation penalties.`,
    y
  );

  y = drawClause(doc, 3, "Force Majeure",
    `Neither party shall be liable for failure to perform obligations under this Agreement if such failure results from circumstances beyond the reasonable control of the affected party, including but not limited to: acts of God, fire, flood, earthquake, epidemic, pandemic, government action or order, war, terrorism, civil unrest, labor disputes, or any other event that could not have been reasonably foreseen or prevented. The affected party shall notify the other party as soon as practicable. If the force majeure event continues for more than thirty (30) days, either party may terminate this Agreement without penalty.`,
    y
  );

  y = drawClause(doc, 4, "Indemnification",
    `Each party agrees to indemnify, defend, and hold harmless the other party, its officers, directors, employees, and agents from and against any and all claims, damages, losses, costs, and expenses (including reasonable attorneys' fees) arising out of or related to: (a) the indemnifying party's negligence or willful misconduct; (b) breach of any representation, warranty, or obligation under this Agreement. Buyer shall be solely responsible for the safety and security of the venue, its patrons, and all persons on the premises during the engagement.`,
    y
  );

  y = drawClause(doc, 5, "Insurance",
    `Buyer shall maintain comprehensive general liability insurance with limits of not less than One Million Dollars ($1,000,000) per occurrence and Two Million Dollars ($2,000,000) in the aggregate, covering the venue and all activities related to the engagement. Artist and Artist's agents shall be named as additional insureds on such policy. Buyer shall provide a certificate of insurance to Artist no later than fourteen (14) days prior to the engagement date. Failure to provide such certificate shall constitute a material breach of this Agreement.`,
    y
  );

  y = drawClause(doc, 6, "Licensing & Permits",
    `Buyer shall be responsible for obtaining and maintaining all licenses, permits, and authorizations required for the engagement, including but not limited to: ASCAP, BMI, SESAC, and GMR music performance licenses; liquor licenses (if applicable); occupancy permits; fire marshal approval; and any other federal, state, or local permits required for the event. All costs associated with such licenses and permits shall be borne by Buyer.`,
    y
  );

  const prodBy = offer.production_by ?? "Buyer";
  y = drawClause(doc, 7, "Production",
    `Production for the engagement shall be provided by ${prodBy}. Sound reinforcement, lighting, and backline equipment shall be provided per the Artist's technical rider, which is attached hereto as Exhibit B and incorporated by reference. Buyer shall ensure that the venue meets all technical requirements specified in the rider and shall provide qualified stage hands and technical crew as required. Any additional production costs beyond those specified in the rider shall be the responsibility of the party requesting such additions.`,
    y
  );

  y = drawClause(doc, 8, "Hospitality",
    `Buyer shall provide hospitality per the Artist's hospitality rider, attached hereto as Exhibit A and incorporated by reference. This includes dressing room requirements, catering, beverages, and any other hospitality provisions specified therein.${offer.comps ? ` Buyer shall provide ${offer.comps} complimentary tickets for Artist's use.` : ""} Any buyout of rider provisions must be agreed upon in writing by both parties.`,
    y
  );

  const merchSplit = offer.merch_split ?? "Artist retains 100%";
  const merchSeller = offer.merch_seller ?? "Artist";
  y = drawClause(doc, 9, "Merchandising",
    `Merchandise sales split: ${merchSplit}. Merchandise seller: ${merchSeller}. Artist shall have the exclusive right to sell merchandise bearing Artist's name, likeness, or logo at the venue on the date of engagement. Buyer shall provide a suitable, well-lit, and accessible location for merchandise sales at no charge. Buyer shall not sell, distribute, or authorize the sale of any merchandise bearing Artist's name or likeness without prior written consent.`,
    y
  );

  y = drawClause(doc, 10, "Recording & Streaming",
    `No audio or video recording, live streaming, broadcasting, or other reproduction of the performance shall be permitted without the prior written consent of Artist. This includes but is not limited to: professional recordings, mobile phone recordings by venue staff for commercial use, webcast, simulcast, podcast, or any form of media capture. Buyer shall make reasonable efforts to enforce this restriction within the venue. Any authorized recording shall be subject to separate terms agreed upon in writing.`,
    y
  );

  y = drawClause(doc, 11, "Confidentiality",
    `The terms and conditions of this Agreement, including but not limited to financial terms, are strictly confidential. Neither party shall disclose, publish, or disseminate any terms of this Agreement to any third party without the prior written consent of the other party, except as required by law or to the parties' respective legal, financial, and tax advisors who are bound by professional confidentiality obligations.`,
    y
  );

  const state = venue.address_state ?? "the state where the venue is located";
  y = drawClause(doc, 12, "Governing Law & Dispute Resolution",
    `This Agreement shall be governed by and construed in accordance with the laws of ${state}. Any disputes arising out of or relating to this Agreement that cannot be resolved through good faith negotiation shall be submitted to binding arbitration administered in accordance with the rules of the American Arbitration Association. The arbitration shall take place in the city where the venue is located, and the decision of the arbitrator(s) shall be final and binding on both parties. The prevailing party shall be entitled to recover reasonable attorneys' fees and costs.`,
    y
  );

  y = drawClause(doc, 13, "Entire Agreement",
    `This Agreement, together with all exhibits and riders attached hereto, constitutes the entire agreement between the parties with respect to the subject matter hereof and supersedes all prior and contemporaneous agreements, understandings, negotiations, and discussions, whether oral or written. No modification, amendment, or waiver of any provision of this Agreement shall be effective unless in writing and signed by both parties. If any provision of this Agreement is held to be invalid or unenforceable, the remaining provisions shall continue in full force and effect.`,
    y
  );

  // Custom clauses
  if (contract.custom_clauses?.length) {
    let clauseNum = 14;
    for (const clause of contract.custom_clauses) {
      y = drawClause(doc, clauseNum, clause.title, clause.body, y);
      clauseNum++;
    }
  }

  // ── SIGNATURE BLOCKS ──
  y = ensureSpace(doc, 70, y);
  y = drawSectionHeader(doc, "Execution", y);
  y += 3;
  y = drawParagraph(doc, "IN WITNESS WHEREOF, the parties have executed this Agreement as of the date first written above.", y, { indent: 3 });
  y += 8;

  const lineW = (CONTENT_WIDTH - 14) / 2;
  doc.setDrawColor(...DARK);
  doc.setLineWidth(0.4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...DARK);

  // Left: Artist / Agent
  const lx = MARGIN;
  doc.line(lx, y + 12, lx + lineW, y + 12);
  doc.text("Artist / Agent — Signature", lx, y + 17);
  doc.line(lx, y + 27, lx + lineW, y + 27);
  doc.text("Print Name", lx, y + 32);
  doc.line(lx, y + 42, lx + lineW, y + 42);
  doc.text("Title", lx, y + 47);
  doc.line(lx, y + 57, lx + lineW, y + 57);
  doc.text("Date", lx, y + 62);

  // Right: Buyer / Promoter
  const rx = MARGIN + lineW + 14;
  doc.line(rx, y + 12, rx + lineW, y + 12);
  doc.text("Buyer / Promoter — Signature", rx, y + 17);
  doc.line(rx, y + 27, rx + lineW, y + 27);
  doc.text("Print Name", rx, y + 32);
  doc.line(rx, y + 42, rx + lineW, y + 42);
  doc.text("Title", rx, y + 47);
  doc.line(rx, y + 57, rx + lineW, y + 57);
  doc.text("Date", rx, y + 62);

  // Footer on all pages
  drawFooter(doc, "Performance Agreement", { vcIconDataUrl: vcIcon ?? undefined });

  // Save
  const filename = `${sanitize(artistName)}-${sanitize(eventDate)}-Performance_Agreement.pdf`;
  doc.save(filename);
}
