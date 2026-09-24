/**
 * Repair scaling rows whose sub-total is not face + fees.
 *
 * ── What is wrong ────────────────────────────────────────────────────────
 * An offer's adjusted gross is
 *
 *     adj_gross = Σ(price × cap) − Σ((ticketing_fee + facility_fee) × cap)
 *
 * which is only face value when `price` really is face plus those two fees.
 * Three offers carry a tier where it is not — the ticketing fee was never
 * entered — so the formula reads fee money as FACE and inflates the pool the
 * artist's backend percentage is measured against:
 *
 *     Sunny Sweeney        $24.00 = $20.00 + $0.00 + (nothing)   → $4.00/tkt
 *     The Band of Heathens $38.50 = $32.50 + $3.00 + (nothing)   → $3.00/tkt
 *     Jed Harrelson        $26.00 = $18.99 + $3.00 + $3.00       → $1.01/tkt
 *
 * The first two are unambiguous: the gap is exactly the missing ticketing
 * fee. Jed Harrelson's $1.01 is not — it is neither a round fee nor a card
 * surcharge on $18.99 — so this script leaves it alone and says so. Guessing
 * there would move a real split basis on a guess.
 *
 * All three are drafts, and the builder recomputes these figures live, so
 * simply OPENING one and saving it rewrites adj_gross to the inflated number.
 * Sunny Sweeney's stored $10,400 is correct today and would become $12,480.
 *
 * ── What it does ─────────────────────────────────────────────────────────
 * Sets the missing ticketing_fee, then recomputes the stored adj_gross,
 * net_potential, tax_amount and splitpoint exactly as the builder does.
 *
 * Dry run by default. Pass --apply to write.
 *
 *   node plans/fix-offer-scaling-gaps.mjs
 *   node plans/fix-offer-scaling-gaps.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const APPLY = process.argv.includes("--apply");
const usd = (n) => `$${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const r2 = (n) => Math.round(n * 100) / 100;

/** The builder's own arithmetic, so stored and displayed cannot drift. */
function derive(offer, scaling) {
  const gross = scaling.reduce((s, r) => s + (Number(r.sellable_cap) || 0) * (Number(r.price) || 0), 0);
  const fees = scaling.reduce((s, r) => s + ((Number(r.ticketing_fee) || 0) + (Number(r.facility_fee) || 0)) * (Number(r.sellable_cap) || 0), 0);
  const adj = gross - fees;
  const raw = Number(offer.tax_rate) || 0;
  const pct = raw > 0 && raw < 1 ? raw * 100 : raw;
  const dec = pct / 100;
  const method = offer.tax_method || "multiplier";
  let net, tax;
  if (method === "divisor") {
    net = r2(adj / (1 + dec));
    tax = r2(adj - net);
  } else {
    tax = r2(adj * dec);
    net = adj;
  }
  const fixed = (Array.isArray(offer.fixed_expenses) ? offer.fixed_expenses : []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const variable = (Array.isArray(offer.variable_expenses) ? offer.variable_expenses : []).reduce((s, e) => s + (Number(e.rate) || 0) * gross, 0);
  return { gross, fees, adj, tax, net, splitpoint: net - (fixed + variable) };
}

const { data, error } = await db.from("artist_offers")
  .select("id, artist_name, status, tax_rate, tax_method, ticket_scaling, gross_potential, adj_gross, net_potential, tax_amount, splitpoint, fixed_expenses, variable_expenses");
if (error) { console.error(error); process.exit(1); }

let repaired = 0, skipped = 0;
for (const o of data) {
  const scaling = Array.isArray(o.ticket_scaling) ? o.ticket_scaling : [];
  if (!scaling.length) continue;

  const gaps = scaling
    .map((r, i) => ({ i, r, gap: r2((Number(r.price) || 0) - (Number(r.net_price) || 0) - (Number(r.ticketing_fee) || 0) - (Number(r.facility_fee) || 0)) }))
    .filter((x) => Math.abs(x.gap) > 0.005 && (Number(x.r.sellable_cap) || 0) > 0);
  if (!gaps.length) continue;

  // Only close a gap that is plainly the absent ticketing fee: the column is
  // empty and the difference is positive. Anything else is a judgement call.
  const inferable = gaps.every((x) => x.gap > 0 && (x.r.ticketing_fee === null || x.r.ticketing_fee === undefined || Number(x.r.ticketing_fee) === 0));

  const before = derive(o, scaling);
  console.log(`\n── ${o.artist_name} [${o.status}]`);
  for (const { r, gap } of gaps) {
    console.log(`   ${r.name}: price ${usd(r.price)} − face ${usd(r.net_price)} − fees ${usd((Number(r.ticketing_fee) || 0) + (Number(r.facility_fee) || 0))} = ${usd(gap)}/ticket × ${r.sellable_cap} = ${usd(gap * (Number(r.sellable_cap) || 0))}`);
  }

  if (!inferable) {
    skipped++;
    console.log(`   SKIPPED — the gap is not simply a missing ticketing fee. Left untouched.`);
    console.log(`   stored adj_gross ${usd(o.adj_gross)} · face value would be ${usd(before.adj - gaps.reduce((s, x) => s + x.gap * (Number(x.r.sellable_cap) || 0), 0))}`);
    continue;
  }

  const fixed = scaling.map((r, i) => {
    const hit = gaps.find((x) => x.i === i);
    return hit ? { ...r, ticketing_fee: r2((Number(r.ticketing_fee) || 0) + hit.gap) } : r;
  });
  const after = derive(o, fixed);

  console.log(`   ticketing_fee ${gaps.map((x) => `${x.r.name} → ${usd((Number(x.r.ticketing_fee) || 0) + x.gap)}`).join(", ")}`);
  console.log(`   adj_gross     ${usd(o.adj_gross)} stored · ${usd(before.adj)} as the builder would recompute it today · ${usd(after.adj)} after`);
  console.log(`   net_potential ${usd(o.net_potential)} stored → ${usd(after.net)}`);
  console.log(`   splitpoint    ${usd(o.splitpoint)} stored → ${usd(after.splitpoint)}`);

  if (APPLY) {
    const { error: upErr } = await db.from("artist_offers").update({
      ticket_scaling: fixed,
      gross_potential: after.gross,
      adj_gross: after.adj,
      net_potential: after.net,
      tax_amount: after.tax,
      splitpoint: after.splitpoint,
    }).eq("id", o.id);
    if (upErr) { console.log(`   WRITE FAILED: ${upErr.message}`); continue; }
    console.log(`   written`);
  }
  repaired++;
}

console.log(`\n${repaired} offer(s) ${APPLY ? "repaired" : "would be repaired"}, ${skipped} skipped as not inferable.`);
if (!APPLY) console.log("Dry run — nothing was written. Re-run with --apply.");
