import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/landing/[slug] — Fetch event data by landing_page_slug.
 *
 * This is a fallback API for client-side use. The primary data path is
 * the server component in app/e/[slug]/page.tsx which queries directly.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const admin = createAdminClient();

    // Fetch event by landing_page_slug
    const { data: event, error } = await admin
      .from("events")
      .select(
        "id, title, venue, date, price, image_url, description, venue_id, event_venue_id, event_type, is_free, on_sale_at, capacity, landing_page_slug, start_time, end_time"
      )
      .eq("landing_page_slug", slug)
      .eq("status", "published")
      .single();

    if (error || !event || event.event_type === "private") {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Fetch ticket tiers
    const { data: tiers } = await admin
      .from("ticket_tiers")
      .select("id, tier_name, price, capacity, sort_order")
      .eq("event_id", event.id)
      .order("sort_order", { ascending: true });

    // Fetch venue fees
    let fees = { ticketing_fee: 3.0, facility_fee: 0, tax_rate: 0.095 };

    if (event.event_venue_id) {
      const { data: ev } = await admin
        .from("event_venues")
        .select("ticketing_fee, facility_fee, tax_rate")
        .eq("id", event.event_venue_id)
        .single();
      if (ev) {
        fees = {
          ticketing_fee: ev.ticketing_fee != null ? Number(ev.ticketing_fee) : fees.ticketing_fee,
          facility_fee: ev.facility_fee != null ? Number(ev.facility_fee) : fees.facility_fee,
          tax_rate: ev.tax_rate != null ? Number(ev.tax_rate) : fees.tax_rate,
        };
      }
    } else if (event.venue_id) {
      const { data: v } = await admin
        .from("venues")
        .select("ticketing_fee, facility_fee, tax_rate")
        .eq("id", event.venue_id)
        .single();
      if (v) {
        fees = {
          ticketing_fee: Number(v.ticketing_fee) || fees.ticketing_fee,
          facility_fee: Number(v.facility_fee) || fees.facility_fee,
          tax_rate: Number(v.tax_rate) || fees.tax_rate,
        };
      }
    }

    // Social proof count
    const { count: orderCount } = await admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("event_id", event.id)
      .eq("status", "paid");

    // Build ticket types with all-in prices
    const ticketTypes = (tiers && tiers.length > 0 ? tiers : []).map((t) => {
      const base = t.price;
      const allIn = base + fees.ticketing_fee + fees.facility_fee + base * fees.tax_rate;
      return {
        id: t.id,
        name: t.tier_name,
        basePrice: base,
        allInPrice: Math.ceil(allIn * 100) / 100,
        capacity: t.capacity,
      };
    });

    if (ticketTypes.length === 0 && event.price != null) {
      const base = event.price;
      const allIn = base + fees.ticketing_fee + fees.facility_fee + base * fees.tax_rate;
      ticketTypes.push({
        id: `${event.id}-ga`,
        name: "General Admission",
        basePrice: base,
        allInPrice: Math.ceil(allIn * 100) / 100,
        capacity: event.capacity || 500,
      });
    }

    return NextResponse.json({
      event: {
        id: event.id,
        title: event.title,
        venue: event.venue,
        date: event.date,
        startTime: event.start_time || null,
        endTime: event.end_time || null,
        imageUrl: event.image_url || null,
        description: event.description || null,
        isFree: event.is_free || false,
        onSaleAt: event.on_sale_at || null,
      },
      ticketTypes,
      attendeeCount: orderCount || 0,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
