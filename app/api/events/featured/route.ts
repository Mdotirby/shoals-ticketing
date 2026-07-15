import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";

// GET /api/events/featured
// Returns the site-wide "featured" event for the header CTA — always a
// published, upcoming, paid hard-ticket event. No stored flag and no cron:
// the pick rotates deterministically every 5 days over the sorted eligible
// list, so it self-heals if events are added/removed between rotations.
export async function GET() {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("events")
    .select("id,title,venue,date,event_type,is_free,status,booking_status,closed_out_at")
    .eq("event_type", "hard_ticket")
    .or("is_free.eq.false,is_free.is.null")
    .or("status.eq.published,status.is.null")
    .or("booking_status.eq.confirmed,booking_status.is.null")
    .order("date", { ascending: true });

  if (error) {
    return NextResponse.json({ event: null }, { status: 200 });
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const isPast = (e: { date: string | null; closed_out_at: string | null }) => {
    if (e.closed_out_at) return true;
    if (!e.date) return false;
    const d = e.date.length === 10 && e.date[4] === "-"
      ? new Date(`${e.date}T23:59:59`)
      : new Date(e.date);
    if (Number.isNaN(d.getTime())) return false;
    return d < startOfToday;
  };

  const eligible = (data || []).filter((e) => !isPast(e));

  if (eligible.length === 0) {
    return NextResponse.json({ event: null }, { status: 200, headers: { "Cache-Control": "public, max-age=3600" } });
  }

  const daysSinceEpoch = Math.floor(Date.now() / 86400000);
  const idx = Math.floor(daysSinceEpoch / 5) % eligible.length;
  const picked = eligible[idx];

  return NextResponse.json(
    { event: { id: picked.id, title: picked.title } },
    { status: 200, headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
