import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { previewCampaign } from "@/modules/email-engine";

// GET /api/email-engine/campaigns/[id]/preview
// Returns a rendered preview (subject + html + text).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const first_name = req.nextUrl.searchParams.get("first_name") || undefined;
  const email = req.nextUrl.searchParams.get("email") || undefined;

  try {
    const out = await previewCampaign(createAdminClient(), id, {
      email: email ?? "preview@venuecore.live",
      first_name,
    });
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
