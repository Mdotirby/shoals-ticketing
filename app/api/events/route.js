import { createAdminClient } from "@/lib/supabase-server";
import { slugify } from "@/lib/slugify";

export async function GET(request) {
  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const venueId = searchParams.get("venue_id");
  const eventVenueId = searchParams.get("event_venue_id");
  const venueSlug = searchParams.get("venue_slug");
  const showAll = searchParams.get("all"); // for admin: show all statuses
  const excludeHolds = searchParams.get("exclude_holds"); // for Shows page: omit hold-status events
  // include=past  → return ONLY past / closed-out events (for /events/past archive)
  // include=all   → return both upcoming + past (admin convenience)
  // (default)     → return ONLY upcoming, open events
  const include = searchParams.get("include");

  const eventTypeFilter = searchParams.get("event_type"); // for admin filtering
  const bookingStatusFilter = searchParams.get("booking_status"); // for admin filtering

  // Pull the closeout columns when available so the client can render badges
  // and so we can do post-fetch date filtering without a second round-trip.
  // The `closed_out_at` column is added by plans/event-closeout-migration.sql
  // — fall back to the legacy column list if the migration hasn't been run.
  const fullColumns =
    "id,title,subtitle,venue,date,price,image_url,ticketing_fee,venue_rebate,status,venue_id,event_venue_id,event_type,booking_status,is_free,on_sale_at,closed_out_at";
  const legacyColumns =
    "id,title,subtitle,venue,date,price,image_url,ticketing_fee,venue_rebate,status,venue_id,event_venue_id,event_type,booking_status,is_free,on_sale_at";

  let query = admin
    .from("events")
    .select(fullColumns)
    .order("date", { ascending: true });

  // Filter by status for public pages (not admin)
  if (!showAll) {
    query = query.or("status.eq.published,status.is.null");
    // Public API: exclude private events — they should never appear on the public site
    // Use .or() instead of .neq() because PostgreSQL's != excludes NULLs
    query = query.or("event_type.is.null,event_type.neq.private");
    // Exclude events on hold — only confirmed (or unset) booking_status should be public
    query = query.or("booking_status.eq.confirmed,booking_status.is.null");
  }

  // Exclude holds from the admin Shows list — holds belong on the calendar, not here.
  // Use .or() with .is.null to safely handle legacy rows where booking_status is unset,
  // since PostgreSQL's != operator does not match NULL rows.
  if (excludeHolds) {
    query = query.or("booking_status.neq.hold,booking_status.is.null");
  }

  // Admin event_type filter
  if (eventTypeFilter && eventTypeFilter !== "all") {
    query = query.eq("event_type", eventTypeFilter);
  }

  // Admin booking_status filter
  if (bookingStatusFilter && bookingStatusFilter !== "all") {
    query = query.eq("booking_status", bookingStatusFilter);
  }

  // Filter by venue_id directly
  if (venueId) {
    query = query.eq("venue_id", venueId);
  }

  // Filter by physical event_venue_id (e.g. "featured events at this room")
  if (eventVenueId) {
    query = query.eq("event_venue_id", eventVenueId);
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

  let { data, error } = await query;

  // Retry without the closeout column if the migration hasn't been run yet.
  if (error && /closed_out_at|column .* does not exist/i.test(error.message)) {
    let fallback = admin
      .from("events")
      .select(legacyColumns)
      .order("date", { ascending: true });
    if (!showAll) {
      fallback = fallback.or("status.eq.published,status.is.null");
      fallback = fallback.or("event_type.is.null,event_type.neq.private");
      fallback = fallback.or("booking_status.eq.confirmed,booking_status.is.null");
    }
    if (eventTypeFilter && eventTypeFilter !== "all") {
      fallback = fallback.eq("event_type", eventTypeFilter);
    }
    if (bookingStatusFilter && bookingStatusFilter !== "all") {
      fallback = fallback.eq("booking_status", bookingStatusFilter);
    }
    if (venueId) fallback = fallback.eq("venue_id", venueId);
    if (eventVenueId) fallback = fallback.eq("event_venue_id", eventVenueId);
    const retry = await fallback;
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  // Post-fetch filtering for past / upcoming. We do this in JS instead of SQL
  // so date strings (some rows store "2025-10-12", others store full ISO with
  // a TZ suffix) are handled uniformly.
  const rows = Array.isArray(data) ? data : [];
  if (!showAll && include !== "all") {
    // "Past" means the show happened OR was manually closed out.
    // We treat anything with date < today (in the server's local TZ) as past
    // when not explicitly closed out, and respect closed_out_at as a hard flag.
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const isPast = (e) => {
      if (e.closed_out_at) return true;
      if (!e.date) return false;
      const d = (e.date && e.date.length === 10 && e.date[4] === "-")
        ? new Date(`${e.date}T23:59:59`)
        : new Date(e.date);
      if (Number.isNaN(d.getTime())) return false;
      return d < startOfToday;
    };

    const filtered =
      include === "past"
        ? rows.filter(isPast).sort((a, b) => {
            // Past archive: most recent first
            const da = new Date(a.date).getTime();
            const db = new Date(b.date).getTime();
            return db - da;
          })
        : rows.filter((e) => !isPast(e));

    return new Response(JSON.stringify(filtered), { status: 200 });
  }

  return new Response(JSON.stringify(rows), { status: 200 });
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
    price: isPrivate ? null : (body.price ?? 0),
    ticketing_fee: isPrivate ? null : (body.ticketing_fee ?? 3.0),
    venue_rebate: isPrivate ? null : (body.venue_rebate ?? 0),
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
    facility_fee_enabled: body.facility_fee_enabled ?? true,
    is_free: body.is_free ?? false,
    on_sale_at: body.on_sale_at || null,
  };

  // Always include start_time/end_time (TEXT columns from private-events-v2 migration)
  eventRow.start_time = body.start_time || null;
  eventRow.end_time = body.end_time || null;

  const { data: event, error: eventError } = await admin
    .from("events")
    .insert(eventRow)
    .select()
    .single();

  if (eventError) {
    return new Response(JSON.stringify({ error: eventError.message }), { status: 500 });
  }

  // 1b. Auto-generate landing_page_slug for non-private events
  if (event.event_type !== "private" && body.title) {
    try {
      const baseSlug = slugify(body.title);
      if (baseSlug) {
        // Check for uniqueness, append suffix if needed
        let candidate = baseSlug;
        let counter = 1;
        let slugTaken = true;
        while (slugTaken) {
          const { data: existing } = await admin
            .from("events")
            .select("id")
            .eq("landing_page_slug", candidate)
            .neq("id", event.id)
            .maybeSingle();
          if (!existing) {
            slugTaken = false;
          } else {
            counter++;
            candidate = `${baseSlug}-${counter}`;
          }
        }
        await admin
          .from("events")
          .update({ landing_page_slug: candidate })
          .eq("id", event.id);
        event.landing_page_slug = candidate;
      }
    } catch (slugErr) {
      console.error("Failed to generate landing_page_slug:", slugErr);
      // Non-critical — event was already created successfully
    }
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
