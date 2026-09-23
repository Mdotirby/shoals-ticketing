/**
 * Backfill settlement_ledger with what Stripe ACTUALLY deducted.
 *
 * ── Why ──────────────────────────────────────────────────────────────────
 * The webhook has code to enrich each ledger row with the charge's balance
 * transaction (fetchActualStripeCost in app/api/webhooks/stripe/route.ts), but
 * of 985 sale rows only 12 carry a non-zero `stripe_fee_actual`. Everything
 * else falls back to `stripe_fee`, which is the SURCHARGE WE BILLED THE BUYER,
 * not Stripe's cut.
 *
 * Those are different numbers and the gap is systematic: sales before the
 * 2026-08-14 rate cutover were billed at 2.7% while Stripe charged 2.9%, so
 * the platform under-recovered. Measured 2026-09-23: estimate $1,948.42 vs
 * actual $2,118.47 across 724 linked charges — settlement was 8% light on card
 * cost, every show.
 *
 * ── What it writes ───────────────────────────────────────────────────────
 *   stripe_fee_actual            what Stripe deducted (balance_transaction.fee)
 *   stripe_net                   what Stripe credited
 *   stripe_balance_transaction_id the independent record it came from
 *   net_to_venue                 re-based from the billed surcharge onto the
 *                                real cost — EXACTLY the swap the webhook
 *                                already does for new rows, so rows written
 *                                before and after mean the same thing.
 *
 * `stripe_fee` (the billed surcharge) is deliberately left alone. It is a real
 * figure and the difference between the two is the under-recovery.
 *
 * ── Safety ───────────────────────────────────────────────────────────────
 *   • Reads Stripe with STRIPE_LIVE_READONLY_KEY.
 *   • DRY RUN by default. Pass --apply to write.
 *   • Only touches rows where the charge SUCCEEDED and was not fully
 *     refunded, and only where stripe_fee_actual is null or zero.
 *   • Idempotent: re-running after a successful pass changes nothing.
 *
 *   node plans/backfill-stripe-actual-fees.mjs          # report only
 *   node plans/backfill-stripe-actual-fees.mjs --apply  # write
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

// ── Every live charge, keyed by payment intent ──────────────────────────
const byPi = new Map();
let sa;
for (;;) {
  const page = await stripe.charges.list({ limit: 100, expand: ["data.balance_transaction"], ...(sa ? { starting_after: sa } : {}) });
  for (const c of page.data) {
    if (c.status !== "succeeded" || !c.paid) continue;
    if (c.amount_refunded >= c.amount) continue;         // refunded money never left Stripe
    const bt = c.balance_transaction && typeof c.balance_transaction === "object" ? c.balance_transaction : null;
    if (!bt) continue;
    byPi.set(c.payment_intent || c.id, { fee: bt.fee / 100, net: bt.net / 100, id: bt.id });
  }
  if (!page.has_more) break;
  sa = page.data[page.data.length - 1].id;
}
console.log(`Stripe: ${byPi.size} live charges with a balance transaction`);

// ── Ledger rows that still lack the real figure ─────────────────────────
const { data: orders } = await db.from("orders").select("id, stripe_payment_intent_id, events(title)");
const ordById = Object.fromEntries((orders ?? []).map((o) => [o.id, o]));
const { data: rows } = await db
  .from("settlement_ledger")
  .select("id, order_id, type, gross_amount, stripe_fee, stripe_fee_actual, net_to_venue");

const todo = [];
for (const r of rows ?? []) {
  if (r.type !== "sale") continue;
  if (r.stripe_fee_actual != null && Number(r.stripe_fee_actual) > 0) continue;   // already done
  const o = ordById[r.order_id];
  if (!o?.stripe_payment_intent_id) continue;
  const ch = byPi.get(o.stripe_payment_intent_id);
  if (!ch) continue;
  const billed = Number(r.stripe_fee) || 0;
  todo.push({
    row: r,
    title: o.events?.title ?? "?",
    fee: ch.fee,
    net: ch.net,
    btId: ch.id,
    newNet: round2(Number(r.net_to_venue || 0) + billed - ch.fee),
    delta: round2(billed - ch.fee),
  });
}

const totalBilled = todo.reduce((s, t) => s + (Number(t.row.stripe_fee) || 0), 0);
const totalActual = todo.reduce((s, t) => s + t.fee, 0);
console.log(`\nrows to backfill      : ${todo.length}`);
console.log(`surcharge billed      : ${usd(totalBilled)}`);
console.log(`Stripe actually took  : ${usd(totalActual)}`);
console.log(`under-recovered       : ${usd(totalActual - totalBilled)}`);
console.log(`net_to_venue moves by : ${usd(todo.reduce((s, t) => s + t.delta, 0))}\n`);

if (!APPLY) {
  console.log("DRY RUN — nothing written. Re-run with --apply to write.");
  todo.slice(0, 8).forEach((t) =>
    console.log(`   ${t.title.slice(0, 30).padEnd(31)} billed ${usd(t.row.stripe_fee).padStart(8)}  actual ${usd(t.fee).padStart(8)}  net ${usd(t.row.net_to_venue)} → ${usd(t.newNet)}`));
  process.exit(0);
}

let ok = 0, failed = 0;
for (const t of todo) {
  const { error } = await db
    .from("settlement_ledger")
    .update({
      stripe_fee_actual: t.fee,
      stripe_net: t.net,
      stripe_balance_transaction_id: t.btId,
      net_to_venue: t.newNet,
    })
    .eq("id", t.row.id);
  if (error) { failed++; console.error(`  FAILED row ${t.row.id}: ${error.message}`); }
  else ok++;
}
console.log(`written: ${ok}   failed: ${failed}`);
