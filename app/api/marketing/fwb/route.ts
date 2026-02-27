import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// GET /api/marketing/fwb — Fetch all newsletter subscribers
export async function GET() {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("newsletter_subscribers")
    .select("id, first_name, last_name, email, source, venue_id, subscribed_at, unsubscribed_at, created_at")
    .order("subscribed_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
