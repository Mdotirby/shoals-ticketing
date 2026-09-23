/**
 * Link orders back to the Stripe charge that paid for them.
 *
 * 68 orders (~$9,463.81 of real money) carry no `stripe_payment_intent_id`.
 * The ledger rows exist and the totals reconcile, but those orders cannot be
 * traced to a charge, so any line-by-line audit against Stripe dead-ends and
 * they have to be excluded from charge-level checks.
 *
 * Stripe's charge metadata carries everything needed to find them again:
 * event_id, buyer_email and the exact total in cents — all written by our own
 * checkout. A match on all three is the same order beyond reasonable doubt.
 *
 * ── Safety ───────────────────────────────────────────────────────────────
 *   • Reads Stripe with STRIPE_LIVE_READONLY_KEY; the only write is setting
 *     `stripe_payment_intent_id` on an order where it is currently NULL.
 *   • A candidate is only used when the match is UNAMBIGUOUS IN BOTH
 *     DIRECTIONS — exactly one order for that charge and exactly one charge
 *     for that order. Anything else is reported and skipped.
 *   • Live charges only: refunded and failed charges are never linked,
 *     because that money never left Stripe.
 *   • DRY RUN by default. Pass --apply to write. Idempotent.
 *
 *   node plans/backfill-order-payment-intents.mjs          # report only
 *   node plans/backfill-order-payment-intents.mjs --apply  # write
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
const norm = (e) => String(e ?? "").trim().toLowerCase();

// ── Live charges ────────────────────────────────────────────────────────
const charges = [];
let sa;
for (;;) {
  const page = await stripe.charges.list({ limit: 100, ...(sa ? { starting_after: sa } : {}) });
  for (const c of page.data) {
    if (c.status !== "succeeded" || !c.paid || c.amount_refunded >= c.amount) continue;
    charges.push(c);
  }
  if (!page.has_more) break;
  sa = page.data[page.data.length - 1].id;
}

const { data: orders } = await db.from("orders").select("id, event_id, customer_email, total_amount, status, source, stripe_payment_intent_id, created_at, events(title)");
const alreadyLinked = new Set((orders ?? []).map((o) => o.stripe_payment_intent_id).filter(Boolean));

const unlinked = (orders ?? []).filter(
  (o) => !o.stripe_payment_intent_id && o.status === "paid" && Number(o.total_amount) > 0 && o.source !== "cash" && o.source !== "comp" && o.source !== "free",
);
const freeCharges = charges.filter((c) => !alreadyLinked.has(c.payment_intent || c.id));

console.log(`unlinked paid orders      : ${unlinked.length}  ${usd(unlinked.reduce((s, o) => s + Number(o.total_amount), 0))}`);
console.log(`charges not yet claimed   : ${freeCharges.length}  ${usd(freeCharges.reduce((s, c) => s + (c.amount - c.amount_refunded) / 100, 0))}\n`);

// ── Index both sides on event + email + exact cents ──────────────────────
const key = (eventId, email, cents) => `${eventId}|${norm(email)}|${cents}`;
const chargesByKey = new Map();
for (const c of freeCharges) {
  const k = key(c.metadata?.event_id ?? "", c.metadata?.buyer_email, c.amount - c.amount_refunded);
  if (!chargesByKey.has(k)) chargesByKey.set(k, []);
  chargesByKey.get(k).push(c);
}
const ordersByKey = new Map();
for (const o of unlinked) {
  const k = key(o.event_id ?? "", o.customer_email, Math.round(Number(o.total_amount) * 100));
  if (!ordersByKey.has(k)) ordersByKey.set(k, []);
  ordersByKey.get(k).push(o);
}

const matched = [];
const ambiguous = [];
const unmatched = [];
for (const [k, os] of ordersByKey) {
  const cs = chargesByKey.get(k) ?? [];
  if (cs.length === 1 && os.length === 1) matched.push({ order: os[0], charge: cs[0], how: "event+email+cents" });
  else if (cs.length === 0) unmatched.push(...os);
  else ambiguous.push({ k, orders: os.length, charges: cs.length, title: os[0].events?.title });
}

/**
 * Second pass, for orders whose email no longer agrees with the charge.
 * Several were edited after the sale — the order says fretwell6330@gmail.com
 * where Stripe recorded fretwel6330@, or collinj2022@gmail.com against
 * collinj2022@una.edu. The email moved; the money did not.
 *
 * So: same event, same amount TO THE CENT, and the charge within 24h of the
 * order. Still required to be unambiguous both ways.
 */
