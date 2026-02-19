import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// GET /api/settlements — list settlements, optional ?venue_id= filter
export async function GET(request: Request) {
  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const venueId = searchParams.get("venue_id");

  let query = admin
    .from("settlements")
    .select("*")
    .order("created_at", { ascending: false });

  if (venueId) {
    query = query.eq("venue_id", venueId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? [], { status: 200 });
}

// POST /api/settlements — create a settlement from an event
// Auto-pulls ticket sales, pre-fills expenses from linked offer
export async function POST(request: Request) {
  const admin = createAdminClient();
  const body = await request.json();

  if (!body.event_id) {
    return NextResponse.json(
      { error: "event_id is required" },
      { status: 400 }
    );
  }

  // 1. Look up the event
  const { data: event, error: eventErr } = await admin
    .from("events")
    .select("id, title, venue_id")
    .eq("id", body.event_id)
    .single();

  if (eventErr || !event) {
    return NextResponse.json(
      { error: "Event not found" },
      { status: 404 }
    );
  }

  const venueId = body.venue_id || event.venue_id;

  // 2. Find linked offer (if any)
  const { data: offer } = await admin
    .from("artist_offers")
    .select("*")
    .eq("venue_id", venueId)
    .or(`event_date.is.null`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Try to find offer linked by event_id or matching venue
  const { data: linkedOffer } = await admin
    .from("artist_offers")
    .select("*")
    .eq("venue_id", venueId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const offerData = linkedOffer || offer || null;

  // 3. Auto-pull actual ticket sales from orders + tickets + ticket_types
  const { data: ticketRows } = await admin
    .from("tickets")
    .select(
      `
      id,
      ticket_type_id,
      status,
      ticket_types!inner(
        id,
        name,
        price,
        capacity
      ),
      orders!inner(
        id,
        event_id,
        status
      )
    `
    )
    .eq("orders.event_id", body.event_id)
    .eq("orders.status", "completed");

  // Build ticket_audit grouped by ticket type
  const tierMap: Record<
    string,
    {
      tier: string;
      capacity: number;
      sold: number;
      comps: number;
      kills: number;
      price: number;
      facility_fee: number;
      gross: number;
    }
  > = {};

  if (ticketRows) {
    for (const t of (ticketRows as unknown) as Array<{
      id: string;
      ticket_type_id: string;
      status: string;
      ticket_types: { id: string; name: string; price: number; capacity: number };
      orders: { id: string; event_id: string; status: string };
    }>) {
      const tt = t.ticket_types;
      if (!tierMap[tt.id]) {
        tierMap[tt.id] = {
          tier: tt.name,
          capacity: tt.capacity || 0,
          sold: 0,
          comps: 0,
          kills: 0,
          price: tt.price || 0,
          facility_fee: 0,
          gross: 0,
        };
      }
      if (t.status === "comp") {
        tierMap[tt.id].comps += 1;
      } else {
        tierMap[tt.id].sold += 1;
      }
    }
  }

  // Also pull ticket_types for capacity data
  const { data: allTypes } = await admin
    .from("ticket_types")
    .select("id, name, price, capacity")
    .eq("event_id", body.event_id);

  if (allTypes) {
    for (const tt of allTypes) {
      if (!tierMap[tt.id]) {
        tierMap[tt.id] = {
          tier: tt.name,
          capacity: tt.capacity || 0,
          sold: 0,
          comps: 0,
          kills: 0,
          price: tt.price || 0,
          facility_fee: 0,
          gross: 0,
        };
      } else {
        tierMap[tt.id].capacity = tt.capacity || tierMap[tt.id].capacity;
      }
    }
  }

  const ticketAudit = Object.values(tierMap).map((row) => ({
    ...row,
    gross: row.sold * row.price,
  }));

  const totalGross = ticketAudit.reduce((sum, r) => sum + r.gross, 0);

  // 4. Snapshot deal terms from offer
  const guarantee = body.guarantee ?? offerData?.guarantee ?? 0;
  const dealType = body.deal_type ?? offerData?.deal_type ?? null;
  const backendPct =
    body.backend_percentage ?? offerData?.backend_percentage
      ? parseFloat(String(offerData?.backend_percentage ?? "0"))
      : 0;
  const taxRate = body.tax_rate ?? offerData?.tax_rate ?? 0;

  // 5. Create the settlement row
  const { data: settlement, error: settleErr } = await admin
    .from("settlements")
    .insert({
      event_id: body.event_id,
      offer_id: offerData?.id || body.offer_id || null,
      contract_id: body.contract_id || null,
      venue_id: venueId,
      artist_name: body.artist_name ?? offerData?.artist_name ?? null,
      guarantee,
      deal_type: dealType,
      backend_percentage: backendPct,
      bonus_structure: offerData?.bonus_structure || body.bonus_structure || null,
      radius_clause: body.radius_clause ?? null,
      ticket_audit: ticketAudit,
      total_gross: totalGross,
      ticketing_fees: body.ticketing_fees ?? 0,
      facility_fees: body.facility_fees ?? 0,
      adj_gross: body.adj_gross ?? totalGross,
      taxes: body.taxes ?? 0,
      tax_rate: taxRate,
      net_receipts: body.net_receipts ?? totalGross,
      total_expenses: offerData?.total_expenses ?? body.total_expenses ?? 0,
      splitpoint: offerData?.splitpoint ?? body.splitpoint ?? 0,
      artist_backend: body.artist_backend ?? 0,
      artist_total: body.artist_total ?? guarantee,
      deposit_paid: body.deposit_paid ?? offerData?.deposit_amount ?? 0,
      cash_advance: body.cash_advance ?? 0,
      balance_due: body.balance_due ?? 0,
      status: "draft",
    })
    .select()
    .single();

  if (settleErr) {
    return NextResponse.json({ error: settleErr.message }, { status: 500 });
  }

  // 6. Pre-fill expenses from the offer's fixed_expenses and variable_expenses
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
      for (const exp of offerData.fixed_expenses as Array<{
        name: string;
        amount: number;
      }>) {
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
      for (const exp of offerData.variable_expenses as Array<{
        name: string;
        rate: number;
        amount: number;
      }>) {
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

    // Pre-fill deposit if offer has deposit_amount
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
