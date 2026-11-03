import { NextResponse } from "next/server";
import { requireCapability, type AdminActor } from "@/lib/auth/can";
import { actorName } from "@/lib/auth/actor-name";
import { writeAudit } from "@/lib/auth/audit";
import { eventInScope } from "@/lib/contacts/access";
import { countedCents, drawerVariance, type DenominationCounts } from "@/lib/pos/drawer";
import { createAdminClient } from "@/lib/supabase-server";

type Admin = ReturnType<typeof createAdminClient>;
const CASH_SOURCES = ["cash", "cash_sale", "box_office_cash"];

/** The show's paid cash sales, in cents. A voided sale isn't paid, so it's out. */
async function cashSalesCents(admin: Admin, eventId: string): Promise<number> {
  const { data } = await admin
    .from("orders")
    .select("total_amount")
    .eq("event_id", eventId)
    .eq("status", "paid")
    .in("source", CASH_SOURCES);
  return (data ?? []).reduce((sum, o) => sum + Math.round((Number(o.total_amount) || 0) * 100), 0);
}

async function guarded(request: Request, write: boolean) {
  const guard = await requireCapability("door_sales_comps", { write });
  if (!guard.ok) return { response: guard.response };
  const admin = createAdminClient();
  const eventId = new URL(request.url).searchParams.get("event_id");
  if (!eventId) return { response: NextResponse.json({ error: "event_id is required" }, { status: 400 }) };
  if (!(await eventInScope(admin, guard.actor, eventId))) {
    return { response: NextResponse.json({ error: "Event not found" }, { status: 404 }) };
  }
  return { admin, eventId, actor: guard.actor as AdminActor };
}

// GET /api/box-office/drawer?event_id=
export async function GET(request: Request) {
  const g = await guarded(request, false);
  if (g.response) return g.response;
  const { data, error } = await g.admin.from("box_office_drawers").select("*").eq("event_id", g.eventId).maybeSingle();
  return NextResponse.json({
    migrated: !error,
    drawer: data ?? null,
    cashSalesCents: await cashSalesCents(g.admin, g.eventId),
  });
}

// PUT /api/box-office/drawer?event_id= — { floatCents, counts, note, close? }
export async function PUT(request: Request) {
  const g = await guarded(request, true);
  if (g.response) return g.response;
  const body = await request.json().catch(() => ({}));

  const floatCents = Math.max(0, Math.round(Number(body.floatCents) || 0));
  const counts: DenominationCounts = body.counts && typeof body.counts === "object" ? body.counts : {};
  const note = String(body.note ?? "").trim();
  const close = body.close === true;

  // The server works it out, so a screen left open can't save a stale expected figure.
  const counted = countedCents(counts);
  const { expected, variance, matches } = drawerVariance(floatCents, await cashSalesCents(g.admin, g.eventId), counted);
  if (!matches && !note) {
    return NextResponse.json({ error: "Add a note, since the count doesn't match." }, { status: 400 });
  }

  const name = await actorName(g.actor).catch(() => null);
  const now = new Date().toISOString();
  const { data, error } = await g.admin
    .from("box_office_drawers")
    .upsert({
      event_id: g.eventId,
      opening_float: floatCents / 100,
      denominations: counts,
      counted: counted / 100,
      expected: expected / 100,
      variance: variance / 100,
      note: note || null,
      counted_by: name,
      counted_at: now,
      closed_by: close ? name : null,
      closed_at: close ? now : null,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error) {
    const missing = /box_office_drawers/i.test(error.message);
    return NextResponse.json(
      { error: missing ? "Run plans/box-office-drawer-migration.sql, then save again." : error.message },
      { status: 500 },
    );
  }

  await writeAudit(g.actor, {
    action: close ? "drawer.closed" : "drawer.counted",
    targetType: "event",
    targetId: g.eventId,
    detail: { counted: counted / 100, expected: expected / 100, variance: variance / 100, note: note || null },
  });
  return NextResponse.json({ drawer: data });
}
