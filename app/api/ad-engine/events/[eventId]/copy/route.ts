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
    .from("ad_engine_copy_variants")
    .select("*")
    .or(`event_id.eq.${eventId},event_id.is.null`)
    .order("created_at", { ascending: false });
  return NextResponse.json(data ?? []);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const body = (await req.json()) as {
    body?: string;
    cta?: string | null;
    tone?: string;
    venue_id?: string | null;
    scope?: "event" | "venue";
  };
  if (!body.body) return NextResponse.json({ error: "body required" }, { status: 400 });
  const db = createAdminClient();
  const { data, error } = await db
    .from("ad_engine_copy_variants")
    .insert({
      event_id: body.scope === "venue" ? null : eventId,
      venue_id: body.venue_id ?? null,
      body: body.body,
      cta: body.cta ?? null,
      tone: body.tone ?? "hype",
      active: true,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
