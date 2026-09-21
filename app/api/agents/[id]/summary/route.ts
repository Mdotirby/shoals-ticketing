import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/can";
import { createAdminClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/agents/[id]/summary — the agent detail panel (agents.dc.html).
 *
 * The shows an agent booked are the ones they're assigned to plus the ones
 * whose offer names them (by email, or by name and agency when the offer has
 * no email). Their roster is the artists on those offers. Gross is each
 * show's settlement_ledger total, the same source settlements and the
 * dashboard read. Settle time is days from show to finalized settlement.
 *
 * No rebates: agents aren't paid one, whatever the mockup shows.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const admin = createAdminClient();

  const { data: agent } = await admin.from("agents").select("*").eq("id", id).single();
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  const email = (agent.agent_email || agent.email || "").trim();
  const offerCols = "id, artist_name, event_date, status, event_id, guarantee, deal_type";
  const [byEmail, byName, assignments] = await Promise.all([
    email
      ? admin.from("artist_offers").select(offerCols).ilike("agent_email", email)
      : Promise.resolve({ data: [] as never[] }),
    admin
      .from("artist_offers")
      .select(offerCols)
      .eq("agent_name", agent.agent_name ?? "")
      .eq("agency", agent.agency ?? ""),
    admin.from("agent_assignments").select("event_id").eq("agent_id", id),
  ]);

  type Offer = { id: string; artist_name: string | null; event_date: string | null; status: string; event_id: string | null; guarantee: number | null; deal_type: string | null };
  const offers = new Map<string, Offer>();
  for (const o of [...((byEmail.data ?? []) as Offer[]), ...((byName.data ?? []) as Offer[])]) offers.set(o.id, o);

  const eventIds = [
    ...new Set([
      ...[...offers.values()].map((o) => o.event_id).filter((x): x is string => !!x),
      ...((assignments.data ?? []) as { event_id: string }[]).map((a) => a.event_id),
    ]),
  ];

  const [eventsRes, ledgerRes, settleRes] = eventIds.length
    ? await Promise.all([
        admin.from("events").select("id, title, date, booking_status, status").in("id", eventIds),
        admin.from("settlement_ledger").select("event_id, gross_amount").in("event_id", eventIds),
        admin.from("settlements").select("event_id, status, finalized_at, event_date").in("event_id", eventIds),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const gross = new Map<string, number>();
  for (const l of (ledgerRes.data ?? []) as { event_id: string; gross_amount: number | null }[]) {
    gross.set(l.event_id, (gross.get(l.event_id) ?? 0) + (Number(l.gross_amount) || 0));
  }
  const settlement = new Map(
    ((settleRes.data ?? []) as { event_id: string; status: string; finalized_at: string | null; event_date: string | null }[]).map((s) => [s.event_id, s])
  );

  type ShowRow = { event_id: string | null; title: string; date: string; state: string; artist: string | null; guarantee: number | null; gross: number };
  const shows: ShowRow[] = ((eventsRes.data ?? []) as { id: string; title: string; date: string; booking_status: string | null; status: string | null }[])
    .map((e): ShowRow => {
      const s = settlement.get(e.id);
      const offer = [...offers.values()].find((o) => o.event_id === e.id);
      const past = new Date(e.date).getTime() < Date.now();
      const state =
        e.booking_status === "cancelled"
          ? "Cancelled"
          : s?.status === "finalized"
          ? "Settled"
          : past
          ? "Played · settling"
          : e.status === "published"
          ? "On sale"
          : e.booking_status === "hold"
          ? "Hold"
          : "Confirmed";
      return {
        event_id: e.id,
        title: e.title,
        date: e.date,
        state,
        artist: offer?.artist_name ?? null,
        guarantee: offer?.guarantee ?? null,
        gross: Math.round((gross.get(e.id) ?? 0) * 100) / 100,
      };
    })
    .concat(
      // A countersigned offer is a booked show even when nobody linked it to
      // an event yet — most older offers aren't — so it still counts.
      [...offers.values()]
        .filter((o) => o.status === "accepted" && !o.event_id)
        .map((o): ShowRow => ({
          event_id: null,
          title: o.artist_name ?? "Offer",
          date: o.event_date ?? "",
          state: "Booked · no event linked",
          artist: o.artist_name,
          guarantee: o.guarantee,
          gross: 0,
        }))
    )
    .sort((a, b) => b.date.localeCompare(a.date));

  const settleDays = [...settlement.values()]
    .filter((s) => s.status === "finalized" && s.finalized_at && s.event_date)
    .map((s) => (new Date(s.finalized_at!).getTime() - new Date(s.event_date!).getTime()) / 86400000)
    .filter((d) => d >= 0);

  const roster = [...new Set([...offers.values()].map((o) => o.artist_name?.trim()).filter((x): x is string => !!x))].sort();
  const firstShow = shows.length ? shows[shows.length - 1].date || null : null;

  return NextResponse.json({
    roster,
    shows,
    offers: [...offers.values()].sort((a, b) => (b.event_date ?? "").localeCompare(a.event_date ?? "")),
    stats: {
      showsBooked: shows.length,
      grossBooked: Math.round(shows.reduce((t, s) => t + s.gross, 0) * 100) / 100,
      avgSettleDays: settleDays.length ? Math.round(settleDays.reduce((a, b) => a + b, 0) / settleDays.length) : null,
      firstShow,
    },
    portalAccess: !!agent.user_id,
  });
}
