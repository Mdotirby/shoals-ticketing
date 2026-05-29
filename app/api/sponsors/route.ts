import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// GET: list sponsors
// ?event_id=   → sponsors assigned to a specific event
// ?homepage=1  → sponsors with display_on_homepage=true
// ?global=1    → sponsors with no event assignments
export async function GET(request: Request) {
  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const eventId  = searchParams.get("event_id");
  const homepage = searchParams.get("homepage");
  const global   = searchParams.get("global");

  // Plain select — no join, avoids Supabase TypeScript parse errors on
  // relationship strings when generated types may not yet reflect the migration.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = admin
    .from("sponsors")
    .select("*")
    .eq("is_active", true)
    .order("tier", { ascending: true });

  if (homepage) {
    query = query.eq("display_on_homepage", true);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch event assignments separately — gracefully returns [] if migration not run yet
  const { data: seData } = await admin
    .from("sponsor_events")
    .select("sponsor_id, event_id");

  const eventMap = new Map<string, string[]>();
  for (const row of seData ?? []) {
    const arr = eventMap.get(row.sponsor_id) ?? [];
    arr.push(row.event_id);
    eventMap.set(row.sponsor_id, arr);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows: any[] = data ?? [];

  if (eventId) {
    rows = rows.filter((s: any) => (eventMap.get(s.id) ?? []).includes(eventId));
    if (rows.length === 0) return NextResponse.json([], { status: 200 });
  } else if (global) {
    rows = rows.filter((s: any) => !eventMap.has(s.id));
  }

  // Normalise: sponsor_name falls back to legacy `name` for pre-migration rows
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sponsors = rows.map((s: any) => ({
    ...s,
    sponsor_name: s.sponsor_name || s.name || "",
    event_ids: eventMap.get(s.id) ?? [],
  }));

  sponsors.sort((a: any, b: any) =>
    (a.sponsor_name as string).localeCompare(b.sponsor_name as string)
  );

  return NextResponse.json(sponsors, { status: 200 });
}

// POST: create a sponsor
export async function POST(request: Request) {
  const admin = createAdminClient();
  const body = await request.json();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin.from("sponsors") as any)
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
      eventIds.map((eid: string) => ({ sponsor_id: data.id, event_id: eid }))
    );
  }

  return NextResponse.json({ ...data, event_ids: eventIds }, { status: 201 });
}
