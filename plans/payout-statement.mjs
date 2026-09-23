/**
 * What should hit the bank, per show — reconciled against the live Stripe account.
 *
 * Matt runs Stripe as a holding account and pays out MANUALLY, the night of
 * each show (see the payout-method note). The rule is:
 *
 *   payout per show = face value + service fee + facility fee   on CARD sales
 *
 * Stated that way it double-counts on box-office sales, where the service fee
 * is priced INTO the ticket: face already contains it, so adding it again
 * produced a payout LARGER than the money collected (Ace Monroe: $330.00 owed
 * on $328.50 taken). The same rule expressed without that trap is
 *
 *   payout = gross − sales tax − card surcharge
 *
 * — everything the buyer paid except the two things that stay behind. That is
 * identical to face + svc + fac when fees are added on top, and correct when
 * they are not. Both are printed so any divergence is visible rather than
 * silently resolved.
 *
 * and what stays behind in Stripe is: sales tax, the card surcharge less what
 * Stripe actually took, presales for shows that have not happened yet, and any
 * show that has not been paid out.
 *
 * Cash never enters Stripe, so it is excluded from the payout figure and
 * reported separately — it is already in the drawer. Comps and free claims are
 * $0 by definition. REFUNDED AND FAILED CHARGES ARE EXCLUDED THROUGHOUT: that
 * money never left Stripe, so it is not owed to anyone.
 *
 * Read-only. Reads Stripe with STRIPE_LIVE_READONLY_KEY, writes nothing.
 *
 *   node plans/payout-statement.mjs
 */
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import fs from "fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const stripe = new Stripe(env.STRIPE_LIVE_READONLY_KEY);
const usd = (n) => `$${(Number(n) || 0).toFixed(2)}`;
const pad = (s, n) => String(s).padStart(n);

// ── Live charges only ───────────────────────────────────────────────────
const live = new Map();
let sa;
for (;;) {
  const page = await stripe.charges.list({ limit: 100, expand: ["data.balance_transaction"], ...(sa ? { starting_after: sa } : {}) });
  for (const c of page.data) {
    if (c.status !== "succeeded" || !c.paid || c.amount_refunded >= c.amount) continue;
    const bt = c.balance_transaction && typeof c.balance_transaction === "object" ? c.balance_transaction : null;
    live.set(c.payment_intent || c.id, { amt: (c.amount - c.amount_refunded) / 100, fee: bt ? bt.fee / 100 : null });
  }
  if (!page.has_more) break;
  sa = page.data[page.data.length - 1].id;
}

// ── Ledger, orders, events ──────────────────────────────────────────────
const { data: orders } = await db.from("orders").select("id, event_id, source, status, stripe_payment_intent_id");
const { data: ledger } = await db.from("settlement_ledger")
  .select("order_id, event_id, type, gross_amount, ticket_revenue, ticketing_fee, facility_fee, tax_collected, stripe_fee, stripe_fee_actual");
const { data: events } = await db.from("events").select("id, title, date, closed_out_at");

const ordById = Object.fromEntries((orders ?? []).map((o) => [o.id, o]));
const evById = Object.fromEntries((events ?? []).map((e) => [e.id, e]));

const shows = {};
for (const r of ledger ?? []) {
  if (r.type !== "sale") continue;
  const o = ordById[r.order_id];
  if (!o || o.status !== "paid") continue;
  const ev = evById[r.event_id];
  if (!ev) continue;

  const s = (shows[r.event_id] ??= {
    title: ev.title, date: String(ev.date).slice(0, 10),
    face: 0, svc: 0, fac: 0, tax: 0, surcharge: 0, actualFee: 0,
    cardGross: 0, cash: 0, n: 0, unlinked: 0,
  });

  if (o.source === "comp" || o.source === "free") continue;
  if (o.source === "cash") { s.cash += Number(r.gross_amount) || 0; continue; }

  // Card money only counts when Stripe really has it.
  const ch = o.stripe_payment_intent_id ? live.get(o.stripe_payment_intent_id) : null;
  if (o.stripe_payment_intent_id && !ch) continue;          // refunded or failed
  if (!o.stripe_payment_intent_id) s.unlinked += Number(r.gross_amount) || 0;

  s.n++;
  s.face += Number(r.ticket_revenue) || 0;
  s.svc += Number(r.ticketing_fee) || 0;
  s.fac += Number(r.facility_fee) || 0;
  s.tax += Number(r.tax_collected) || 0;
  s.surcharge += Number(r.stripe_fee) || 0;
  s.actualFee += Number(r.stripe_fee_actual ?? r.stripe_fee) || 0;
  s.cardGross += Number(r.gross_amount) || 0;
}

