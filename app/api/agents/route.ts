import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// GET: list agents, optional ?venue_id= filter
export async function GET(request: Request) {
  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const venueId = searchParams.get("venue_id");

  let query = admin
    .from("agents")
    .select("*")
    .order("agency", { ascending: true });

  if (venueId) {
    query = query.or(`venue_id.eq.${venueId},venue_id.is.null`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST: create or update an agent (upsert by agency + agent_name)
export async function POST(request: Request) {
  const admin = createAdminClient();
  const body = await request.json();

  // Check if agent already exists
  const { data: existing } = await admin
    .from("agents")
    .select("id")
    .eq("agency", body.agency || "")
    .eq("agent_name", body.agent_name || "")
    .maybeSingle();

  if (existing) {
    // Update existing
    const { data, error } = await admin
      .from("agents")
      .update({
        agent_phone: body.agent_phone || null,
        agent_email: body.agent_email || null,
        venue_id: body.venue_id || null,
      })
      .eq("id", existing.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  // Create new
  const { data, error } = await admin
    .from("agents")
    .insert({
      agency: body.agency,
      agent_name: body.agent_name,
      agent_phone: body.agent_phone || null,
      agent_email: body.agent_email || null,
      venue_id: body.venue_id || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
