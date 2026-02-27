import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// GET /api/events/[id]/drop-count — Count scanned tickets for an event
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  const { count, error } = await admin
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("event_id", id)
    .eq("is_scanned", true);

  if (error) {
    return NextResponse.json({ scanned: 0 });
  }

  return NextResponse.json({ scanned: count ?? 0 });
}
