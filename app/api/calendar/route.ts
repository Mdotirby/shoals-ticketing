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

  // Full column set including new private event / booking_status fields
  const fullColumns = "id, title, venue, date, end_time, price, status, event_type, booking_status, contact_name, contact_phone, contact_email, notes, calendar_color, image_url, venue_id";
  const fallbackColumns = "id, title, venue, date, end_time, price, status, event_type, notes, calendar_color, image_url, venue_id";
  const basicColumns = "id, title, venue, date, price, status, image_url, venue_id";

  let query = admin
    .from("events")
    .select(fullColumns)
    .gte("date", startDate.toISOString())
    .lte("date", endDate.toISOString())
    .order("date", { ascending: true });

  if (venueId) {
    query = query.eq("venue_id", venueId);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let { data, error } = await query as { data: any[] | null; error: any };

  // If new columns don't exist yet, fall back progressively
  if (error && error.message?.includes("column")) {
    console.warn("Calendar: new columns not found, trying fallback select");
    let fallback = admin
      .from("events")
      .select(fallbackColumns)
      .gte("date", startDate.toISOString())
      .lte("date", endDate.toISOString())
      .order("date", { ascending: true });

    if (venueId) fallback = fallback.eq("venue_id", venueId);

    const result = await fallback;

    if (result.error && result.error.message?.includes("column")) {
      // Try basic columns
      console.warn("Calendar: fallback columns not found, using basic select");
      let basic = admin
        .from("events")
        .select(basicColumns)
        .gte("date", startDate.toISOString())
        .lte("date", endDate.toISOString())
        .order("date", { ascending: true });

      if (venueId) basic = basic.eq("venue_id", venueId);

      const basicResult = await basic;
      data = (basicResult.data ?? []).map((e: Record<string, unknown>) => ({
        ...e,
        end_time: null,
        event_type: "hard_ticket",
        booking_status: "confirmed",
        contact_name: null,
        contact_phone: null,
        contact_email: null,
        notes: null,
        calendar_color: null,
      }));
      error = basicResult.error;
    } else {
      data = (result.data ?? []).map((e: Record<string, unknown>) => ({
        ...e,
        booking_status: "confirmed",
        contact_name: null,
        contact_phone: null,
        contact_email: null,
      }));
      error = result.error;
    }
  }

  if (error) {
    console.error("Calendar fetch error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

// POST /api/calendar — Create a calendar event (non-ticketed, private, or hard_ticket)
export async function POST(req: NextRequest) {
  const admin = createAdminClient();
  const body = await req.json();

  const eventType = body.event_type || "non_ticketed";
  
  const isPrivate = eventType === "private";
  const insertData: Record<string, unknown> = {
    title: body.title,
    venue: body.venue || "",
    date: body.date,
    end_time: body.end_time || null,
    price: isPrivate ? null : (eventType === "hard_ticket" || eventType === "ticketed" ? (body.price || 0) : 0),
    ticketing_fee: isPrivate ? null : undefined,
    venue_rebate: isPrivate ? null : undefined,
    description: body.description || null,
    notes: body.notes || null,
    event_type: eventType,
    booking_status: body.booking_status || "confirmed",
    contact_name: body.contact_name || null,
    contact_phone: body.contact_phone || null,
    contact_email: body.contact_email || null,
    client_name: body.client_name || null,
    client_email: body.client_email || null,
    client_phone: body.client_phone || null,
    client_company: body.client_company || null,
    client_billing_address: body.client_billing_address || null,
    tax_exempt: body.tax_exempt || false,
    start_time: body.start_time || null,
    calendar_color: body.calendar_color || null,
    status: body.status || "published",
    venue_id: body.venue_id || null,
  };
  // Remove undefined values so they don't get sent to Supabase
  Object.keys(insertData).forEach(k => { if (insertData[k] === undefined) delete insertData[k]; });

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
  if (body.booking_status !== undefined) updates.booking_status = body.booking_status;
  if (body.contact_name !== undefined) updates.contact_name = body.contact_name;
  if (body.contact_phone !== undefined) updates.contact_phone = body.contact_phone;
  if (body.contact_email !== undefined) updates.contact_email = body.contact_email;
  if (body.calendar_color !== undefined) updates.calendar_color = body.calendar_color;
  if (body.status !== undefined) updates.status = body.status;
  if (body.start_time !== undefined) updates.start_time = body.start_time;
  if (body.client_name !== undefined) updates.client_name = body.client_name;
  if (body.client_email !== undefined) updates.client_email = body.client_email;
  if (body.client_phone !== undefined) updates.client_phone = body.client_phone;
  if (body.client_company !== undefined) updates.client_company = body.client_company;
  if (body.client_billing_address !== undefined) updates.client_billing_address = body.client_billing_address;
  if (body.tax_exempt !== undefined) updates.tax_exempt = body.tax_exempt;
  if (body.price !== undefined) updates.price = body.price;
  if (body.ticketing_fee !== undefined) updates.ticketing_fee = body.ticketing_fee;
  if (body.venue_rebate !== undefined) updates.venue_rebate = body.venue_rebate;

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
