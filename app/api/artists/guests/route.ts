import { createAdminClient } from "@/lib/supabase-server";
import { getAdminActor, requireCapability, type AdminActor } from "@/lib/auth/can";
import { tenantScope, DENY } from "@/lib/auth/tenant";
import { NextResponse } from "next/server";

/**
 * Guest list for a show (guest_list rows). An entry belongs to whoever added
 * it — `artist_id` is that person's admin_users id: an artist's own list, or
 * a staff member adding a house guest.
 *
 * Who may do what:
 *   • Staff may read and change any show in their own tenant.
 *   • An artist may read, add and remove only entries on their own list.
 *   • Nobody else — GET, POST and DELETE were all open to the world, so
 *     anyone with a show's id could read its guest names or delete them.
 */

type Admin = ReturnType<typeof createAdminClient>;
type Who = { actor: AdminActor; artist: boolean };

/** `read` also admits read-only staff, who may see the list but not change it. */
async function who(read = false): Promise<Who | NextResponse> {
  const actor = await getAdminActor();
  if (!actor) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const artist = actor.resolved.external === "artist";
  const staff = !!actor.resolved.level || (read && actor.resolved.readOnly);
  if (!staff && !artist) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  return { actor, artist };
}

/** Staff: the show's venue must be in their tenant. Artists are scoped by row instead. */
async function eventOk(admin: Admin, w: Who, eventId: string): Promise<boolean> {
  if (w.artist) return true;
  const { data: ev } = await admin.from("events").select("venue_id").eq("id", eventId).maybeSingle();
  if (!ev) return false;
  const scope = tenantScope(w.actor, ev.venue_id);
  return scope !== DENY && (scope === null || scope === ev.venue_id);
}

/** The row, when this actor may change it. */
async function rowOk(admin: Admin, w: Who, id: string): Promise<{ event_id: string; artist_id: string } | null> {
  const { data: row } = await admin.from("guest_list").select("event_id, artist_id").eq("id", id).maybeSingle();
  if (!row) return null;
  if (w.artist) return row.artist_id === w.actor.id ? row : null;
  return (await eventOk(admin, w, row.event_id)) ? row : null;
}

// GET ?event_id=…[&artist_id=…] — the show's list. Each entry says whether it
// is on an artist's list or the house list, by the role of whoever added it.
export async function GET(request: Request) {
  const w = await who(true);
  if (w instanceof NextResponse) return w;

  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("event_id");
  // An artist only ever sees their own list, whatever they asked for.
  const artistId = w.artist ? w.actor.id : searchParams.get("artist_id");

  if (!eventId) {
    return NextResponse.json({ error: "event_id is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!(await eventOk(admin, w, eventId))) return NextResponse.json([]);

  // Tolerates the check-in columns not existing yet
  // (plans/guest-list-checkin-migration.sql is hand-run like every migration
  // here). Without them the list still loads and the door just cannot mark
  // anyone in — the same shape /api/events/[id]/holds uses for its own
  // pending table.
  const build = (cols: string) => {
    let q = admin.from("guest_list").select(cols).eq("event_id", eventId).order("created_at");
    if (artistId) q = q.eq("artist_id", artistId);
    return q;
  };

  let { data, error } = await build(
    "id, first_name, last_name, quantity, notes, artist_id, checked_in_at, created_at"
  );

  if (error && /checked_in_at|column .* does not exist/i.test(error.message)) {
    const fallback = await build("id, first_name, last_name, quantity, notes, artist_id, created_at");
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data || []) as unknown as Array<{ artist_id: string | null }>;
  const ids = [...new Set(rows.map((r) => r.artist_id).filter(Boolean))] as string[];
  const { data: people } = ids.length
    ? await admin.from("admin_users").select("id, role, first_name, last_name").in("id", ids)
    : { data: [] as Array<{ id: string; role: string; first_name: string | null; last_name: string | null }> };
  const byId = new Map((people ?? []).map((p) => [p.id, p]));

  return NextResponse.json(
    rows.map((r) => {
      const p = r.artist_id ? byId.get(r.artist_id) : undefined;
      return {
        ...r,
        list: p?.role === "artist" ? "artist" : "house",
        added_by: p ? [p.first_name, p.last_name].filter(Boolean).join(" ") || null : null,
      };
    }),
  );
}

/**
 * PATCH: check a guest in at the door, or undo it.
 *
 * Body: { id, checked_in: boolean }
 *
 * Gated on `door_sales_comps` — the same capability that lets someone sell at
 * the door and issue comps, which is exactly who is standing at the list.
 * Marking someone in is not a read.
 */
export async function PATCH(request: Request) {
  const guard = await requireCapability("door_sales_comps", { write: true });
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const { id, checked_in } = body as { id?: string; checked_in?: boolean };

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!(await rowOk(admin, { actor: guard.actor, artist: false }, id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data, error } = await admin
    .from("guest_list")
    .update({
      checked_in_at: checked_in === false ? null : new Date().toISOString(),
      checked_in_by: checked_in === false ? null : guard.actor.id,
    })
    .eq("id", id)
    .select("id, first_name, last_name, quantity, checked_in_at")
    .single();

  if (error) {
    if (/checked_in_at|column .* does not exist/i.test(error.message)) {
      return NextResponse.json(
        { error: "Guest check-in isn't set up yet — run plans/guest-list-checkin-migration.sql first." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST: add a guest. Staff add to the house list (or, naming an artist_id,
// to that artist's); an artist always adds to their own.
export async function POST(request: Request) {
  const w = await who();
  if (w instanceof NextResponse) return w;

  const body = await request.json();
  const { event_id, first_name, last_name, quantity, notes } = body;
  const artist_id = w.artist ? w.actor.id : body.artist_id || w.actor.id;

  // One name is enough — a band's "+1" or a sponsor's company has no surname.
  if (!event_id || !String(first_name ?? "").trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!(await eventOk(admin, w, event_id))) return NextResponse.json({ error: "Show not found" }, { status: 404 });

  const { data, error } = await admin
    .from("guest_list")
    .insert({
      event_id,
      artist_id,
      first_name: String(first_name).trim(),
      last_name: String(last_name ?? "").trim(),
      quantity: Math.max(1, parseInt(quantity) || 1),
      notes: typeof notes === "string" && notes.trim() ? notes.trim() : null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

// PUT: edit a guest — { id, first_name?, last_name?, quantity?, notes? }.
export async function PUT(request: Request) {
  const w = await who();
  if (w instanceof NextResponse) return w;

  const body = await request.json();
  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const admin = createAdminClient();
  if (!(await rowOk(admin, w, body.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updates: Record<string, unknown> = {};
  if (typeof body.first_name === "string" && body.first_name.trim()) updates.first_name = body.first_name.trim();
  if (typeof body.last_name === "string") updates.last_name = body.last_name.trim();
  if (body.quantity !== undefined) updates.quantity = Math.max(1, parseInt(body.quantity) || 1);
  if (body.notes !== undefined) updates.notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
  if (!Object.keys(updates).length) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });

  const { data, error } = await admin.from("guest_list").update(updates).eq("id", body.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE ?id=… — remove a guest.
export async function DELETE(request: Request) {
  const w = await who();
  if (w instanceof NextResponse) return w;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!(await rowOk(admin, w, id))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await admin
    .from("guest_list")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
