import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// GET /api/events/[id]/holds — list active (unreleased) holds for an event.
// Manual bookkeeping only: these rows record that someone set tickets aside
// for a reason. They do not affect checkout/availability math anywhere.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("event_holds")
    .select("*, ticket_tiers(tier_name)")
    .eq("event_id", id)
    .is("released_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    // Table not migrated yet — degrade to an empty list rather than a 500,
    // so the Inventory & Holds tab still renders before the migration runs.
    if (/relation .* does not exist/i.test(error.message)) {
      return NextResponse.json([], { status: 200 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? [], { status: 200 });
}

// POST /api/events/[id]/holds — create a hold.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();
  const body = await request.json();

  if (!body.quantity || !body.owner_label) {
    return NextResponse.json({ error: "quantity and owner_label are required" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("event_holds")
    .insert({
      event_id: id,
      ticket_tier_id: body.ticket_tier_id || null,
      quantity: body.quantity,
      hold_type: body.hold_type || "other",
      owner_label: body.owner_label,
      reason: body.reason || null,
      release_note: body.release_note || null,
    })
    .select("*, ticket_tiers(tier_name)")
    .single();

  if (error) {
    if (/relation .* does not exist/i.test(error.message)) {
      return NextResponse.json(
        { error: "Holds aren't set up yet — run the pending migration first." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
