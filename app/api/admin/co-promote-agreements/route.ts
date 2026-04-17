import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

/**
 * GET /api/admin/co-promote-agreements
 * List all co-promote agreements, optionally filtered by our_venue_id, status, or event_id.
 *
 * POST /api/admin/co-promote-agreements
 * Create a new co-promote agreement.
 */

// ── GET (list) ───────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const venueId = searchParams.get("venue_id");
  const status = searchParams.get("status");
  const eventId = searchParams.get("event_id");

  let query = admin
    .from("co_promote_agreements")
    .select("*")
    .order("event_date", { ascending: false })
    .limit(500);

  if (venueId) query = query.eq("our_venue_id", venueId);
  if (status) query = query.eq("status", status);
  if (eventId) query = query.eq("event_id", eventId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

// ── POST (create) ─────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Required fields
  const required = ["buyer_company_name", "partner_venue_name", "event_date", "deal_structure"];
  for (const f of required) {
    if (!body[f]) {
      return NextResponse.json({ error: `Missing required field: ${f}` }, { status: 400 });
    }
  }

  const admin = createAdminClient();

  // Auto-generate agreement_number if not provided
  let agreementNumber = (body.agreement_number as string) || "";
  if (!agreementNumber) {
    // Count existing agreements this year to generate a sequential number
    const yearStart = `${new Date().getFullYear()}-01-01`;
    const { count } = await admin
      .from("co_promote_agreements")
      .select("id", { count: "exact", head: true })
      .gte("created_at", yearStart);
    agreementNumber = `CP-${new Date().getFullYear()}-${String((count ?? 0) + 1).padStart(3, "0")}`;
  }

  const payload = {
    ...body,
    agreement_number: agreementNumber,
    status: (body.status as string) || "draft",
  };

  const { data, error } = await admin
    .from("co_promote_agreements")
    .insert(payload)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
