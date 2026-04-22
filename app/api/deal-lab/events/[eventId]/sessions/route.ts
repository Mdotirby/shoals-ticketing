import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const db = createAdminClient();
  const { data } = await db
    .from("deal_lab_sessions")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });
  return NextResponse.json({
    banner: "SIMULATED_ONLY",
    simulated: true,
    sessions: data ?? [],
  });
}
