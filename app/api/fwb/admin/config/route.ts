import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { verifyAdminAuth } from "@/lib/fwb/admin-auth";
import { getConfig, invalidateConfigCache } from "@/lib/fwb/config";

export async function GET(request: Request) {
  try {
    const auth = await verifyAdminAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const supabase = createAdminClient();
    const config = await getConfig(auth.venueId!, supabase);

    return NextResponse.json(config);
  } catch (err) {
    console.error("FWB admin config GET error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await verifyAdminAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const supabase = createAdminClient();
    const venueId = auth.venueId!;

    // Check if config exists
    const { data: existing } = await supabase
      .from("fwb_config")
      .select("id")
      .eq("venue_id", venueId)
      .single();

    let updatedConfig;

    if (existing) {
      // Update existing config
      const { data, error } = await supabase
        .from("fwb_config")
        .update({ ...body, updated_at: new Date().toISOString() })
        .eq("venue_id", venueId)
        .select("*")
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      updatedConfig = data;
    } else {
      // Create new config
      const { data, error } = await supabase
        .from("fwb_config")
        .insert({ ...body, venue_id: venueId })
        .select("*")
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      updatedConfig = data;
    }

    // Invalidate cache so next read picks up fresh data
    invalidateConfigCache(venueId);

    return NextResponse.json(updatedConfig);
  } catch (err) {
    console.error("FWB admin config PUT error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
