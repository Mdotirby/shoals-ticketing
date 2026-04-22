import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { previewRules } from "@/modules/email-engine";

// POST /api/email-engine/segments/preview
// Body: { rules: SegmentRuleGroup }
// Returns: { count, sample[] }
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body?.rules) return NextResponse.json({ error: "rules required" }, { status: 400 });
  try {
    const res = await previewRules(createAdminClient(), body.rules);
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
