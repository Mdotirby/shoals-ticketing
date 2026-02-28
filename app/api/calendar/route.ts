import { createAdminClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

// GET /api/calendar?month=2026-03&venue_id=xxx
// Returns all events for the given month (or ±1 month for calendar edge days)
export async function GET(req: NextRequest) {
  const admin = createAdminClient();
  const month = req.nextUrl.searchParams.get("month"); // YYYY-MM
  const venueId = req.nextUrl.searchParams.get("venue_id");

  if (!month) {
    return NextResponse.json({ error: "month parameter required (YYYY-MM)" }, { status: 400 });
  }

  // Parse month to get date range (include a few days before/after for calendar grid)
  const [year, mon] = month.split("-").map(Number);
  const startDate = new Date(year, mon - 1, 1);
  startDate.setDate(startDate.getDate() - 7); // 7 days before month start
  const endDate = new Date(year, mon, 0);
  endDate.setDate(endDate.getDate() + 7); // 7 days after month end

  let query = admin
    .from("events")
    .select("id, title, venue, date, end_time, price, status, event_type, notes, calendar_color, image_url, venue_id")
    .gte("date", startDate.toISOString())
    .lte("date", endDate.toISOString())
    .order("date", { ascending: true });

  if (venueId) {
    query = query.eq("venue_id", venueId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Calendar fetch error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

// POST /api/calendar — Create a calendar event (non-ticketed or private)
export async function POST(req: NextRequest) {
  const admin = createAdminClient();
  const body = await req.json();

  const eventType = body.event_type || "non_ticketed";
  
  const insertData: Record<string, unknown> = {
    title: body.title,
    venue: body.venue || "",
    date: body.date,
    end_time: body.end_time || null,
    price: eventType === "ticketed" ? (body.price || 0) : 0,
    description: body.description || null,
    notes: body.notes || null,
    event_type: eventType,
    calendar_color: body.calendar_color || null,
    status: body.status || "published",
    venue_id: body.venue_id || null,
  };

  const { data, error } = await admin
    .from("events")
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error("Calendar event create error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

// PUT /api/calendar — Update a calendar event
export async function PUT(req: NextRequest) {
  const admin = createAdminClient();
  const body = await req.json();

  if (!body.id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.date !== undefined) updates.date = body.date;
  if (body.end_time !== undefined) updates.end_time = body.end_time;
  if (body.venue !== undefined) updates.venue = body.venue;
  if (body.description !== undefined) updates.description = body.description;
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.event_type !== undefined) updates.event_type = body.event_type;
  if (body.calendar_color !== undefined) updates.calendar_color = body.calendar_color;
  if (body.status !== undefined) updates.status = body.status;

  const { data, error } = await admin
    .from("events")
    .update(updates)
    .eq("id", body.id)
    .select()
    .single();

  if (error) {
    console.error("Calendar event update error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// DELETE /api/calendar?id=xxx
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("events").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
