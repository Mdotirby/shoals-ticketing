import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/can";

// GET /api/events/[id]/drop-count — Count scanned tickets for an event
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // How many people are inside. Door information, not public.
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;

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