const claimed = new Set(matched.map((m) => m.charge.id));
const stillFree = freeCharges.filter((c) => !claimed.has(c.id));
const loose = (eventId, cents) => `${eventId}|${cents}`;
const chargesLoose = new Map();
for (const c of stillFree) {
  const k = loose(c.metadata?.event_id ?? "", c.amount - c.amount_refunded);
  if (!chargesLoose.has(k)) chargesLoose.set(k, []);
  chargesLoose.get(k).push(c);
}
const ordersLoose = new Map();
for (const o of unmatched) {
  const k = loose(o.event_id ?? "", Math.round(Number(o.total_amount) * 100));
  if (!ordersLoose.has(k)) ordersLoose.set(k, []);
  ordersLoose.get(k).push(o);
}
const stillUnmatched = [];
for (const [k, os] of ordersLoose) {
  const cs = chargesLoose.get(k) ?? [];
  if (cs.length === 1 && os.length === 1) {
    const hours = Math.abs(new Date(os[0].created_at).getTime() - cs[0].created * 1000) / 3.6e6;
    if (hours <= 24) { matched.push({ order: os[0], charge: cs[0], how: `event+cents, ${hours.toFixed(1)}h apart` }); continue; }
  }
  stillUnmatched.push(...os);
}
unmatched.length = 0;
unmatched.push(...stillUnmatched);

/**
 * Third pass, for charges carrying no event_id at all — several of the big
 * MSM table sales have empty event metadata, so neither pass above can key on
 * it. Fall back to buyer email plus the exact cents, still unambiguous both
 * ways. Same buyer, same amount to the penny: that is the charge.
 */
const claimed2 = new Set(matched.map((m) => m.charge.id));
const noMeta = freeCharges.filter((c) => !claimed2.has(c.id) && !c.metadata?.event_id);
const byEmailCents = new Map();
for (const c of noMeta) {
  const k = `${norm(c.metadata?.buyer_email || c.billing_details?.email)}|${c.amount - c.amount_refunded}`;
  if (!byEmailCents.has(k)) byEmailCents.set(k, []);
  byEmailCents.get(k).push(c);
}
const ordersEmailCents = new Map();
for (const o of unmatched) {
  const k = `${norm(o.customer_email)}|${Math.round(Number(o.total_amount) * 100)}`;
  if (!ordersEmailCents.has(k)) ordersEmailCents.set(k, []);
  ordersEmailCents.get(k).push(o);
}
const finalUnmatched = [];
for (const [k, os] of ordersEmailCents) {
  const cs = byEmailCents.get(k) ?? [];
  if (cs.length === 1 && os.length === 1) { matched.push({ order: os[0], charge: cs[0], how: "email+cents (charge had no event metadata)" }); continue; }
  finalUnmatched.push(...os);
}
unmatched.length = 0;
unmatched.push(...finalUnmatched);

console.log(`unambiguous matches       : ${matched.length}  ${usd(matched.reduce((s, m) => s + Number(m.order.total_amount), 0))}`);
console.log(`ambiguous (skipped)       : ${ambiguous.length} group(s)`);
ambiguous.forEach((a) => console.log(`   ${String(a.title).slice(0, 34).padEnd(35)} ${a.orders} order(s) ↔ ${a.charges} charge(s)`));
console.log(`no charge found (skipped) : ${unmatched.length}  ${usd(unmatched.reduce((s, o) => s + Number(o.total_amount), 0))}`);
unmatched.slice(0, 10).forEach((o) => console.log(`   ${o.created_at.slice(0, 10)} ${usd(o.total_amount).padStart(10)}  ${String(o.events?.title).slice(0, 30).padEnd(31)} ${o.customer_email ?? ""}`));

if (!APPLY) {
  console.log(`\nDRY RUN — nothing written. Re-run with --apply to link ${matched.length} order(s).`);
  matched.slice(0, 8).forEach((m) =>
    console.log(`   ${String(m.order.events?.title).slice(0, 30).padEnd(31)} ${usd(m.order.total_amount).padStart(10)}  →  ${m.charge.payment_intent}  [${m.how}]`));
  process.exit(0);
}

let ok = 0, failed = 0;
for (const m of matched) {
  const { error } = await db.from("orders").update({ stripe_payment_intent_id: m.charge.payment_intent }).eq("id", m.order.id).is("stripe_payment_intent_id", null);
  if (error) { failed++; console.error(`  FAILED ${m.order.id}: ${error.message}`); }
  else ok++;
}
console.log(`\nlinked: ${ok}   failed: ${failed}`);
