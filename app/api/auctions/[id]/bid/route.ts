import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { Resend } from "resend";

type RouteContext = { params: Promise<{ id: string }> };

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "auction@venuecore.live";

// POST /api/auctions/[id]/bid — place a bid
export async function POST(request: Request, context: RouteContext) {
  const host = request.headers.get("host") || "";
  const { id: auctionId } = await context.params;
  const supabase = createAdminClient();
  const body = await request.json();

  const { item_id, bidder_id, amount } = body;

  if (!item_id || !bidder_id || !amount) {
    return NextResponse.json(
      { error: "item_id, bidder_id, and amount are required." },
      { status: 400 }
    );
  }

  const bidAmount = parseFloat(amount);

  // ── 1. Fetch auction (for status + anti-snipe config) ──
  const { data: auction, error: auctionErr } = await supabase
    .from("auctions")
    .select("*")
    .eq("id", auctionId)
    .single();

  if (auctionErr || !auction) {
    return NextResponse.json({ error: "Auction not found" }, { status: 404 });
  }

  // Check auction is open
  const now = new Date();
  const openTime = new Date(auction.auction_open);
  const closeTime = new Date(auction.auction_close);

  if (auction.status !== "open" && auction.status !== "published") {
    return NextResponse.json({ error: "Auction is not currently accepting bids." }, { status: 400 });
  }

  if (now < openTime) {
    return NextResponse.json({ error: "Auction has not started yet." }, { status: 400 });
  }

  if (now > closeTime) {
    return NextResponse.json({ error: "Auction has closed." }, { status: 400 });
  }

  // ── 2. Fetch item ──
  const { data: item, error: itemErr } = await supabase
    .from("auction_items")
    .select("*")
    .eq("id", item_id)
    .eq("auction_id", auctionId)
    .single();

  if (itemErr || !item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  // ── 3. Validate bid amount ──
  const currentBid = item.current_bid ? parseFloat(item.current_bid) : 0;
  const startingBid = parseFloat(item.starting_bid);
  const minIncrement = parseFloat(item.min_increment);

  // First bid must meet starting bid
  if (currentBid === 0 && bidAmount < startingBid) {
    return NextResponse.json(
      { error: `Bid must be at least $${startingBid.toFixed(2)}` },
      { status: 400 }
    );
  }

  // Subsequent bids must exceed current + min increment
  if (currentBid > 0 && bidAmount < currentBid + minIncrement) {
    return NextResponse.json(
      { error: `Bid must be at least $${(currentBid + minIncrement).toFixed(2)}` },
      { status: 400 }
    );
  }

  // Can't outbid yourself
  if (item.current_winner_id === bidder_id) {
    return NextResponse.json(
      { error: "You are already the highest bidder on this item." },
      { status: 400 }
    );
  }

  // ── 4. Record the previous winner for outbid notification ──
  const previousWinnerId = item.current_winner_id;

  // ── 5. Insert bid ──
  const { error: bidErr } = await supabase
    .from("auction_bids")
    .insert({
      item_id,
      bidder_id,
      amount: bidAmount,
    });

  if (bidErr) {
    return NextResponse.json({ error: bidErr.message }, { status: 500 });
  }

  // ── 6. Update item with new current_bid and winner ──
  const { error: updateErr } = await supabase
    .from("auction_items")
    .update({
      current_bid: bidAmount,
      current_winner_id: bidder_id,
    })
    .eq("id", item_id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // ── 7. Anti-sniping: extend auction close if bid within final N minutes ──
  let timeExtended = false;
  if (auction.anti_snipe_enabled) {
    const snipeWindow = (auction.anti_snipe_minutes || 2) * 60 * 1000; // ms
    const msUntilClose = closeTime.getTime() - now.getTime();

    if (msUntilClose > 0 && msUntilClose <= snipeWindow) {
      const newClose = new Date(closeTime.getTime() + snipeWindow);
      await supabase
        .from("auctions")
        .update({ auction_close: newClose.toISOString() })
        .eq("id", auctionId);
      timeExtended = true;
    }
  }

  // ── 8. Send outbid email to previous winner (fire-and-forget) ──
  if (previousWinnerId && previousWinnerId !== bidder_id && resend) {
    sendOutbidEmail(supabase, previousWinnerId, item, auctionId, auction.name, bidAmount, host).catch(
      (err) => console.error("Outbid email error:", err)
    );
  }

  // ── 9. Fetch new bidder info for response ──
  const { data: bidder } = await supabase
    .from("auction_bidders")
    .select("first_name, last_name")
    .eq("id", bidder_id)
    .single();

  return NextResponse.json({
    success: true,
    current_bid: bidAmount,
    current_winner_name: bidder
      ? `${bidder.first_name} ${bidder.last_name.charAt(0)}.`
      : null,
    time_extended: timeExtended,
  });
}

// ── Helper: send outbid notification email ──
async function sendOutbidEmail(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  previousWinnerId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  item: any,
  auctionId: string,
  auctionName: string,
  newBidAmount: number,
  host: string
) {
  if (!resend) return;

  const { data: prevBidder } = await supabase
    .from("auction_bidders")
    .select("first_name, last_name, email")
    .eq("id", previousWinnerId)
    .single();

  if (!prevBidder?.email) return;

  const { data: newWinner } = await supabase
    .from("auction_items")
    .select("current_winner_id")
    .eq("id", item.id)
    .single();

  // Get new winner's name
  let newWinnerName = "Someone";
  if (newWinner?.current_winner_id) {
    const { data: nw } = await supabase
      .from("auction_bidders")
      .select("first_name, last_name")
      .eq("id", newWinner.current_winner_id)
      .single();
    if (nw) newWinnerName = `${nw.first_name} ${nw.last_name.charAt(0)}.`;
  }

  const baseUrl = host ? `https://${host}` : (process.env.NEXT_PUBLIC_BASE_URL || "https://venuecore.live");
  const itemUrl = `${baseUrl}/auction/${auctionId}/items/${item.id}`;

  await resend.emails.send({
    from: FROM_EMAIL,
    to: prevBidder.email,
    subject: `You've been outbid on "${item.name}" — ${auctionName}`,
    html: `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:0;background:#0b0d1d;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b0d1d;padding:32px 0;">
    <tr><td align="center">
      <table width="500" cellpadding="0" cellspacing="0" style="max-width:500px;width:100%;background:#131629;border-radius:12px;border:1px solid rgba(208,194,144,0.15);">
        <tr><td style="background:#d0c290;padding:18px 24px;">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:2px;color:#0b0d1d;text-transform:uppercase;">VC Auction</p>
          <h1 style="margin:4px 0 0;font-size:20px;font-weight:800;color:#0b0d1d;">You've Been Outbid!</h1>
        </td></tr>
        <tr><td style="padding:24px;">
          <p style="color:rgba(255,255,255,0.7);font-size:15px;line-height:1.6;margin:0 0 16px;">
            Hey ${prevBidder.first_name},<br/><br/>
            <strong style="color:#d0c290;">${newWinnerName}</strong> just placed a bid of
            <strong style="color:#d0c290;">$${newBidAmount.toFixed(2)}</strong> on
            <strong style="color:#fff;">${item.name}</strong> at ${auctionName}.
          </p>
          <p style="color:rgba(255,255,255,0.5);font-size:14px;margin:0 0 24px;">
            Don't let it go — place a higher bid now!
          </p>
          <a href="${itemUrl}" style="display:inline-block;background:#d0c290;color:#0b0d1d;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">
            Bid Again
          </a>
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid rgba(255,255,255,0.05);">
          <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.3);text-align:center;">Powered by VenueCore</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
}
