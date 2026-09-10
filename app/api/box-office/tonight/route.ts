import { createAdminClient } from "@/lib/supabase-server";
import { requireCapability } from "@/lib/auth/can";
import { fetchAll } from "@/lib/supabase/fetchAll";
import { NextResponse } from "next/server";

/**
 * GET /api/box-office/tonight?event_id=…
 *
 * The door's running total, for the strip at the top of the POS. Card, cash
 * and comp counted apart, plus the last few sales so staff can see the one
 * they just took land.
 *
 * ── READS `orders`, NOT `settlement_ledger` — DELIBERATELY ─────────────────
 * Everywhere else revenue comes from the ledger (see § 4b and
 * /api/admin/dashboard). Not here. A card sale's ledger row is written by the
 * Stripe webhook, which arrives a beat after the reader says "approved". A
 * door total that lags the card in the customer's hand is worse than useless:
 * staff would reconcile a drawer against a number that had not caught up, and
 * the discrepancy would look like a missing sale.
 *
 * `orders` is written synchronously by both paths, so this is the immediate
 * truth. It is a DOOR COUNT, not a settlement figure — the two can disagree
 * for a few seconds and the ledger is the one that is authoritative at close.
 */
export async function GET(request: Request) {
  const guard = await requireCapability("door_sales_comps");
  if (!guard.ok) return guard.response;

  const eventId = new URL(request.url).searchParams.get("event_id");
  if (!eventId) {
    return NextResponse.json({ error: "event_id is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // fetchAll, not .limit(): PostgREST caps a response at 1000 rows and ignores
  // the limit you asked for. A sold-out night at a 1,400-cap room is one busy
  // show away from that, and this is the number staff reconcile a drawer
  // against — it must not quietly stop counting.
  const [orders, scannedRes, totalTicketsRes] = await Promise.all([
    fetchAll<{ id: string; customer_name: string | null; total_amount: number | null; quantity: number | null; source: string | null; created_at: string }>(
      admin
        .from("orders")
        .select("id, customer_name, total_amount, quantity, source, created_at")
        .eq("event_id", eventId)
        .eq("status", "paid")
        .order("created_at", { ascending: false })
    ),
    admin.from("tickets").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("is_scanned", true),
    admin.from("tickets").select("id", { count: "exact", head: true }).eq("event_id", eventId),
  ]);


  // A door sale is one taken on this device tonight. Online presales are the
  // same event but not the same drawer, so they are counted separately rather
  // than folded into a total the staff would then have to mentally subtract.
  const isCash = (s: string | null) => s === "cash" || s === "cash_sale" || s === "box_office_cash";
  const isDoorCard = (s: string | null) => s === "terminal" || s === "box_office";

  let cashCount = 0, cashAmount = 0, cashTickets = 0;
  let cardCount = 0, cardAmount = 0, cardTickets = 0;
  let compCount = 0, compTickets = 0;
  let onlineCount = 0, onlineAmount = 0, onlineTickets = 0;

  for (const o of orders) {
    const amt = Number(o.total_amount) || 0;
    const qty = Number(o.quantity) || 1;
    if (amt === 0) { compCount++; compTickets += qty; continue; }
    if (isCash(o.source)) { cashCount++; cashAmount += amt; cashTickets += qty; }
    else if (isDoorCard(o.source)) { cardCount++; cardAmount += amt; cardTickets += qty; }
    else { onlineCount++; onlineAmount += amt; onlineTickets += qty; }
  }

  const round = (n: number) => Math.round(n * 100) / 100;

  return NextResponse.json({
    cash: { orders: cashCount, amount: round(cashAmount), tickets: cashTickets },
    card: { orders: cardCount, amount: round(cardAmount), tickets: cardTickets },
    comp: { orders: compCount, tickets: compTickets },
    online: { orders: onlineCount, amount: round(onlineAmount), tickets: onlineTickets },
    doorTotal: round(cashAmount + cardAmount),
    doorTickets: cashTickets + cardTickets,
    // The drop: what the scanner and the auto-checked-in door sales have let in.
    scannedIn: scannedRes.count ?? 0,
    ticketsIssued: totalTicketsRes.count ?? 0,
    recent: orders.slice(0, 8).map((o) => ({
      id: o.id,
      name: o.customer_name || "Guest",
      amount: round(Number(o.total_amount) || 0),
      quantity: Number(o.quantity) || 1,
      tender: Number(o.total_amount) === 0 ? "comp" : isCash(o.source) ? "cash" : isDoorCard(o.source) ? "card" : "online",
      at: o.created_at,
    })),
  });
}
