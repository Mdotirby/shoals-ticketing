import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// GET /api/faqs?venue_id=<id>  — list FAQs for a venue, ordered by sort_order
export async function GET(request: Request) {
  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const venueId = searchParams.get("venue_id");

  if (!venueId) {
    return NextResponse.json({ error: "venue_id required" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("venue_faqs")
    .select("*")
    .eq("venue_id", venueId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? [], { status: 200 });
}

// POST /api/faqs — create a new FAQ entry
export async function POST(request: Request) {
  const admin = createAdminClient();
  const body = await request.json();

  if (!body.venue_id || !body.question || !body.answer) {
    return NextResponse.json({ error: "venue_id, question, and answer are required" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("venue_faqs")
    .insert({
      venue_id:   body.venue_id,
      question:   body.question,
      answer:     body.answer,
      sort_order: body.sort_order ?? 0,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data, { status: 201 });
}
