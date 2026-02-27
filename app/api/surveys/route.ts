import { createAdminClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

// POST /api/surveys — Submit a post-show survey (public)
export async function POST(req: NextRequest) {
  const body = await req.json();
  const admin = createAdminClient();

  if (!body.event_id) {
    return NextResponse.json({ error: "event_id required" }, { status: 400 });
  }

  const { error } = await admin.from("post_show_surveys").insert({
    event_id: body.event_id,
    order_id: body.order_id || null,
    customer_email: body.customer_email || null,
    overall_rating: body.overall_rating || null,
    would_return: body.would_return ?? null,
    feedback: body.feedback || null,
    age_range: body.age_range || null,
    gender: body.gender || null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ submitted: true });
}

// GET /api/surveys?event_id=xxx — Get survey results for an event (admin)
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get("event_id");
  if (!eventId) return NextResponse.json({ error: "event_id required" }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("post_show_surveys")
    .select("*")
    .eq("event_id", eventId)
    .order("submitted_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
