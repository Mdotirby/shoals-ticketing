import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// GET: fetch ticket tiers for an event (public)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  const [{ data, error }, { data: ticketRows }] = await Promise.all([
    admin
      .from("ticket_tiers")
      .select("*")
      .eq("event_id", id)
      .order("sort_order", { ascending: true }),
    // Count individual tickets per tier — orders.tier_id is not persisted,
    // but tickets.ticket_type_id is reliably set by the webhook.
    admin
      .from("tickets")
      .select("ticket_type_id")
      .eq("event_id", id),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const soldByTier: Record<string, number> = {};
  for (const row of ticketRows ?? []) {
    if (row.ticket_type_id) {
      soldByTier[row.ticket_type_id] = (soldByTier[row.ticket_type_id] ?? 0) + 1;
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

// PUT: upsert tiers for an event (admin — used by edit form)
// Safe for events that already have tickets sold: existing tiers are updated
// in place, removed tiers are only deleted if they have no ticket purchases.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();
  const body = await request.json();

  if (!Array.isArray(body.tiers)) {
    return NextResponse.json({ error: "tiers array is required" }, { status: 400 });
  }

  type IncomingTier = { id?: string; tier_name: string; price: number; capacity: number; sort_order?: number };

  // Fetch existing tier IDs and which ones have tickets sold
  const [{ data: existingRows }, { data: soldRows }] = await Promise.all([
    admin.from("ticket_tiers").select("id").eq("event_id", id),
    admin.from("tickets").select("ticket_type_id").eq("event_id", id),
  ]);

  const existingIds = new Set((existingRows ?? []).map((r: { id: string }) => r.id));
  const soldIds = new Set(
    (soldRows ?? []).map((r: { ticket_type_id: string | null }) => r.ticket_type_id).filter(Boolean)
  );
  const incomingIds = new Set(
    (body.tiers as IncomingTier[]).map((t) => t.id).filter(Boolean)
  );

  // Delete tiers that were removed from the form AND have no tickets sold
  const toDelete = [...existingIds].filter((eid) => !incomingIds.has(eid) && !soldIds.has(eid));
  if (toDelete.length > 0) {
    const { error: deleteError } = await admin.from("ticket_tiers").delete().in("id", toDelete);
    if (deleteError) {
      return NextResponse.json({ error: "Failed to remove tiers: " + deleteError.message }, { status: 500 });
    }
  }

  // Update existing tiers / insert new ones
  for (const [i, t] of (body.tiers as IncomingTier[]).entries()) {
    const sortOrder = t.sort_order ?? i;
    if (t.id && existingIds.has(t.id)) {
      const { error } = await admin.from("ticket_tiers").update({
        tier_name: t.tier_name,
        price: t.price,
        capacity: t.capacity,
        sort_order: sortOrder,
      }).eq("id", t.id);
      if (error) {
        return NextResponse.json({ error: "Failed to update tier: " + error.message }, { status: 500 });
      }
    } else {
      const { error } = await admin.from("ticket_tiers").insert({
        event_id: id,
        tier_name: t.tier_name,
        price: t.price,
        capacity: t.capacity,
        sort_order: sortOrder,
      });
      if (error) {
        return NextResponse.json({ error: "Failed to insert tier: " + error.message }, { status: 500 });
      }
    }
  }

  const { data: newTiers } = await admin
    .from("ticket_tiers")
    .select("*")
    .eq("event_id", id)
    .order("sort_order", { ascending: true });

  return NextResponse.json(newTiers ?? [], { status: 200 });
}
