import { NextResponse } from "next/server";
import { createAsset, listAssets } from "@/modules/ad-engine";
import type { Asset } from "@/modules/ad-engine";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const assets = await listAssets({ event_id: eventId, active_only: false });
  return NextResponse.json(assets);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const body = (await req.json()) as Partial<Asset>;
  if (!body.url || !body.kind) {
    return NextResponse.json({ error: "url and kind required" }, { status: 400 });
  }
  const input: Omit<Asset, "id" | "created_at" | "updated_at"> = {
    event_id: eventId,
    venue_id: body.venue_id ?? null,
    kind: body.kind,
    url: body.url,
    thumbnail_url: body.thumbnail_url ?? null,
    file_name: body.file_name ?? null,
    mime_type: body.mime_type ?? null,
    file_size: body.file_size ?? null,
    duration_sec: body.duration_sec ?? null,
    width: body.width ?? null,
    height: body.height ?? null,
    energy: body.energy ?? "medium",
    context: body.context ?? "other",
    source: body.source ?? "upload",
    tags: body.tags ?? [],
    active: body.active ?? true,
  };
  const asset = await createAsset(input);
  return NextResponse.json(asset, { status: 201 });
}
