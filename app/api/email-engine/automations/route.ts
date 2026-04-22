import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { EMAIL_ENGINE } from "@/modules/email-engine";

const VALID_TRIGGERS = new Set(Object.values(EMAIL_ENGINE.TRIGGERS));

// GET /api/email-engine/automations?venue_id=xxx
export async function GET(req: NextRequest) {
  const venue_id = req.nextUrl.searchParams.get("venue_id");
  const admin = createAdminClient();
  let q = admin.from("ee_automation_flows")
    .select("*, ee_segments(name)")
    .order("updated_at", { ascending: false });
  if (venue_id) q = q.eq("venue_id", venue_id);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/email-engine/automations
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body?.name || !body?.trigger_type || !Array.isArray(body?.steps)) {
    return NextResponse.json({ error: "name, trigger_type, steps[] required" }, { status: 400 });
  }
  if (!VALID_TRIGGERS.has(body.trigger_type)) {
    return NextResponse.json({ error: `invalid trigger_type (must be one of ${[...VALID_TRIGGERS].join(", ")})` }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ee_automation_flows")
    .insert({
      venue_id: body.venue_id ?? null,
      name: body.name,
      description: body.description ?? null,
      trigger_type: body.trigger_type,
      segment_id: body.segment_id ?? null,
      steps: body.steps,
      config: body.config ?? {},
      is_active: body.is_active ?? true,
      created_by: body.created_by ?? null,
    })
    .select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
