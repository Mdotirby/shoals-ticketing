import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { v4 as uuidv4 } from "uuid";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/auctions/[id]/items — list all items for an auction
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("auction_items")
    .select("*, auction_bidders!auction_items_current_winner_id_fkey(first_name, last_name)")
    .eq("auction_id", id)
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Flatten winner name and get bid counts
  const items = await Promise.all(
    (data || []).map(async (item: Record<string, unknown>) => {
      // Count bids for this item
      const { count } = await supabase
        .from("auction_bids")
        .select("id", { count: "exact", head: true })
        .eq("item_id", item.id as string);

      const winner = item.auction_bidders as Record<string, unknown> | null;
      return {
        ...item,
        current_winner_name: winner
          ? `${winner.first_name} ${(winner.last_name as string).charAt(0)}.`
          : null,
        bid_count: count || 0,
        auction_bidders: undefined,
      };
    })
  );

  return NextResponse.json(items);
}

// POST /api/auctions/[id]/items — create one or more items
export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const supabase = createAdminClient();
  const body = await request.json();

  // Support single item or array of items
  const itemsInput = Array.isArray(body) ? body : [body];

  // Get current max sort_order
  const { data: existing } = await supabase
    .from("auction_items")
    .select("sort_order")
    .eq("auction_id", id)
    .order("sort_order", { ascending: false })
    .limit(1);

  let nextSort = (existing?.[0]?.sort_order ?? -1) + 1;

  const rows = itemsInput.map((item) => ({
    auction_id: id,
    name: item.name,
    starting_bid: parseFloat(item.starting_bid),
    min_increment: parseFloat(item.min_increment),
    reserve_price: item.reserve_price ? parseFloat(item.reserve_price) : null,
    qr_code: uuidv4(),
    sort_order: nextSort++,
  }));

  const { data, error } = await supabase
    .from("auction_items")
    .insert(rows)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
