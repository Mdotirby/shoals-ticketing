import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/can";

// PATCH /api/events/[id]/holds/[holdId] — release a hold (sets released_at).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; holdId: string }> }
) {
  // Releasing a hold puts seats back on sale.
  const guard = await requireCapability("holds", { write: true });
  if (!guard.ok) return guard.response;

  const { holdId } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("event_holds")
    .update({ released_at: new Date().toISOString() })
    .eq("id", holdId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 200 });
}
