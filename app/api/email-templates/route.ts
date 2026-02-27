import { createAdminClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

// GET /api/email-templates?venue_id=xxx
export async function GET(req: NextRequest) {
  const venueId = req.nextUrl.searchParams.get("venue_id");
  const admin = createAdminClient();

  let query = admin
    .from("email_templates")
    .select("*")
    .order("created_at", { ascending: false });

  if (venueId) {
    // Return templates for this venue + system templates (venue_id IS NULL)
    query = query.or(`venue_id.eq.${venueId},venue_id.is.null`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/email-templates — Create a template
export async function POST(req: NextRequest) {
  const body = await req.json();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("email_templates")
    .insert({
      venue_id: body.venue_id || null,
      name: body.name,
      subject: body.subject,
      body_html: body.body_html,
      body_json: body.body_json || null,
      category: body.category || "custom",
      is_system: body.is_system || false,
      created_by: body.created_by || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// PUT /api/email-templates — Update a template
export async function PUT(req: NextRequest) {
  const body = await req.json();
  const admin = createAdminClient();

  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data, error } = await admin
    .from("email_templates")
    .update({
      name: body.name,
      subject: body.subject,
      body_html: body.body_html,
      body_json: body.body_json || null,
      category: body.category,
      updated_at: new Date().toISOString(),
    })
    .eq("id", body.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/email-templates?id=xxx
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("email_templates").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
