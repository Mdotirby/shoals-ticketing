import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/auctions/[id]/reports?type=item_report|all_bidders|winning_bidders|paid_by_cc|gross_receipts
export async function GET(request: Request, context: RouteContext) {
  const { id: auctionId } = await context.params;
  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);
  const reportType = searchParams.get("type") || "item_report";

  // Verify auction exists
  const { data: auction } = await supabase
    .from("auctions")
    .select("name, status, auction_close, venue_id")
    .eq("id", auctionId)
    .single();

  if (!auction) {
    return NextResponse.json({ error: "Auction not found" }, { status: 404 });
  }

  // Bidder reports only available after close
  const bidderReports = ["all_bidders", "winning_bidders", "paid_by_cc", "gross_receipts"];
  if (bidderReports.includes(reportType) && !["closed", "settled"].includes(auction.status)) {
    return NextResponse.json(
      { error: "This report is only available after the auction closes." },
      { status: 400 }
    );
  }

  // Fetch venue name separately
  let orgName = "Auction";
  if (auction.venue_id) {
    const { data: venue } = await supabase
      .from("venues")
      .select("name")
      .eq("id", auction.venue_id)
      .single();
    if (venue?.name) orgName = venue.name as string;
  }

  switch (reportType) {
    case "item_report":
      return await itemReport(supabase, auctionId, orgName, auction);
    case "all_bidders":
      return await allBiddersReport(supabase, auctionId, orgName, auction);
    case "winning_bidders":
      return await winningBiddersReport(supabase, auctionId, orgName, auction);
    case "paid_by_cc":
      return await paidByCCReport(supabase, auctionId, orgName, auction);
    case "gross_receipts":
      return await grossReceiptsReport(supabase, auctionId, orgName, auction);
    default:
      return NextResponse.json({ error: "Invalid report type" }, { status: 400 });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function itemReport(supabase: any, auctionId: string, orgName: string, auction: any) {
  const { data: items } = await supabase
    .from("auction_items")
    .select("name, starting_bid, min_increment, reserve_price")
    .eq("auction_id", auctionId)
    .order("sort_order", { ascending: true });

  return NextResponse.json({
    report_type: "item_report",
    title: "Item Report",
    org_name: orgName,
    auction_name: auction.name,
    auction_date: auction.auction_close,
    columns: [
      { key: "name", label: "Item Name" },
      { key: "starting_bid", label: "Starting Bid" },
      { key: "min_increment", label: "Min. Increment" },
      { key: "reserve_price", label: "Reserve Price" },
    ],
    rows: items || [],
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function allBiddersReport(supabase: any, auctionId: string, orgName: string, auction: any) {
  const { data: bidders } = await supabase
    .from("auction_bidders")
    .select("last_name, first_name, email, phone")
    .eq("auction_id", auctionId)
    .order("last_name", { ascending: true });

  return NextResponse.json({
    report_type: "all_bidders",
    title: "All Bidders Report",
    org_name: orgName,
    auction_name: auction.name,
    auction_date: auction.auction_close,
    columns: [
      { key: "last_name", label: "Last Name" },
      { key: "first_name", label: "First Name" },
      { key: "email", label: "Email" },
      { key: "phone", label: "Phone" },
    ],
    rows: bidders || [],
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function winningBiddersReport(supabase: any, auctionId: string, orgName: string, auction: any) {
  // Get all items with winners
  const { data: items } = await supabase
    .from("auction_items")
    .select("id, name, current_bid, current_winner_id, reserve_price")
    .eq("auction_id", auctionId)
    .not("current_winner_id", "is", null);

  if (!items || items.length === 0) {
    return NextResponse.json({
      report_type: "winning_bidders",
      title: "Winning Bidders Report",
      org_name: orgName,
      auction_name: auction.name,
      auction_date: auction.auction_close,
      columns: [],
      rows: [],
    });
  }

  // Get bidder details and order info
  const winnerIds = [...new Set(items.map((i: Record<string, unknown>) => i.current_winner_id))];
  const { data: bidders } = await supabase
    .from("auction_bidders")
    .select("id, first_name, last_name, email, phone")
    .in("id", winnerIds);

  // Get orders for payment info
  const { data: orders } = await supabase
    .from("auction_orders")
    .select("bidder_id, payment_method, status, grand_total")
    .eq("auction_id", auctionId)
    .in("bidder_id", winnerIds);

  const bidderMap = new Map((bidders || []).map((b: Record<string, unknown>) => [b.id, b]));
  const orderMap = new Map((orders || []).map((o: Record<string, unknown>) => [o.bidder_id, o]));

  // Build rows grouped by winner
  const winnerRows: Record<string, unknown>[] = [];
  const winnerItemMap = new Map<string, { items: string[]; total: number }>();

  for (const item of items) {
    // Skip items where reserve not met
    if (item.reserve_price && parseFloat(item.current_bid) < parseFloat(item.reserve_price)) {
      continue;
    }

    const winnerId = item.current_winner_id;
    if (!winnerItemMap.has(winnerId)) {
      winnerItemMap.set(winnerId, { items: [], total: 0 });
    }
    const entry = winnerItemMap.get(winnerId)!;
    entry.items.push(`${item.name} ($${parseFloat(item.current_bid).toFixed(2)})`);
    entry.total += parseFloat(item.current_bid);
  }

  for (const [winnerId, entry] of winnerItemMap.entries()) {
    const bidder = bidderMap.get(winnerId) as Record<string, unknown> | undefined;
    const order = orderMap.get(winnerId) as Record<string, unknown> | undefined;

    if (!bidder) continue;

    winnerRows.push({
      last_name: bidder.last_name,
      first_name: bidder.first_name,
      email: bidder.email,
      phone: bidder.phone,
      items_won: entry.items.join("; "),
      total_due: entry.total,
      paid_amount: order?.status === "paid" && order?.payment_method === "credit_debit"
        ? order.grand_total
        : null,
      payment_method: order?.payment_method || "—",
    });
  }

  // Sort by last name
  winnerRows.sort((a, b) =>
    String(a.last_name).localeCompare(String(b.last_name))
  );

  return NextResponse.json({
    report_type: "winning_bidders",
    title: "Winning Bidders Report",
    org_name: orgName,
    auction_name: auction.name,
    auction_date: auction.auction_close,
    columns: [
      { key: "last_name", label: "Last Name" },
      { key: "first_name", label: "First Name" },
      { key: "email", label: "Email" },
      { key: "phone", label: "Phone" },
      { key: "items_won", label: "Item(s) Won" },
      { key: "total_due", label: "Total Due" },
      { key: "paid_amount", label: "Paid (CC Only)" },
      { key: "payment_method", label: "Payment Method" },
    ],
    rows: winnerRows,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function paidByCCReport(supabase: any, auctionId: string, orgName: string, auction: any) {
  const { data: orders } = await supabase
    .from("auction_orders")
    .select("*, auction_bidders(first_name, last_name, email, phone)")
    .eq("auction_id", auctionId)
    .eq("payment_method", "credit_debit")
    .eq("status", "paid");

  const rows = (orders || []).map((o: Record<string, unknown>) => {
    const bidder = o.auction_bidders as Record<string, unknown>;
    return {
      last_name: bidder?.last_name,
      first_name: bidder?.first_name,
      email: bidder?.email,
      phone: bidder?.phone,
      transaction_timestamp: o.created_at,
      transaction_id: o.stripe_transaction_id || o.stripe_payment_intent_id || "—",
      amount_paid: o.grand_total,
    };
  });

  rows.sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
    String(a.last_name).localeCompare(String(b.last_name))
  );

  return NextResponse.json({
    report_type: "paid_by_cc",
    title: "Paid by CC Report",
    org_name: orgName,
    auction_name: auction.name,
    auction_date: auction.auction_close,
    columns: [
      { key: "last_name", label: "Last Name" },
      { key: "first_name", label: "First Name" },
      { key: "email", label: "Email" },
      { key: "phone", label: "Phone" },
      { key: "transaction_timestamp", label: "Timestamp" },
      { key: "transaction_id", label: "Transaction ID" },
      { key: "amount_paid", label: "Amount Paid" },
    ],
    rows,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function grossReceiptsReport(supabase: any, auctionId: string, orgName: string, auction: any) {
  const { data: items } = await supabase
    .from("auction_items")
    .select("id, name, starting_bid, current_bid, reserve_price")
    .eq("auction_id", auctionId)
    .order("sort_order", { ascending: true });

  // Get bid counts per item
  const rows = await Promise.all(
    (items || []).map(async (item: Record<string, unknown>) => {
      const { count } = await supabase
        .from("auction_bids")
        .select("id", { count: "exact", head: true })
        .eq("item_id", item.id as string);

      const reserveMet = !item.reserve_price ||
        (item.current_bid && (item.current_bid as number) >= (item.reserve_price as number));

      return {
        name: item.name,
        total_bids: count || 0,
        starting_bid: item.starting_bid,
        winning_price: reserveMet ? item.current_bid : "Reserve not met",
      };
    })
  );

  // Summary
  const totalReceipts = rows.reduce((sum: number, r: Record<string, unknown>) => {
    if (typeof r.winning_price === "number") return sum + r.winning_price;
    return sum;
  }, 0);

  return NextResponse.json({
    report_type: "gross_receipts",
    title: "Gross Receipts Report",
    org_name: orgName,
    auction_name: auction.name,
    auction_date: auction.auction_close,
    columns: [
      { key: "name", label: "Item Name" },
      { key: "total_bids", label: "Total Bids" },
      { key: "starting_bid", label: "Starting Bid" },
      { key: "winning_price", label: "Winning Price" },
    ],
    rows,
    summary: {
      total_items: rows.length,
      total_receipts: totalReceipts,
    },
  });
}
