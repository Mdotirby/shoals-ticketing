import { NextResponse } from "next/server";
import { buildCampaign } from "@/modules/ad-engine";
import { getEventMeta } from "@/services/core-data";
import type { AdPlatform, CampaignMode } from "@/modules/ad-engine";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const body = (await req.json()) as {
    platform: AdPlatform;
    identity_id?: string | null;
    name: string;
    mode?: CampaignMode;
    daily_budget: number;
    total_budget: number;
    creative_ids?: string[];
    notes?: string | null;
    launch?: boolean;
  };
  if (!body.platform || !body.name) {
    return NextResponse.json({ error: "platform and name required" }, { status: 400 });
  }

  const event = await getEventMeta(eventId);
  if (!event) return NextResponse.json({ error: "event not found" }, { status: 404 });

  const result = await buildCampaign({
    event_id: eventId,
    venue_id: event.venue_id,
    platform: body.platform,
    identity_id: body.identity_id ?? null,
    name: body.name,
    mode: body.mode ?? "efficiency",
    daily_budget: Number(body.daily_budget),
    total_budget: Number(body.total_budget),
    creative_ids: body.creative_ids ?? [],
    notes: body.notes ?? null,
    launch: body.launch ?? false,
  });
  if (!result.ok) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result, { status: 201 });
}
