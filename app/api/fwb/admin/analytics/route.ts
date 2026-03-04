import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { verifyAdminAuth } from "@/lib/fwb/admin-auth";
import { getAnalytics } from "@/lib/fwb/analytics";

export async function GET(request: Request) {
  try {
    const auth = await verifyAdminAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const supabase = createAdminClient();
    const analytics = await getAnalytics(auth.venueId!, supabase);

    return NextResponse.json(analytics);
  } catch (err) {
    console.error("FWB admin analytics error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
