import { createAdminClient } from "@/lib/supabase-server";
import { localTodayISO } from "@/lib/dates";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/admin/scan/events — returns upcoming events for the scanner event selector
export async function GET() {
  const admin = createAdminClient();
  // Venue-local today, not UTC today. On a UTC server the old
  // `toISOString().slice(0, 10)` rolled over at 7 PM CDT, dropping the show in
  // progress out of the scanner dropdown — which also killed name lookup at the
  // door, since the search is disabled with no event selected.
  const today = localTodayISO();

  const { data, error } = await admin
    .from("events")
    .select("id, title, date, venue")
    .gte("date", today)
    .order("date", { ascending: true })
    .limit(30);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? [], { status: 200 });
}
