import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// GET: list sponsors
// ?event_id=   → sponsors assigned to a specific event (via junction table)
// ?homepage=1  → sponsors with display_on_homepage=true (any event assignment allowed)
// ?global=1    → sponsors with no event assignments
export async function GET(request: Request) {
  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const eventId  = searchParams.get("event_id");
  const homepage = searchParams.get("homepage");
  const global   = searchParams.get("global");

  // Detect whether the migration has run by checking for sponsor_name column.
  // Fall back to the legacy `name` column if not yet migrated.
  const { error: colCheck } = await admin
    .from("sponsors")
    .select("sponsor_name")
    .limit(0);

  const migrated = !colCheck; // no error = sponsor_name column exists
  const nameCol  = migrated ? "sponsor_name" : "name";

  // Build base query — omit sponsor_events join if migration hasn't run yet
  let query = admin
    .from("sponsors")
    .select(migrated ? "*, sponsor_events(event_id)" : "*")
    .eq("is_active", true)
    .order("tier", { ascending: true })
    .order(nameCol, { ascending: true });

  if (homepage) {
    query = query.eq("display_on_homepage", true);
  } else if (eventId && migrated) {
    const { data: seRows } = await admin
      .from("sponsor_events")
      .select("sponsor_id")
      .eq("event_id", eventId);
    const ids = seRows?.map(r => r.sponsor_id) ?? [];
    if (ids.length === 0) return NextResponse.json([], { status: 200 });
    query = query.in("id", ids);
  } else if (global && migrated) {
    const { data: assignedRows } = await admin
      .from("sponsor_events")
      .select("sponsor_id");
    const assignedIds = [...new Set(assignedRows?.map(r => r.sponsor_id) ?? [])];
    if (assignedIds.length > 0) {
      query = query.not("id", "in", `(${assignedIds.join(",")})`);
    }
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Normalise: always expose sponsor_name + event_ids regardless of migration state
  const sponsors = (data ?? []).map((row: Record<string, unknown>) => {
    const seRows = (row.sponsor_events ?? []) as { event_id: string }[];
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { sponsor_events, name, ...rest } = row as Record<string, unknown> & { name?: string; sponsor_events?: unknown };
    return {
      ...rest,
      sponsor_name: (rest.sponsor_name as string) || name || "",
      event_ids: seRows.map(se => se.event_id),
    };
  });

  return NextResponse.json(sponsors, { status: 200 });
}

// POST: create a sponsor
export async function POST(request: Request) {
  const admin = createAdminClient();
  const body = await request.json();

  const { data, error } = await admin
    .from("sponsors")
    .insert({
      sponsor_name:        body.sponsor_name,
      client_name:         body.client_name      || null,
      sponsor_address:     body.sponsor_address  || null,
      logo_url:            body.logo_url         || null,
      website_url:         body.website_url      || null,
      tier:                body.tier             || "supporting",
      bio:                 body.bio              || null,
      display_on_homepage: body.display_on_homepage ?? false,
      is_active:           body.is_active        ?? true,
      contact_name:        body.contact_name     || null,
      contact_email:       body.contact_email    || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const eventIds: string[] = body.event_ids ?? [];
  if (eventIds.length > 0 && data) {
    await admin.from("sponsor_events").insert(
      eventIds.map(eid => ({ sponsor_id: data.id, event_id: eid }))
    );
  }

  return NextResponse.json({ ...data, event_ids: eventIds }, { status: 201 });
}
