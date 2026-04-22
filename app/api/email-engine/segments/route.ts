import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { compileRules, previewRules } from "@/modules/email-engine";

// GET /api/email-engine/segments?venue_id=xxx
export async function GET(req: NextRequest) {
  const venue_id = req.nextUrl.searchParams.get("venue_id");
  const admin = createAdminClient();

  let q = admin.from("ee_segments").select("*").order("updated_at", { ascending: false });
  if (venue_id) q = q.eq("venue_id", venue_id);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/email-engine/segments
export async function POST(req: NextRequest) {
  const body = await req.json();
  const admin = createAdminClient();

  if (!body.name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const rules = body.rules ?? { op: "AND", conditions: [] };

  // Validate by compiling — rejects unknown fields/ops up-front
  try {
    compileRules(rules);
  } catch (e) {
    return NextResponse.json({ error: `invalid rules: ${(e as Error).message}` }, { status: 400 });
  }

  // Compute an initial count so the UI shows something immediately
  let last_count: number | null = null;
  try {
    const p = await previewRules(admin, rules);
    last_count = p.count;
  } catch (e) {
    console.warn("[EE] segment preview failed on create:", (e as Error).message);
  }

  const { data, error } = await admin
    .from("ee_segments")
    .insert({
      venue_id: body.venue_id ?? null,
      name: body.name,
      description: body.description ?? null,
      rules,
      last_count,
      last_evaluated: last_count !== null ? new Date().toISOString() : null,
      created_by: body.created_by ?? null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
