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
    .from("ad_engine_hooks")
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
    text?: string;
    style?: string;
    venue_id?: string | null;
    scope?: "event" | "venue";
  };
  if (!body.text) return NextResponse.json({ error: "text required" }, { status: 400 });
  const db = createAdminClient();
  const { data, error } = await db
    .from("ad_engine_hooks")
    .insert({
      event_id: body.scope === "venue" ? null : eventId,
      venue_id: body.venue_id ?? null,
      text: body.text,
      style: body.style ?? "neutral",
      active: true,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
