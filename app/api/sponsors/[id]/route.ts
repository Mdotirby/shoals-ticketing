import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// GET: single sponsor (includes event_ids from junction table)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("sponsors")
    .select("*, sponsor_events(event_id)")
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "PGRST116" ? 404 : 500 }
    );
  }

  const { sponsor_events, ...sponsor } = data as typeof data & { sponsor_events: { event_id: string }[] };
  return NextResponse.json(
    { ...sponsor, event_ids: (sponsor_events ?? []).map(se => se.event_id) },
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

  const { data, error } = await admin
    .from("sponsors")
    .update({
      sponsor_name:        body.sponsor_name,
      client_name:         body.client_name         || null,
      sponsor_address:     body.sponsor_address      || null,
      logo_url:            body.logo_url             || null,
      website_url:         body.website_url          || null,
      tier:                body.tier,
      bio:                 body.bio                  || null,
      display_on_homepage: body.display_on_homepage  ?? false,
      is_active:           body.is_active            ?? true,
      contact_name:        body.contact_name         || null,
      contact_email:       body.contact_email        || null,
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
      eventIds.map(eid => ({ sponsor_id: id, event_id: eid }))
    );
  }

  return NextResponse.json({ ...data, event_ids: eventIds }, { status: 200 });
}

// DELETE: delete sponsor (sponsor_events cascade automatically)
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
