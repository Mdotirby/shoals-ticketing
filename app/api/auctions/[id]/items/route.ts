import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { v4 as uuidv4 } from "uuid";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/auctions/[id]/items — list all items for an auction
// Optional ?bidder_id=xxx to return only items the bidder has bid on
export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);
  const bidderId = searchParams.get("bidder_id");

  // Use correct FK constraint name from migration: fk_auction_items_winner
  const { data, error } = await supabase
    .from("auction_items")
    .select("*, auction_bidders!fk_auction_items_winner(first_name, last_name)")
    .eq("auction_id", id)
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Flatten winner name and get bid counts (+ optional my_highest_bid)
  const items = await Promise.all(
    (data || []).map(async (item: Record<string, unknown>) => {
      const [{ count }, bidderBid] = await Promise.all([
        supabase
          .from("auction_bids")
          .select("id", { count: "exact", head: true })
          .eq("item_id", item.id as string),
        bidderId
          ? supabase
              .from("auction_bids")
              .select("amount")
              .eq("item_id", item.id as string)
              .eq("bidder_id", bidderId)
              .order("amount", { ascending: false })
              .limit(1)
          : Promise.resolve({ data: null }),
      ]);

      const winner = item.auction_bidders as Record<string, unknown> | null;
      return {
        ...item,
        current_winner_name: winner
          ? `${winner.first_name} ${(winner.last_name as string).charAt(0)}.`
          : null,
        bid_count: count || 0,
        my_highest_bid: bidderBid.data?.[0]?.amount ?? null,
        auction_bidders: undefined,
      };
    })
  );

  // If bidder_id filter requested, only return items the bidder has bid on
  if (bidderId) {
    return NextResponse.json(items.filter((i) => i.my_highest_bid !== null));
  }

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
