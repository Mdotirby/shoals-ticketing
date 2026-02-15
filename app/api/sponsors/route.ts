import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// GET: list all sponsors (optional ?event_id= filter)
export async function GET(request: Request) {
  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("event_id");

  let query = admin
    .from("sponsors")
    .select("*")
    .order("tier", { ascending: true })
    .order("name", { ascending: true });

  if (eventId) {
    query = query.eq("event_id", eventId);
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
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
