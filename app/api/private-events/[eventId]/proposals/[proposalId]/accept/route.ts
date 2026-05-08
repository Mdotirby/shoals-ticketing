import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// POST: manually mark a quote as accepted + confirm the event
export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string; proposalId: string }> }
) {
  const { eventId, proposalId } = await params;
  const admin = createAdminClient();
  const body = await req.json().catch(() => ({}));
  const acceptedBy: string = body.accepted_by || "Admin";

  // 1. Mark the quote accepted
  const { data: quote, error: quoteErr } = await admin
    .from("private_event_proposals")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
      accepted_by: acceptedBy,
    })
    .eq("id", proposalId)
    .eq("event_id", eventId)
    .select()
    .single();

  if (quoteErr || !quote) {
    return NextResponse.json({ error: quoteErr?.message ?? "Quote not found" }, { status: 500 });
  }

  // 2. Confirm the event
  const { error: eventErr } = await admin
    .from("events")
    .update({ booking_status: "confirmed" })
    .eq("id", eventId);

  if (eventErr) {
    return NextResponse.json({ error: eventErr.message }, { status: 500 });
  }

  return NextResponse.json({ quote, event_confirmed: true });
}