const rows = Object.values(shows).sort((a, b) => a.date.localeCompare(b.date));
const today = new Date().toISOString().slice(0, 10);

console.log("PAYOUT PER SHOW — card money Stripe actually holds, less the tax and surcharge that stay behind\n");
console.log("date        show                              orders  card gross     face      svc      fac  |    PAYOUT    | tax held  card P/L");
console.log("-".repeat(140));
let T = { face: 0, svc: 0, fac: 0, tax: 0, payout: 0, gross: 0, sur: 0, fee: 0, cash: 0, unlinked: 0, drift: 0, unplayed: 0 };
for (const s of rows) {
  // Authoritative: what came in, less what stays behind.
  const payout = Math.round((s.cardGross - s.tax - s.surcharge) * 100) / 100;
  const naive = Math.round((s.face + s.svc + s.fac) * 100) / 100;
  const drift = Math.round((naive - payout) * 100) / 100;
  const cardPL = s.surcharge - s.actualFee;
  T.face += s.face; T.svc += s.svc; T.fac += s.fac; T.tax += s.tax;
  T.payout += payout; T.gross += s.cardGross; T.sur += s.surcharge; T.fee += s.actualFee;
  T.cash += s.cash; T.unlinked += s.unlinked;
  if (s.date > today) T.unplayed += payout;
  const future = s.date > today ? " (not played)" : "";
  if (Math.abs(drift) > 0.011) T.drift += drift;
  console.log(
    `${s.date}  ${s.title.slice(0, 32).padEnd(33)} ${pad(s.n, 5)} ${pad(usd(s.cardGross), 11)} ${pad(usd(s.face), 9)} ${pad(usd(s.svc), 8)} ${pad(usd(s.fac), 8)}  | ${pad(usd(payout), 11)} | ${pad(usd(s.tax), 8)} ${pad(usd(cardPL), 9)}${future}`,
  );
}
console.log("-".repeat(140));
console.log(`${"".padEnd(35)} ${pad(rows.reduce((n, s) => n + s.n, 0), 5)} ${pad(usd(T.gross), 11)} ${pad(usd(T.face), 9)} ${pad(usd(T.svc), 8)} ${pad(usd(T.fac), 8)}  | ${pad(usd(T.payout), 11)} | ${pad(usd(T.tax), 8)} ${pad(usd(T.sur - T.fee), 9)}`);

if (Math.abs(T.drift) > 0.011)
  console.log(`\n  NOTE: face + svc + fac overstates the payout by ${usd(T.drift)} in total — the box-office\n        sales where the service fee is priced into the face. The PAYOUT column is the true figure.`);

const played = T.payout - T.unplayed;
console.log(`\n── What should be sitting in Stripe ────────────────────────`);
console.log(`  sales tax held              ${pad(usd(T.tax), 12)}   until tax time`);
console.log(`  surcharge billed            ${pad(usd(T.sur), 12)}`);
console.log(`  Stripe's actual cut         ${pad(usd(-T.fee), 12)}   ${T.sur - T.fee < 0 ? "UNDER-RECOVERED by" : "surplus of"} ${usd(Math.abs(T.sur - T.fee))}`);
console.log(`  payouts for unplayed shows  ${pad(usd(T.unplayed), 12)}   presales — not owed until show night`);
console.log(`  ───────────────────────────────────────`);
const expected = T.tax + T.sur - T.fee + T.unplayed;
console.log(`  expected, if every played show has been paid out   ${pad(usd(expected), 12)}`);
console.log(`  payouts for shows already played                  ${pad(usd(played), 12)}   any still unpaid sits on top`);
if (T.cash) console.log(`\n  cash taken at the door      ${pad(usd(T.cash), 12)}   already in the drawer, never in Stripe`);
if (T.unlinked) console.log(`  included but unlinked       ${pad(usd(T.unlinked), 12)}   real money, no payment-intent recorded`);

const bal = await stripe.balance.retrieve();
const avail = bal.available.reduce((s, b) => s + b.amount, 0) / 100;
const pending = bal.pending.reduce((s, b) => s + b.amount, 0) / 100;
const actual = avail + pending;
console.log(`\n── Stripe says right now ───────────────────────────────────`);
console.log(`  available ${usd(avail)}   pending ${usd(pending)}   total ${usd(actual)}`);
const unexplained = actual - expected;
console.log(`\n  balance less the expected hold : ${usd(unexplained)}`);
console.log(`  That figure is the played shows not yet paid out, minus anything already`);
console.log(`  drawn against the balance. Reconcile it against the payout column above.`);
