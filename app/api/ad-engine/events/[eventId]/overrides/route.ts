import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const db = createAdminClient();
  const { data } = await db
    .from("ad_engine_overrides")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });
  return NextResponse.json(data ?? []);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const body = (await req.json()) as {
    kind: "freeze_campaign" | "disable_optimization" | "lock_budget";
    campaign_id?: string | null;
    note?: string;
    expires_at?: string | null;
    active?: boolean;
  };
  if (!body.kind) return NextResponse.json({ error: "kind required" }, { status: 400 });
  const db = createAdminClient();
  const { data, error } = await db
    .from("ad_engine_overrides")
    .insert({
      event_id: eventId,
      campaign_id: body.campaign_id ?? null,
      kind: body.kind,
      active: body.active ?? true,
      note: body.note ?? null,
      expires_at: body.expires_at ?? null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id query param required" }, { status: 400 });
  const db = createAdminClient();
  await db
    .from("ad_engine_overrides")
    .update({ active: false })
    .eq("id", id)
    .eq("event_id", eventId);
  return NextResponse.json({ deactivated: id });
}
