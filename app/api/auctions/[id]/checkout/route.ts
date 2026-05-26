import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { getStripe } from "@/lib/stripe";

type RouteContext = { params: Promise<{ id: string }> };

// POST /api/auctions/[id]/checkout — create order and optionally Stripe session
export async function POST(request: Request, context: RouteContext) {
  const { id: auctionId } = await context.params;
  const supabase = createAdminClient();
  const body = await request.json();

  const { bidder_id, payment_method } = body;

  if (!bidder_id || !payment_method) {
    return NextResponse.json(
      { error: "bidder_id and payment_method are required." },
      { status: 400 }
    );
  }

  if (!["cash", "check", "credit_debit"].includes(payment_method)) {
    return NextResponse.json(
      { error: "payment_method must be cash, check, or credit_debit." },
      { status: 400 }
    );
  }

  // ── 1. Verify auction is closed ──
  const { data: auction } = await supabase
    .from("auctions")
    .select("*")
    .eq("id", auctionId)
    .single();

  if (!auction) {
    return NextResponse.json({ error: "Auction not found" }, { status: 404 });
  }

  if (auction.status !== "closed" && auction.status !== "settled") {
    return NextResponse.json(
      { error: "Auction must be closed before checkout." },
      { status: 400 }
    );
  }

  // ── 2. Check for existing order ──
  const { data: existingOrder } = await supabase
    .from("auction_orders")
    .select("*")
    .eq("auction_id", auctionId)
    .eq("bidder_id", bidder_id)
    .single();

  if (existingOrder && existingOrder.status === "paid") {
    return NextResponse.json(
      { error: "You have already completed checkout for this auction." },
      { status: 400 }
    );
  }

  // ── 3. Find all items this bidder won ──
  const { data: wonItems } = await supabase
    .from("auction_items")
    .select("id, name, current_bid")
    .eq("auction_id", auctionId)
    .eq("current_winner_id", bidder_id);

  if (!wonItems || wonItems.length === 0) {
    return NextResponse.json(
      { error: "You did not win any items in this auction." },
      { status: 400 }
    );
  }

  // Check reserve prices — only include items where reserve was met
  const { data: allItems } = await supabase
    .from("auction_items")
    .select("id, reserve_price, current_bid")
    .eq("auction_id", auctionId)
    .eq("current_winner_id", bidder_id);

  const qualifiedItems = (allItems || []).filter((item: Record<string, unknown>) => {
    if (!item.reserve_price) return true;
    return (item.current_bid as number) >= (item.reserve_price as number);
  });

  const wonItemIds = new Set(qualifiedItems.map((i: Record<string, unknown>) => i.id));
  const filteredWonItems = wonItems.filter((i) => wonItemIds.has(i.id));

  if (filteredWonItems.length === 0) {
    return NextResponse.json(
      { error: "All items you won had reserves that were not met." },
      { status: 400 }
    );
  }

  // ── 4. Calculate totals ──
  const totalAmount = filteredWonItems.reduce(
    (sum, item) => sum + parseFloat(String(item.current_bid)),
    0
  );

  // Processing fee: Stripe ~2.9% + $0.30 per transaction (only for CC)
  const processingFee =
    payment_method === "credit_debit"
      ? Math.round((totalAmount * 0.029 + 0.3) * 100) / 100
      : 0;

  const grandTotal = Math.round((totalAmount + processingFee) * 100) / 100;

  // ── 5. Create or update order ──
  let orderId: string;

  if (existingOrder) {
    // Update existing pending order
    const { error: updateErr } = await supabase
      .from("auction_orders")
      .update({
        total_amount: totalAmount,
        processing_fee: processingFee,
        grand_total: grandTotal,
        payment_method,
        status: payment_method === "credit_debit" ? "pending" : "pending_offline",
      })
      .eq("id", existingOrder.id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    orderId = existingOrder.id;

    // Clear existing line items and re-insert
    await supabase.from("auction_order_items").delete().eq("order_id", orderId);
  } else {
    const { data: newOrder, error: orderErr } = await supabase
      .from("auction_orders")
      .insert({
        auction_id: auctionId,
        bidder_id,
        total_amount: totalAmount,
        processing_fee: processingFee,
        grand_total: grandTotal,
        payment_method,
        status: payment_method === "credit_debit" ? "pending" : "pending_offline",
      })
      .select()
      .single();

    if (orderErr || !newOrder) {
      return NextResponse.json({ error: orderErr?.message || "Failed to create order" }, { status: 500 });
    }

    orderId = newOrder.id;
  }

  // Insert order line items
  const lineItems = filteredWonItems.map((item) => ({
    order_id: orderId,
    item_id: item.id,
    winning_price: parseFloat(String(item.current_bid)),
  }));

  await supabase.from("auction_order_items").insert(lineItems);

  // ── 6. For cash/check, mark as pending_offline and return ──
  if (payment_method !== "credit_debit") {
    return NextResponse.json({
      order_id: orderId,
      total_amount: totalAmount,
      processing_fee: 0,
      grand_total: totalAmount,
      payment_method,
      status: "pending_offline",
      items: filteredWonItems,
    });
  }

  // ── 7. For CC, create Stripe Checkout Session ──
  const stripe = getStripe();

  // Get bidder info for Stripe
  const { data: bidder } = await supabase
    .from("auction_bidders")
    .select("first_name, last_name, email")
    .eq("id", bidder_id)
    .single();

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://venuecore.live";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: bidder?.email,
    line_items: [
      ...filteredWonItems.map((item) => ({
        price_data: {
          currency: "usd",
          product_data: {
            name: item.name,
            description: `Auction: ${auction.name}`,
          },
          unit_amount: Math.round(parseFloat(String(item.current_bid)) * 100),
        },
        quantity: 1,
      })),
      ...(processingFee > 0
        ? [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: "Processing Fee",
                  description: "Credit/Debit card processing fee",
                },
                unit_amount: Math.round(processingFee * 100),
              },
              quantity: 1,
            },
          ]
        : []),
    ],
    metadata: {
      auction_order_id: orderId,
      auction_id: auctionId,
      bidder_id,
      type: "auction",
    },
    // embedded mode uses return_url, NOT success_url/cancel_url
    ui_mode: "embedded",
    return_url: `${baseUrl}/auction/${auctionId}/checkout?session_id={CHECKOUT_SESSION_ID}&order=${orderId}`,
  });

  // Store the session id on the order for webhook lookup
  await supabase
    .from("auction_orders")
    .update({ stripe_payment_intent_id: session.id })
    .eq("id", orderId);

  return NextResponse.json({
    order_id: orderId,
    clientSecret: session.client_secret,
    total_amount: totalAmount,
    processing_fee: processingFee,
    grand_total: grandTotal,
    payment_method,
    items: filteredWonItems,
  });
}
