/**
 * Deal Lab — run a simulation for an event.
 *
 * Body:
 *   {
 *     structures: [{ structure, inputs }],
 *     scenarios?: ['conservative','expected','optimistic'],
 *     persist?: boolean,
 *     label?: string
 *   }
 *
 * Response always includes `simulated: true` and a SIMULATED_ONLY banner.
 */
import { NextResponse } from "next/server";
import { simulate, persistSession, recommend } from "@/modules/deal-lab";
import type { DealInputs, DealStructureKey, ScenarioKey } from "@/modules/deal-lab";
import { getEventMeta } from "@/services/core-data";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const body = (await req.json()) as {
    structures: Array<{ structure: DealStructureKey; inputs: DealInputs }>;
    scenarios?: ScenarioKey[];
    persist?: boolean;
    label?: string | null;
    created_by?: string | null;
  };
  if (!Array.isArray(body.structures) || body.structures.length === 0) {
    return NextResponse.json({ error: "structures array required" }, { status: 400 });
  }

  const event = await getEventMeta(eventId);
  if (!event) return NextResponse.json({ error: "event not found" }, { status: 404 });

  const bundle = await simulate({
    event_id: eventId,
    structures: body.structures,
    scenarios: body.scenarios,
  });

  if (bundle.blockers.length > 0) {
    return NextResponse.json({
      banner: "SIMULATED_ONLY",
      simulated: true,
      bundle,
      recommendation: null,
    });
  }

  let session_id: string | null = null;
  if (body.persist) {
    const persisted = await persistSession(bundle, {
      label: body.label ?? null,
      created_by: body.created_by ?? null,
      venue_id: event.venue_id,
    });
    session_id = persisted.session_id;
  }
  const rec = recommend(bundle);

  return NextResponse.json({
    banner: "SIMULATED_ONLY",
    simulated: true,
    bundle: { ...bundle, session_id },
    recommendation: rec,
  });
}
