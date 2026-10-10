import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { requireStaff, type AdminActor } from "@/lib/auth/can";
import { tenantScope, DENY } from "@/lib/auth/tenant";

type Admin = ReturnType<typeof createAdminClient>;

/** May this actor touch codes on this event? Its venue must be in their tenant. */
async function eventInScope(admin: Admin, actor: AdminActor, eventId: string): Promise<boolean> {
  const { data: ev } = await admin.from("events").select("venue_id").eq("id", eventId).maybeSingle();
  if (!ev) return false;
  const scope = tenantScope(actor, ev.venue_id);
  return scope !== DENY && (scope === null || scope === ev.venue_id);
}

/** The promo's event, when the actor may touch it; null otherwise. */
async function promoInScope(admin: Admin, actor: AdminActor, id: string): Promise<string | null> {
  const { data: promo } = await admin.from("promo_codes").select("event_id").eq("id", id).maybeSingle();
  if (!promo?.event_id) return null;
  return (await eventInScope(admin, actor, promo.event_id)) ? promo.event_id : null;
}

// GET /api/promo-codes?event_id=...
export async function GET(request: Request) {
  // Was unauthenticated: this lists every promo code and its discount, so
  // anyone could read them and use them. The storefront never calls it — it
  // calls /api/promo-codes/validate with a code the buyer already typed.
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("event_id");

  const admin = createAdminClient();

  let query = admin
    .from("promo_codes")
    .select("*")
    .order("created_at", { ascending: false });

  if (eventId) {
    if (!(await eventInScope(admin, guard.actor, eventId))) return NextResponse.json([]);
    query = query.eq("event_id", eventId);
  } else {
    // No event named: only codes on the actor's own tenant's events.
    const scope = tenantScope(guard.actor, null);
    if (scope === DENY) return NextResponse.json([]);
    if (scope !== null) {
      const { data: evs } = await admin.from("events").select("id").eq("venue_id", scope);
      query = query.in("event_id", (evs ?? []).map((e: { id: string }) => e.id));
    }
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

// POST /api/promo-codes
export async function POST(request: Request) {
  try {
    // Was unauthenticated: anyone could mint a discount code against any event.
    const guard = await requireStaff();
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const { event_id, code, discount_type, discount_value, max_uses, expires_at, starts_at, is_presale } = body;

    if (!event_id || !code || !discount_type || discount_value == null) {
      return NextResponse.json(
        { error: "event_id, code, discount_type, and discount_value are required" },
        { status: 400 }
      );
    }

    if (!["fixed", "percentage"].includes(discount_type)) {
      return NextResponse.json(
        { error: "discount_type must be 'fixed' or 'percentage'" },
        { status: 400 }
      );
    }

    if (discount_type === "percentage" && (discount_value < 0 || discount_value > 100)) {
      return NextResponse.json(
        { error: "Percentage discount must be between 0 and 100" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    if (!(await eventInScope(admin, guard.actor, event_id))) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const { data, error } = await admin
      .from("promo_codes")
      .insert({
        event_id,
        code: code.toUpperCase().trim(),
        discount_type,
        discount_value: parseFloat(discount_value),
        max_uses: max_uses ? parseInt(max_uses) : null,
        expires_at: expires_at || null,
        starts_at: starts_at || null,
        is_presale: !!is_presale,
        active: true,
        current_uses: 0,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A promo code with this name already exists for this event" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("Create promo code error:", err);
    return NextResponse.json({ error: "Failed to create promo code" }, { status: 500 });
  }
}

// PATCH /api/promo-codes?id=... — pause or resume a code: { active: boolean }
export async function PATCH(request: Request) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  if (typeof body.active !== "boolean") return NextResponse.json({ error: "active must be true or false" }, { status: 400 });

  const admin = createAdminClient();
  if (!(await promoInScope(admin, guard.actor, id))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await admin.from("promo_codes").update({ active: body.active }).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/promo-codes?id=...
export async function DELETE(request: Request) {
  // Had no guard at all: anyone with a code's id could delete it.
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!(await promoInScope(admin, guard.actor, id))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await admin.from("promo_codes").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
