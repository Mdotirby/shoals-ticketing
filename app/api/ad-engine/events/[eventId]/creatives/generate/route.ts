import { NextResponse } from "next/server";
import { generateCreatives } from "@/modules/ad-engine";
import { getEventMeta } from "@/services/core-data";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const body = (await req.json().catch(() => ({}))) as { max_combos?: number };
  const event = await getEventMeta(eventId);
  if (!event) return NextResponse.json({ error: "event not found" }, { status: 404 });
  try {
    const result = await generateCreatives({
      event_id: eventId,
      venue_id: event.venue_id,
      max_combos: body.max_combos,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
