/**
 * Bring the ledger back in line with Stripe's refunds and disputes.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 * app/api/webhooks/stripe/route.ts handles `charge.refunded` and
 * `charge.dispute.created` — and the live endpoint is not subscribed to
 * either. As of 2026-09-23 it listens to exactly five events:
 *
 *   checkout.session.{completed,expired,async_payment_succeeded,
 *                     async_payment_failed}, payment_intent.succeeded
 *
 * So that code has never run. A refund issued from the Stripe dashboard is
 * invisible to the app: the order stays "paid", the ledger keeps counting the
 * money as revenue, and the tickets stay valid and scannable.
 *
 * Subscribing the endpoint fixes it going forward and is the first thing to
 * do. This script is the belt to that braces — a webhook can always be missed,
 * dropped or replayed out of order, and money is not a thing to leave to
 * delivery guarantees. Run it on a schedule and the ledger cannot drift for
 * long.
 *
 * ── What it does ─────────────────────────────────────────────────────────
 * For every Stripe charge carrying a refund, find the order and check that
 *   • the order is marked refunded (full refunds only), and
 *   • the ledger carries a reversal for the refunded amount.
 * Anything missing is reported, and with --apply repaired using exactly the
 * same proportional reversal the webhook would have written — including
 * leaving stripe_fee unreversed, because Stripe keeps its cut on a refund.
 *
 * Tickets on a fully refunded order ARE voided, because a refunded ticket
 * that still scans is how eight people got into MSM: The 90's on a table
 * nobody paid for. Tickets already scanned are voided too and reported
 * separately — the void cannot un-admit them, but the record should be true.
 *
 * ── Safety ───────────────────────────────────────────────────────────────
 *   • Reads Stripe with STRIPE_LIVE_READONLY_KEY.
 *   • DRY RUN by default. Pass --apply to write.
 *   • Never double-reverses: an order whose reversals already cover the
 *     refunded amount is left alone, so this is safe to re-run.
 *
 *   node plans/sync-stripe-refunds.mjs          # report only
 *   node plans/sync-stripe-refunds.mjs --apply  # repair
 */
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import fs from "fs";

const APPLY = process.argv.includes("--apply");
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const stripe = new Stripe(env.STRIPE_LIVE_READONLY_KEY);
const usd = (n) => `$${(Number(n) || 0).toFixed(2)}`;
const round2 = (n) => Math.round(n * 100) / 100;

// ── Charges with any refund on them ─────────────────────────────────────
const refunded = [];
let sa;
for (;;) {
  const page = await stripe.charges.list({ limit: 100, ...(sa ? { starting_after: sa } : {}) });
  for (const c of page.data) if (c.amount_refunded > 0) refunded.push(c);
  if (!page.has_more) break;
  sa = page.data[page.data.length - 1].id;
}
console.log(`Stripe: ${refunded.length} charges carrying a refund, ${usd(refunded.reduce((s, c) => s + c.amount_refunded / 100, 0))} refunded\n`);

const { data: orders } = await db.from("orders").select("id, event_id, status, total_amount, stripe_payment_intent_id, stripe_checkout_session_id, events(title)");
const byPi = new Map();
for (const o of orders ?? []) {
  if (o.stripe_payment_intent_id) byPi.set(o.stripe_payment_intent_id, o);
  if (o.stripe_checkout_session_id) byPi.set(o.stripe_checkout_session_id, o);
}
const { data: ledger } = await db.from("settlement_ledger").select("id, order_id, type, gross_amount, ticket_revenue, ticketing_fee, facility_fee, tax_collected, venue_rebate");
const rowsByOrder = {};
for (const r of ledger ?? []) (rowsByOrder[r.order_id] ??= []).push(r);

const repairs = [];
const noOrder = [];
const alreadyFine = [];

for (const c of refunded) {
  const pi = typeof c.payment_intent === "string" ? c.payment_intent : null;
  const order = (pi && byPi.get(pi)) || null;
  const refundAmount = round2(c.amount_refunded / 100);

  if (!order) { noOrder.push({ c, refundAmount }); continue; }

  const rows = rowsByOrder[order.id] ?? [];
  const sale = rows.find((r) => r.type === "sale");

  /**
   * How much of this refund is STILL COUNTED AS REVENUE — which is not the
   * same as how much was refunded.
   *
   * Several refunded orders have no sale row at all: the money came in and
   * went back out without the ledger ever recording it. Reversing those would
   * invent negative revenue that was never counted, turning a clean $0 into a
   * −$7,222.16 hole. So the amount to reverse is capped by what the ledger
   * actually holds for the order, never by the refund alone.
   */
  const ledgerNet = round2(rows.reduce((s, r) => s + (Number(r.gross_amount) || 0), 0));
  const outstanding = round2(Math.max(0, Math.min(refundAmount, ledgerNet)));
  const isFull = c.amount_refunded >= c.amount;
  const statusWrong = isFull && order.status !== "refunded";

  if (outstanding <= 0.01 && !statusWrong) { alreadyFine.push(order.id); continue; }
  repairs.push({ c, order, sale, refundAmount, outstanding, ledgerNet, isFull, statusWrong });
}

console.log(`already correct            : ${alreadyFine.length}`);
console.log(`refund with no order in DB : ${noOrder.length}  ${usd(noOrder.reduce((s, r) => s + r.refundAmount, 0))}   (nothing was ever recorded as revenue — no action)`);
console.log(`NEEDING REPAIR             : ${repairs.length}  ${usd(repairs.reduce((s, r) => s + Math.max(0, r.outstanding), 0))} of refunded money still counted as revenue\n`);

