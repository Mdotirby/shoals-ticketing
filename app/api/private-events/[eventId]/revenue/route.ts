import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET: List revenue items for a private event
export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const { searchParams } = new URL(request.url);
  const venueId = searchParams.get("venue_id");

  const admin = createAdminClient();

  let query = admin
    .from("private_event_revenue")
    .select("*")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true });

  if (venueId) query = query.eq("venue_id", venueId);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
