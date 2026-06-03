import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// GET: fetch ticket tiers for an event (public)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  const [{ data, error }, { data: tierSales }] = await Promise.all([
    admin
      .from("ticket_tiers")
      .select("*")
      .eq("event_id", id)
      .order("sort_order", { ascending: true }),
    admin
      .from("orders")
      .select("tier_id, quantity")
      .eq("event_id", id)
      .eq("status", "paid"),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const soldByTier: Record<string, number> = {};
  for (const row of tierSales ?? []) {
    if (row.tier_id) {
      soldByTier[row.tier_id] = (soldByTier[row.tier_id] ?? 0) + (row.quantity ?? 1);
    }
  }

  const tiersWithSold = (data ?? []).map((t) => ({
    ...t,
    quantity_sold: soldByTier[t.id] ?? 0,
  }));

  return NextResponse.json(tiersWithSold, { status: 200 });
}

// POST: create a ticket tier for an event (admin)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();
  const body = await request.json();

  const { data, error } = await admin
    .from("ticket_tiers")
    .insert({
      event_id: id,
      tier_name: body.tier_name,
      price: body.price,
      capacity: body.capacity,
      sort_order: body.sort_order ?? 0,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

// PUT: replace all tiers for an event (admin — used by edit form)
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();
  const body = await request.json();

  if (!Array.isArray(body.tiers)) {
    return NextResponse.json(
      { error: "tiers array is required" },
      { status: 400 }
    );
  }

  // Delete existing tiers for this event
  const { error: deleteError } = await admin
    .from("ticket_tiers")
    .delete()
    .eq("event_id", id);

  if (deleteError) {
    return NextResponse.json(
      { error: "Failed to delete old tiers: " + deleteError.message },
      { status: 500 }
    );
  }

  // Insert new tiers
  if (body.tiers.length > 0) {
    const tierRows = body.tiers.map(
      (t: { tier_name: string; price: number; capacity: number; sort_order?: number }, i: number) => ({
        event_id: id,
        tier_name: t.tier_name,
        price: t.price,
        capacity: t.capacity,
        sort_order: t.sort_order ?? i,
      })
    );

    const { error: insertError } = await admin
      .from("ticket_tiers")
      .insert(tierRows);

    if (insertError) {
      return NextResponse.json(
        { error: "Failed to insert tiers: " + insertError.message },
        { status: 500 }
      );
    }
  }

  // Fetch and return the new tiers
  const { data: newTiers } = await admin
    .from("ticket_tiers")
    .select("*")
    .eq("event_id", id)
    .order("sort_order", { ascending: true });

  return NextResponse.json(newTiers ?? [], { status: 200 });
}