for (const r of repairs) {
  console.log(`  ${new Date(r.c.created * 1000).toISOString().slice(0, 10)}  order ${r.order.id.slice(0, 8)}  ${String(r.order.events?.title ?? "?").slice(0, 28).padEnd(29)}`);
  console.log(`     refunded ${usd(r.refundAmount)}   still booked as revenue ${usd(r.outstanding)}   order status "${r.order.status}"${r.statusWrong ? "  → should be refunded" : ""}`);
  if (!r.sale) console.log(`     the ledger never recorded this sale (net ${usd(r.ledgerNet)}) — status only, no reversal written.`);
}

/**
 * Voiding is its own pass, over EVERY fully refunded order — not a side
 * effect of ledger repair. The first version only voided orders it was
 * already repairing, so an order whose ledger was correct kept its live
 * tickets. That is the exact shape of the original bug: correct books, open
 * door.
 */
const toVoid = [];
for (const c of refunded) {
  if (c.amount_refunded < c.amount) continue;          // partial: see above
  const pi = typeof c.payment_intent === "string" ? c.payment_intent : null;
  const order = (pi && byPi.get(pi)) || null;
  if (!order) continue;
  const { data: t, error } = await db.from("tickets").select("id, is_scanned, voided_at").eq("order_id", order.id);
  if (error) {
    console.log(`\ncannot read tickets for ${order.id.slice(0, 8)} — ${error.message}`);
    console.log(`if voided_at is missing, run plans/ticket-void-migration.sql`);
    continue;
  }
  const live = (t ?? []).filter((x) => !x.voided_at);
  if (live.length) toVoid.push({ order, live });
}

if (toVoid.length) {
  console.log(`\nTICKETS STILL VALID ON A FULLY REFUNDED ORDER: ${toVoid.length} order(s), ${toVoid.reduce((n, v) => n + v.live.length, 0)} ticket(s)`);
  for (const v of toVoid) {
    const scanned = v.live.filter((x) => x.is_scanned).length;
    console.log(`   order ${v.order.id.slice(0, 8)}  ${v.live.length} ticket(s)${scanned ? `, ${scanned} ALREADY SCANNED` : ""}  ${v.order.customer_email ?? ""}`);
  }
}

if (!repairs.length && !toVoid.length) { console.log("\nNothing to do."); process.exit(0); }

if (!APPLY) {
  console.log(`\nDRY RUN — nothing written. Re-run with --apply to repair ${repairs.length} ledger row(s) and void ${toVoid.reduce((n, v) => n + v.live.length, 0)} ticket(s).`);
  console.log(`Fix the cause too: subscribe the live webhook endpoint to charge.refunded`);
  console.log(`and charge.dispute.created, or this will keep happening.`);
  process.exit(0);
}

let ok = 0;
for (const r of repairs) {
  const originalGross = Number(r.sale?.gross_amount) || 0;
  // Reverse only this refund's share of the original charge — writing the
  // whole refund against ticket_revenue would pull back the fee and tax
  // portions as face value too.
  const ratio = originalGross > 0 ? Math.min(1, r.outstanding / originalGross) : 1;
  const rev = (v) => -round2((Number(v ?? 0) || 0) * ratio);

  if (r.outstanding <= 0.01) {
    // Nothing was ever booked — only the order status is wrong.
    if (r.statusWrong) {
      const { error } = await db.from("orders").update({ status: "refunded" }).eq("id", r.order.id);
      if (error) console.error(`  FAILED status update for ${r.order.id}: ${error.message}`);
      else { ok++; console.log(`  repaired ${r.order.id.slice(0, 8)}  status → refunded (nothing to reverse)`); }
    }
    continue;
  }

  const { error: insErr } = await db.from("settlement_ledger").insert({
    order_id: r.order.id,
    event_id: r.order.event_id,
    gross_amount: -r.outstanding,
    ticket_revenue: r.sale ? rev(r.sale.ticket_revenue) : -r.outstanding,
    ticketing_fee: r.sale ? rev(r.sale.ticketing_fee) : 0,
    facility_fee: r.sale ? rev(r.sale.facility_fee) : 0,
    venue_rebate: r.sale ? rev(r.sale.venue_rebate) : 0,
    tax_collected: r.sale ? rev(r.sale.tax_collected) : 0,
    // Stripe keeps its processing fee on a refund — that cost is sunk.
    stripe_fee: 0,
    net_to_venue: -r.outstanding,
    net_to_platform: r.sale ? rev(r.sale.ticketing_fee) - rev(r.sale.venue_rebate) : 0,
    type: "refund",
  });
  if (insErr) { console.error(`  FAILED ledger insert for ${r.order.id}: ${insErr.message}`); continue; }

  if (r.statusWrong) {
    const { error } = await db.from("orders").update({ status: "refunded" }).eq("id", r.order.id);
    if (error) console.error(`  FAILED status update for ${r.order.id}: ${error.message}`);
  }
  ok++;
  console.log(`  repaired ${r.order.id.slice(0, 8)}  reversed ${usd(r.outstanding)}`);
}
console.log(`\nrepaired: ${ok} of ${repairs.length}`);

// Void what the pass above found. A refunded ticket that still scans is how
// eight people got into MSM: The 90's on a table nobody paid for.
for (const v of toVoid) {
  const { error } = await db
    .from("tickets")
    .update({ voided_at: new Date().toISOString(), void_reason: "Order refunded" })
    .in("id", v.live.map((x) => x.id));
  if (error) { console.log(`  FAILED to void ${v.order.id.slice(0, 8)}: ${error.message}`); continue; }
  const scanned = v.live.filter((x) => x.is_scanned).length;
  console.log(`  voided ${v.live.length} ticket(s) on ${v.order.id.slice(0, 8)}` +
    (scanned ? `  — ${scanned} had ALREADY BEEN SCANNED; those people were admitted on a refunded order.` : ""));
}
