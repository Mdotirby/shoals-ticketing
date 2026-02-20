import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";

type RouteContext = { params: Promise<{ id: string; itemId: string }> };

// PUT /api/auctions/[id]/items/[itemId] — update an item
export async function PUT(request: Request, context: RouteContext) {
  const { id, itemId } = await context.params;
  const supabase = createAdminClient();
  const body = await request.json();

  const allowedFields = ["name", "starting_bid", "min_increment", "reserve_price", "sort_order"];
  const updates: Record<string, unknown> = {};

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      if (["starting_bid", "min_increment", "reserve_price"].includes(field)) {
        updates[field] = body[field] === "" || body[field] === null ? null : parseFloat(body[field]);
      } else {
        updates[field] = body[field];
      }
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("auction_items")
    .update(updates)
    .eq("id", itemId)
    .eq("auction_id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// DELETE /api/auctions/[id]/items/[itemId]
export async function DELETE(_request: Request, context: RouteContext) {
  const { id, itemId } = await context.params;
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("auction_items")
    .delete()
    .eq("id", itemId)
    .eq("auction_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
