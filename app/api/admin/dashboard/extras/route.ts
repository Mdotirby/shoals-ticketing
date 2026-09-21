import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/can";
import { createAdminClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/dashboard/extras?venue_id=…
 *
 * The Command Center sections from handoff/screens/dashboard.dc.html that
 * the main dashboard route doesn't carry:
 *
 *  nights     next 14 days on the books — shows and rentals — with sold
 *             against the tiers' capacity, gross from settlement_ledger, and
 *             the deal from the countersigned offer when there is one
 *  aging      open invoice balances bucketed by days past due
 *  ancillary  month to date: merch splits from settlements and fees
 *             retained from the ledger
 *
 * Deliberately not here: the mockup's "Money in motion" (earned-unbilled,
 * banked, deposit lag) and bar / concession revenue. Nothing in the system
 * records those yet, and a money screen that estimates them would be worse
 * than one that leaves them out.
 */
export async function GET(request: Request) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  if (guard.actor.role === "artist") return NextResponse.json({ error: "Not available" }, { status: 403 });

  const venueId = new URL(request.url).searchParams.get("venue_id");
  const admin = createAdminClient();
  const now = new Date();
  const in14 = new Date(now.getTime() + 14 * 86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // ── Next 14 nights ──
  let evQ = admin
    .from("events")
    .select("id, title, date, event_type, booking_status, venue")
    .gte("date", now.toISOString().slice(0, 10))
    .lte("date", in14.toISOString())
    .neq("booking_status", "cancelled")
    .order("date", { ascending: true });
  if (venueId) evQ = evQ.eq("venue_id", venueId);
  const { data: events } = await evQ;
  const ids = (events ?? []).map((e) => e.id);

  const [tiersRes, ticketsRes, ledgerRes, offersRes] = ids.length
    ? await Promise.all([
        admin.from("ticket_tiers").select("event_id, capacity").in("event_id", ids),
        admin.from("tickets").select("event_id, orders!inner(status, source)").in("event_id", ids),
        admin.from("settlement_ledger").select("event_id, gross_amount").in("event_id", ids),
        admin.from("artist_offers").select("event_id, guarantee, deal_type, backend_percentage, status").in("event_id", ids).eq("status", "accepted"),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const sum = <T,>(rows: T[] | null, key: (r: T) => string, val: (r: T) => number) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) m.set(key(r), (m.get(key(r)) ?? 0) + val(r));
    return m;
  };
  const cap = sum(tiersRes.data as { event_id: string; capacity: number | null }[], (r) => r.event_id, (r) => Number(r.capacity) || 0);
  const sold = sum(
    ((ticketsRes.data ?? []) as { event_id: string; orders: { status: string; source: string | null } | { status: string; source: string | null }[] }[]).filter((t) => {
      const o = Array.isArray(t.orders) ? t.orders[0] : t.orders;
      return o?.status === "paid" && o?.source !== "comp";
    }),
    (r) => r.event_id,
    () => 1
  );
  const gross = sum(ledgerRes.data as { event_id: string; gross_amount: number | null }[], (r) => r.event_id, (r) => Number(r.gross_amount) || 0);
  const deal = new Map(((offersRes.data ?? []) as { event_id: string; guarantee: number | null; deal_type: string | null; backend_percentage: number | null }[]).map((o) => [o.event_id, o]));

  const nights = (events ?? []).map((e) => {
    const c = cap.get(e.id) ?? 0;
    const s = sold.get(e.id) ?? 0;
    const o = deal.get(e.id);
    const dealText = o
      ? [
          o.guarantee ? `$${Math.round(Number(o.guarantee)).toLocaleString()} gtd` : null,
          (o.deal_type ?? "").toUpperCase() === "FLAT" ? "flat" : o.backend_percentage ? `vs ${o.backend_percentage}%` : null,
        ]
          .filter(Boolean)
          .join(" ")
      : null;
    return {
      id: e.id,
      title: e.title,
      date: e.date,
      kind: e.event_type === "private" ? "Rental" : e.booking_status === "hold" ? "Hold" : "Show",
      venue: e.venue,
      deal: dealText,
      sold: s,
      capacity: c,
      pace: c > 0 ? Math.round((s / c) * 100) : null,
      gross: Math.round((gross.get(e.id) ?? 0) * 100) / 100,
    };
  });

  // ── Receivables aging ──
  let invQ = admin.from("invoices").select("balance_due, due_date, status").gt("balance_due", 0);
  if (venueId) invQ = invQ.eq("venue_id", venueId);
  const { data: invoices } = await invQ;
  const buckets = [
    { label: "Current", min: -Infinity, max: 0, value: 0 },
    { label: "1–30", min: 1, max: 30, value: 0 },
    { label: "31–60", min: 31, max: 60, value: 0 },
    { label: "61–90", min: 61, max: 90, value: 0 },
    { label: "90+", min: 91, max: Infinity, value: 0 },
  ];
  for (const inv of (invoices ?? []) as { balance_due: number; due_date: string | null; status: string | null }[]) {
    if (inv.status === "void" || inv.status === "paid") continue;
    const late = inv.due_date ? Math.floor((now.getTime() - new Date(`${inv.due_date.slice(0, 10)}T12:00:00`).getTime()) / 86400000) : 0;
    const b = buckets.find((x) => late >= x.min && late <= x.max) ?? buckets[0];
    b.value += Number(inv.balance_due) || 0;
  }

  // ── Ancillary, month to date ──
  let setQ = admin.from("settlements").select("merch_venue_share, event_date, venue_id").gte("event_date", monthStart.slice(0, 10));
  if (venueId) setQ = setQ.eq("venue_id", venueId);
  let ledQ = admin.from("settlement_ledger").select("ticketing_fee, facility_fee").gte("created_at", monthStart);
  if (venueId) ledQ = ledQ.eq("venue_id", venueId);
  const [{ data: settlementsMtd }, { data: ledgerMtd }] = await Promise.all([setQ, ledQ]);
  const merch = (settlementsMtd ?? []).reduce((t, s) => t + (Number(s.merch_venue_share) || 0), 0);
  const fees = (ledgerMtd ?? []).reduce((t, l) => t + (Number(l.ticketing_fee) || 0) + (Number(l.facility_fee) || 0), 0);

  const r2 = (n: number) => Math.round(n * 100) / 100;
  return NextResponse.json({
    nights,
    aging: buckets.map((b) => ({ label: b.label, value: r2(b.value) })),
    ancillary: {
      merchSplits: r2(merch),
      merchEvents: (settlementsMtd ?? []).filter((s) => Number(s.merch_venue_share) > 0).length,
      feesRetained: r2(fees),
    },
  });
}
