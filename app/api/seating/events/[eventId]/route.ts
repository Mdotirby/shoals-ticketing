import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/** GET /api/seating/events/[eventId] — customer-facing: full layout with seat statuses */
export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;

  // Look up event_layout_maps
  const { data: map } = await admin
    .from("event_layout_maps").select("*").eq("event_id", eventId).single();

  if (!map || !map.enabled) {
    return NextResponse.json({ enabled: false, layout: null });
  }

  // Load full layout
  const { data: layout } = await admin.from("venue_layouts").select("*").eq("id", map.layout_id).single();
  if (!layout) return NextResponse.json({ enabled: true, layout: null });

  const { data: sections } = await admin.from("sections").select("*").eq("layout_id", layout.id).order("created_at");
  const sectionIds = (sections || []).map((s: { id: string }) => s.id);

  const { data: objects } = sectionIds.length
    ? await admin.from("objects").select("*").in("section_id", sectionIds).order("created_at")
    : { data: [] };

  const { data: seats } = sectionIds.length
    ? await admin.from("seats").select("*").in("section_id", sectionIds).order("seat_number")
    : { data: [] };

  const enriched = (sections || []).map((sec: { id: string }) => ({
    ...sec,
    objects: (objects || []).filter((o: { section_id: string }) => o.section_id === sec.id),
    seats: (seats || []).filter((s: { section_id: string }) => s.section_id === sec.id),
  }));

  return NextResponse.json({
    enabled: true,
    layout: { ...layout, sections: enriched },
  });
}
