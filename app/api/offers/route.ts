import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export async function GET() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("artist_offers")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 200 });
}

export async function POST(request: Request) {
  const admin = createAdminClient();
  const body = await request.json();

  const { data, error } = await admin
    .from("artist_offers")
    .insert({
      artist_name: body.artist_name,
      venue: body.venue || null,
      event_date: body.event_date || null,
      guarantee: body.guarantee || null,
      deal_type: body.deal_type || null,
      backend_percentage: body.backend_percentage || null,
      merch_soft: body.merch_soft || null,
      merch_hard: body.merch_hard || null,
      terms: body.terms || null,
      notes: body.notes || null,
      status: body.status || "draft",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
