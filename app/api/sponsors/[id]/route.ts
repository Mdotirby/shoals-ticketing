import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// GET: single sponsor (includes event_ids from junction table)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  // Fetch sponsor and event assignments as separate queries to avoid
  // Supabase TypeScript ParserError on relationship select strings.
  const { data, error } = await admin
    .from("sponsors")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "PGRST116" ? 404 : 500 }
    );
  }

  const { data: seData } = await admin
    .from("sponsor_events")
    .select("event_id")
    .eq("sponsor_id", id);

  return NextResponse.json(
    { ...data, event_ids: (seData ?? []).map(se => se.event_id) },
    { status: 200 }
  );
}

// PUT: update sponsor + sync event junction table
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();
  const body = await request.json();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin.from("sponsors") as any)
    .update({
      sponsor_name:        body.sponsor_name,
      client_name:         body.client_name        || null,
      sponsor_address:     body.sponsor_address    || null,
      logo_url:            body.logo_url           || null,
      website_url:         body.website_url        || null,
      tier:                body.tier,
      bio:                 body.bio                || null,
      display_on_homepage: body.display_on_homepage ?? false,
      is_active:           body.is_active          ?? true,
      contact_name:        body.contact_name       || null,
      contact_email:       body.contact_email      || null,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sync event assignments: delete all then re-insert
  await admin.from("sponsor_events").delete().eq("sponsor_id", id);
  const eventIds: string[] = body.event_ids ?? [];
  if (eventIds.length > 0) {
    await admin.from("sponsor_events").insert(
      eventIds.map((eid: string) => ({ sponsor_id: id, event_id: eid }))
    );
  }

  return NextResponse.json({ ...data, event_ids: eventIds }, { status: 200 });
}

// DELETE: delete sponsor (sponsor_events rows cascade automatically)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  const { error } = await admin.from("sponsors").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ deleted: true }, { status: 200 });
}
