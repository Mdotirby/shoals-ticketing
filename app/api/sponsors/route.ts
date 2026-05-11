import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// GET: list sponsors
// ?event_id=   → sponsors for a specific event
// ?homepage=1  → only global sponsors marked display_on_homepage
// ?global=1    → only global sponsors (no event_id)
export async function GET(request: Request) {
  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const eventId   = searchParams.get("event_id");
  const homepage  = searchParams.get("homepage");
  const global    = searchParams.get("global");

  let query = admin
    .from("sponsors")
    .select("*")
    .eq("is_active", true)
    .order("tier", { ascending: true })
    .order("name", { ascending: true });

  if (eventId) {
    query = query.eq("event_id", eventId);
  } else if (homepage) {
    query = query.eq("display_on_homepage", true).is("event_id", null);
  } else if (global) {
    query = query.is("event_id", null);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? [], { status: 200 });
}

// POST: create a sponsor
export async function POST(request: Request) {
  const admin = createAdminClient();
  const body = await request.json();

  const { data, error } = await admin
    .from("sponsors")
    .insert({
      name: body.name,
      logo_url: body.logo_url || null,
      website_url: body.website_url || null,
      tier: body.tier || "supporting",
      event_id: body.event_id || null,
      bio: body.bio || null,
      display_on_homepage: body.display_on_homepage ?? false,
      is_active: body.is_active ?? true,
      contact_name: body.contact_name || null,
      contact_email: body.contact_email || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
