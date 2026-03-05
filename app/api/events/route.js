import { createAdminClient } from "@/lib/supabase-server";

export async function GET(request) {
  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const venueId = searchParams.get("venue_id");
  const venueSlug = searchParams.get("venue_slug");
  const showAll = searchParams.get("all"); // for admin: show all statuses

  const eventTypeFilter = searchParams.get("event_type"); // for admin filtering

  let query = admin
    .from("events")
    .select("id,title,venue,date,price,image_url,ticketing_fee,venue_rebate,status,venue_id,event_type,booking_status")
    .order("date", { ascending: true });

  // Filter by status for public pages (not admin)
  if (!showAll) {
    query = query.or("status.eq.published,status.is.null");
    // Public API: exclude private events — they should never appear on the public site
    query = query.neq("event_type", "private");
  }

  // Admin event_type filter
  if (eventTypeFilter && eventTypeFilter !== "all") {
    query = query.eq("event_type", eventTypeFilter);
  }

  // Filter by venue_id directly
  if (venueId) {
    query = query.eq("venue_id", venueId);
  }

  // Filter by venue slug (resolve slug → id first)
  if (venueSlug && !venueId) {
    const { data: venue } = await admin
      .from("venues")
      .select("id")
      .eq("slug", venueSlug)
      .single();

    if (venue) {
      query = query.eq("venue_id", venue.id);
    } else {
      // No venue found for this slug — return empty
      return new Response(JSON.stringify([]), { status: 200 });
    }
  }

  const { data, error } = await query;
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify(data ?? []), { status: 200 });
}

export async function POST(request) {
  const admin = createAdminClient();
  const body = await request.json();

  // 1. Build the event row — only include start_time/end_time when provided
  //    (these are TEXT columns added by private-events-v2 migration; omitting
  //    them avoids errors if the migration hasn't been run yet or if an older
  //    schema has TIMESTAMPTZ columns with the same name).
  const isPrivate = body.event_type === "private";
  const eventRow = {
    title: body.title,
    venue: body.venue,
    date: body.date,
    price: body.price ?? (isPrivate ? 0 : 0),
    ticketing_fee: body.ticketing_fee ?? 3.0,
    venue_rebate: body.venue_rebate ?? 0,
    description: body.description || (isPrivate ? "" : null),
    image_url: body.image_url || (isPrivate ? "" : null),
    status: body.status || "published",
    venue_id: body.venue_id || null,
    event_venue_id: body.event_venue_id || null,
    event_type: body.event_type || "hard_ticket",
    booking_status: body.booking_status || "confirmed",
    contact_name: body.contact_name || null,
    contact_phone: body.contact_phone || null,
    contact_email: body.contact_email || null,
    client_name: body.client_name || null,
    client_email: body.client_email || null,
    client_phone: body.client_phone || null,
    client_billing_address: body.client_billing_address || null,
    client_company: body.client_company || null,
    tax_exempt: body.tax_exempt ?? false,
  };

  // Attempt insert — if start_time/end_time columns exist (TEXT type from
  // private-events-v2 migration), include them. If the insert fails because
  // the columns don't exist or are the wrong type, retry without them.
  if (body.start_time) eventRow.start_time = body.start_time;
  if (body.end_time) eventRow.end_time = body.end_time;

  let { data: event, error: eventError } = await admin
    .from("events")
    .insert(eventRow)
    .select()
    .single();

  // Retry without start_time/end_time if they caused the failure
  if (eventError && (eventError.message.includes("start_time") || eventError.message.includes("end_time") || eventError.message.includes("timestamp"))) {
    console.warn("Retrying event insert without start_time/end_time:", eventError.message);
    delete eventRow.start_time;
    delete eventRow.end_time;
    const retry = await admin.from("events").insert(eventRow).select().single();
    event = retry.data;
    eventError = retry.error;
  }

  if (eventError) {
    return new Response(JSON.stringify({ error: eventError.message }), { status: 500 });
  }

  // 2. Insert ticket tiers (if provided)
  if (Array.isArray(body.tiers) && body.tiers.length > 0) {
    const tierRows = body.tiers.map((t, i) => ({
      event_id: event.id,
      tier_name: t.tier_name,
      price: t.price,
      capacity: t.capacity,
      sort_order: t.sort_order ?? i,
    }));

    const { error: tierError } = await admin
      .from("ticket_tiers")
      .insert(tierRows);

    if (tierError) {
      console.error("Failed to insert tiers:", tierError.message);
      return new Response(
        JSON.stringify({ ...event, _tierError: tierError.message }),
        { status: 201 }
      );
    }
  }

  return new Response(JSON.stringify(event), { status: 201 });
}
