import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { computeEventAudit, findOfferForEvent } from "@/lib/settlement/audit";
import { settlementWaterfall } from "@/lib/settlement/model";

// GET /api/settlements
//   ?venue_id=     filter by venue
//   ?event_id=     return existing settlement(s) for an event (used by the
//                  "Create or Open Settlement" button on /admin/orders/[id])
export async function GET(request: Request) {
  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const venueId = searchParams.get("venue_id");
  const eventId = searchParams.get("event_id");

  let query = admin
    .from("settlements")
    .select("*")
    .order("created_at", { ascending: false });

  if (venueId) query = query.eq("venue_id", venueId);
  if (eventId) query = query.eq("event_id", eventId);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? [], { status: 200 });
}

// POST /api/settlements
//
// VenueCore settlement (default):
//   Requires event_id. Auto-audits real ticket sales from orders.
//
// Manual / external settlement (source = 'external'):
//   event_id is optional. All financial figures come from the request body.
//   computeEventAudit() is skipped entirely.
export async function POST(request: Request) {
  const admin = createAdminClient();
  const body = await request.json();

  const isExternal = body.source === "external";

  // ── External / manual settlement path ────────────────────────────────────
  if (isExternal) {
    const venueId = body.venue_id || null;
    // For external settlements we don't require event_id or venue_id —
    // the user may be creating one for a show that isn't in the system at all.

    // Idempotent on event_id when provided
    if (body.event_id) {
      const { data: existingExt } = await admin
        .from("settlements")
        .select("*")
        .eq("event_id", body.event_id)
        .eq("source", "external")
        .maybeSingle();
      if (existingExt) return NextResponse.json(existingExt, { status: 200 });
    }

    const manualGross = Number(body.manual_gross ?? 0);
    const manualTicketsSold = Number(body.manual_tickets_sold ?? 0);
    const manualTicketingFee = Number(body.manual_ticketing_fee ?? 0);
    const manualFacilityFee = Number(body.manual_facility_fee ?? 0);
    const manualTaxRate = Number(body.manual_tax_rate ?? 0);
    const manualTaxMethod = body.manual_tax_method ?? "multiplier";
    const manualProcessingFee = Number(body.manual_processing_fee ?? 0);

    // Derive downstream totals from the manual figures
    const ticketingFees = manualTicketingFee * manualTicketsSold;
    const facilityFees = manualFacilityFee * manualTicketsSold;
    const taxes =
      manualTaxMethod === "divisor" && manualTaxRate > 0
        ? manualGross - manualGross / (1 + manualTaxRate)
        : manualGross * manualTaxRate;
    const adjGross = manualGross - ticketingFees - facilityFees;
    const netReceipts = adjGross - taxes - manualProcessingFee;

    const guarantee = Number(body.guarantee ?? 0);

    const { data: settlement, error: settleErr } = await admin
      .from("settlements")
      .insert({
        event_id: body.event_id || null,
        venue_id: venueId,
        source: "external",

        event_title: body.event_title || null,
        event_date: body.event_date || null,

        artist_name: body.artist_name || null,
        guarantee,
        deal_type: body.deal_type || null,
        backend_percentage: Number(body.backend_percentage ?? 0),
        radius_clause: body.radius_clause || null,

        // Manual figures stored for display / edit
        manual_gross: manualGross,
        manual_tickets_sold: manualTicketsSold,
        manual_ticket_price: Number(body.manual_ticket_price ?? 0),
        manual_ticketing_fee: manualTicketingFee,
        manual_facility_fee: manualFacilityFee,
        manual_tax_rate: manualTaxRate,
        manual_tax_method: manualTaxMethod,
        manual_processing_fee: manualProcessingFee,

        // Derived from manual figures (same columns as VenueCore settlements)
        ticket_audit: [],
        tickets_sold_count: manualTicketsSold,
        comp_count: 0,
        comp_face_value: 0,
        total_gross: manualGross,
        ticketing_fees: ticketingFees,
        facility_fees: facilityFees,
        cc_fees: manualProcessingFee,
        ticketing_fee_per_ticket: manualTicketingFee,
        facility_fee_per_ticket: manualFacilityFee,
        adj_gross: adjGross,
        taxes,
        tax_rate: manualTaxRate,
        tax_method: manualTaxMethod,
        net_receipts: netReceipts,

        total_expenses: 0,
        splitpoint: 0,
        artist_backend: 0,
        artist_total: guarantee,
        deposit_paid: 0,
        cash_advance: 0,
        balance_due: 0,

        status: "draft",
      })
      .select()
      .single();

    if (settleErr) {
      return NextResponse.json({ error: settleErr.message }, { status: 500 });
    }
    return NextResponse.json(settlement, { status: 201 });
  }

  // ── VenueCore audit-based settlement path ─────────────────────────────────
  if (!body.event_id) {
    return NextResponse.json(
      { error: "event_id is required" },
      { status: 400 }
    );
  }

  // 1. Look up the event
  const { data: event, error: eventErr } = await admin
    .from("events")
    .select("id, title, date, venue_id")
    .eq("id", body.event_id)
    .single();

  if (eventErr || !event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const venueId = body.venue_id || event.venue_id;
  if (!venueId) {
    return NextResponse.json(
      { error: "Event has no venue_id; cannot create settlement" },
      { status: 400 }
    );
  }

  // 2. Idempotent: if a settlement already exists for this event, return it.
  const { data: existing } = await admin
    .from("settlements")
    .select("*")
    .eq("event_id", body.event_id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(existing, { status: 200 });
  }

  // 3. Find the matching offer (event_date + venue match — no fallback to
  //    "latest at venue").
  const offerMatch =
    body.offer_id != null
      ? await admin
          .from("artist_offers")
          .select("*")
          .eq("id", body.offer_id)
          .maybeSingle()
          .then((r) => (r.data ? { id: r.data.id, data: r.data } : null))
      : await findOfferForEvent(admin, body.event_id);

  const offerData = offerMatch?.data as
    | (Record<string, unknown> & {
        artist_name?: string;
        guarantee?: number | string;
        deal_type?: string;
        backend_percentage?: number | string;
        bonus_structure?: Record<string, unknown>;
        tax_rate?: number | string;
        tax_method?: string;
        deposit_amount?: number;
        splitpoint?: number;
        total_expenses?: number;
        fixed_expenses?: Array<{ name: string; amount: number }>;
        variable_expenses?: Array<{ name: string; rate: number; amount: number }>;
      })
    | undefined;

  // 4. Compute the actual ticket audit + fees + tax from real order data.
  const auditTotals = await computeEventAudit(admin, body.event_id);

  // 5. Snapshot deal terms from offer (if matched) — caller-provided body wins.
  const guarantee =
    body.guarantee ?? Number(offerData?.guarantee ?? 0) ?? 0;
  const dealType = body.deal_type ?? offerData?.deal_type ?? null;
  // The settlements table stores backend as a DECIMAL (0.85) — the settlement
  // page multiplies by 100 on load. But `artist_offers.backend_percentage` is
  // a text column holding a PERCENT ("85"), so copying it across verbatim
  // stored 85 and rendered as 8500%, computing a backend of 85× the net.
  // Normalise: anything above 1 is a percent and gets divided down.
  const backendPctRaw = body.backend_percentage ?? offerData?.backend_percentage;
  const backendPctParsed =
    backendPctRaw != null ? parseFloat(String(backendPctRaw)) || 0 : 0;
  const backendPct = backendPctParsed > 1 ? backendPctParsed / 100 : backendPctParsed;
  const taxRate =
    body.tax_rate ?? Number(offerData?.tax_rate ?? auditTotals.tax_rate) ?? 0;
  const taxMethod =
    body.tax_method ??
    (offerData?.tax_method === "divisor" ? "divisor" : "multiplier");

  const { adjGross, taxes: waterfallTaxes, netReceipts } = settlementWaterfall({
    totalGross: auditTotals.total_gross,
    ticketingFees: auditTotals.ticketing_fees,
    facilityFees: auditTotals.facility_fees,
    taxRate,
    taxMethod: taxMethod === "divisor" ? "divisor" : "multiplier",
  });

  // 6. Create the settlement row
  const { data: settlement, error: settleErr } = await admin
    .from("settlements")
    .insert({
      event_id: body.event_id,
      offer_id: offerMatch?.id ?? body.offer_id ?? null,
      contract_id: body.contract_id || null,
      venue_id: venueId,
      source: "venuecore",

      // Event snapshot
      event_title: event.title || null,
      event_date: event.date || null,

      // Deal terms snapshot
      artist_name: body.artist_name ?? offerData?.artist_name ?? null,
      guarantee,
      deal_type: dealType,
      backend_percentage: backendPct,
      bonus_structure: offerData?.bonus_structure || body.bonus_structure || null,
      radius_clause: body.radius_clause ?? null,

      // Audit
      ticket_audit: auditTotals.audit,
      tickets_sold_count: auditTotals.tickets_sold_count,
      comp_count: auditTotals.comp_count,
      comp_face_value: auditTotals.comp_face_value,

      // Fee/tax breakdown (live from orders)
      total_gross: auditTotals.total_gross,
      ticketing_fees: auditTotals.ticketing_fees,
      facility_fees: auditTotals.facility_fees,
      cc_fees: auditTotals.cc_fees,
      cc_fees_actual: auditTotals.cc_fees_actual,
      ticketing_fee_per_ticket: auditTotals.ticketing_fee_per_ticket,
      facility_fee_per_ticket: auditTotals.facility_fee_per_ticket,
      adj_gross: adjGross,
      taxes: waterfallTaxes,
      tax_rate: taxRate,
      tax_method: taxMethod,
      net_receipts: netReceipts,

      // Pre-filled financials
      total_expenses:
        body.total_expenses ?? Number(offerData?.total_expenses ?? 0) ?? 0,
      splitpoint: body.splitpoint ?? Number(offerData?.splitpoint ?? 0) ?? 0,
      artist_backend: body.artist_backend ?? 0,
      artist_total: body.artist_total ?? guarantee,
      deposit_paid:
        body.deposit_paid ?? Number(offerData?.deposit_amount ?? 0) ?? 0,
      cash_advance: body.cash_advance ?? 0,
      balance_due: body.balance_due ?? 0,

      status: "draft",
    })
    .select()
    .single();

  if (settleErr) {
    return NextResponse.json({ error: settleErr.message }, { status: 500 });
  }

  // 7. Pre-fill expenses from the offer
  if (offerData && settlement) {
    const expenses: Array<{
      settlement_id: string;
      name: string;
      category: string;
      estimated_amount: number;
      actual_amount: number;
      rate: number;
      sort_order: number;
    }> = [];
    let sortOrder = 0;

    if (Array.isArray(offerData.fixed_expenses)) {
      for (const exp of offerData.fixed_expenses) {
        expenses.push({
          settlement_id: settlement.id,
          name: exp.name,
          category: "fixed",
          estimated_amount: exp.amount || 0,
          actual_amount: 0,
          rate: 0,
          sort_order: sortOrder++,
        });
      }
    }

    if (Array.isArray(offerData.variable_expenses)) {
      for (const exp of offerData.variable_expenses) {
        expenses.push({
          settlement_id: settlement.id,
          name: exp.name,
          category: "variable",
          estimated_amount: exp.amount || 0,
          actual_amount: 0,
          rate: exp.rate || 0,
          sort_order: sortOrder++,
        });
      }
    }

    if (expenses.length > 0) {
      await admin.from("settlement_expenses").insert(expenses);
    }

    // Pre-fill deposit if offer has one
    if (offerData.deposit_amount && offerData.deposit_amount > 0) {
      await admin.from("settlement_deposits").insert({
        settlement_id: settlement.id,
        type: "deposit",
        amount: offerData.deposit_amount,
        notes: "Pre-filled from offer",
      });
    }
  }

  return NextResponse.json(settlement, { status: 201 });
}
