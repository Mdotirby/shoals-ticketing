import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// POST: manually mark a quote as declined
export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string; proposalId: string }> }
) {
  const { eventId, proposalId } = await params;
  const admin = createAdminClient();
  const body = await req.json().catch(() => ({}));

  const { data, error } = await admin
    .from("private_event_proposals")
    .update({
      status: "declined",
      declined_at: new Date().toISOString(),
      declined_reason: body.reason || null,
    })
    .eq("id", proposalId)
    .eq("event_id", eventId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
