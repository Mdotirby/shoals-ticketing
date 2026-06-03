import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase-server";
import { getOperator } from "@/lib/operators";
import EventLandingPage from "./EventLandingPage";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
};

// ── OG Metadata for social sharing ──────────────────────────────────────────
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const admin = createAdminClient();

  const { data: event } = await admin
    .from("events")
    .select("title, venue, date, image_url, description, price")
    .eq("landing_page_slug", slug)
    .eq("status", "published")
    .single();

  const cookieStore = await cookies();
  const operatorSlug = cookieStore.get("operatorSlug")?.value ?? "venuecore";
  const operator = getOperator(operatorSlug);

  if (!event) {
    return { title: "Event Not Found" };
  }

  let dateStr = "";
  if (event.date) {
    try {
      const d = new Date(event.date);
      dateStr = d.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      dateStr = event.date;
    }
  }

  const priceStr = event.price ? `$${event.price}` : "Free";
  const description = dateStr
    ? `${dateStr} · ${event.venue || ""} · ${priceStr}`
    : event.description?.slice(0, 160) || `Get tickets at ${operator.name}`;

  return {
    title: `${event.title} — Get Tickets | ${operator.name}`,
    description,
    openGraph: {
      title: `${event.title} — Get Tickets`,
      description,
      siteName: operator.name,
      type: "website",
      ...(event.image_url
        ? { images: [{ url: event.image_url, width: 1200, height: 630 }] }
        : {}),
    },
    twitter: {
      card: event.image_url ? "summary_large_image" : "summary",
      title: `${event.title} — Get Tickets`,
      description,
      ...(event.image_url ? { images: [event.image_url] } : {}),
    },
  };
}

// ── Server Component: fetch all data, pass to client ────────────────────────
export default async function LandingPage({ params }: Props) {
  const { slug } = await params;
  const admin = createAdminClient();

  // 1. Fetch event by landing_page_slug
  const { data: event, error: eventError } = await admin
    .from("events")
    .select(
      "id, title, venue, date, price, image_url, description, venue_id, event_venue_id, event_type, is_free, on_sale_at, capacity, landing_page_slug, start_time, end_time, facility_fee_enabled, external_ticket_url, external_ticket_label"
    )
    .eq("landing_page_slug", slug)
    .eq("status", "published")
    .single();

  if (eventError || !event) {
    notFound();
  }

  // Exclude private events from public landing pages
  if (event.event_type === "private") {
    notFound();
  }

  // 2. Fetch ticket tiers
  const { data: tiers } = await admin
    .from("ticket_tiers")
    .select("id, event_id, tier_name, price, capacity, sort_order")
    .eq("event_id", event.id)
    .order("sort_order", { ascending: true });

  // 2b. Count issued tickets per tier — tickets.ticket_type_id is the authoritative field
  // (orders.tier_id is not persisted by the webhook).
  const { data: ticketRows } = await admin
    .from("tickets")
    .select("ticket_type_id")
    .eq("event_id", event.id);

  const soldByTier: Record<string, number> = {};
  for (const row of ticketRows ?? []) {
    if (row.ticket_type_id) {
      soldByTier[row.ticket_type_id] = (soldByTier[row.ticket_type_id] ?? 0) + 1;
    }
  }

  // 3. Fetch venue fees
  let fees = { ticketing_fee: 3.0, facility_fee: 0, tax_rate: 0.095 };

  if (event.event_venue_id) {
    const { data: ev } = await admin
      .from("event_venues")
      .select("ticketing_fee, facility_fee, tax_rate, name, full_address")
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
      .select("ticketing_fee, facility_fee, tax_rate, name")
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

  // Zero out facility fee if disabled on this event
  if (event.facility_fee_enabled === false) {
    fees.facility_fee = 0;
  }

  // Normalize tax rate (accepts 9.5 or 0.095)
  if (fees.tax_rate > 1) {
    fees.tax_rate = fees.tax_rate / 100;
  }

  // 4. Social proof: count of paid orders
  const { count: orderCount } = await admin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("event_id", event.id)
    .eq("status", "paid");

  // 5. Build ticket type data with all-in prices
  // Stripe charges 2.7% + $0.30 per transaction (same as OrderSummary)
  const STRIPE_PERCENT_FEE = 0.027;
  const STRIPE_FLAT_FEE = 0.3;

  function calcAllIn(base: number): number {
    const tax = Math.round(base * fees.tax_rate * 100) / 100;
    const subtotalBeforeStripe = base + fees.ticketing_fee + fees.facility_fee + tax;
    const processingFee = Math.round((subtotalBeforeStripe * STRIPE_PERCENT_FEE + STRIPE_FLAT_FEE) * 100) / 100;
    return Math.round((subtotalBeforeStripe + processingFee) * 100) / 100;
  }

  const ticketTypes = (tiers && tiers.length > 0 ? tiers : []).map((t) => {
    return {
      id: t.id,
      name: t.tier_name,
      basePrice: t.price,
      allInPrice: calcAllIn(t.price),
      capacity: t.capacity,
      quantitySold: soldByTier[t.id] ?? 0,
    };
  });

  // Fallback: if no tiers, use the event base price
  if (ticketTypes.length === 0 && event.price != null) {
    ticketTypes.push({
      id: `${event.id}-ga`,
      name: "General Admission",
      basePrice: event.price,
      allInPrice: calcAllIn(event.price),
      capacity: event.capacity || 500,
      quantitySold: 0,
    });
  }

  // 6. Check presale availability (no codes exposed — flag only)
  let presaleAvailable = false;
  try {
    const now = new Date().toISOString();
    const { data: presaleRows } = await admin
      .from("event_presales")
      .select("enabled, starts_at, ends_at")
      .eq("event_id", event.id)
      .eq("enabled", true);

    if (presaleRows && presaleRows.length > 0) {
      presaleAvailable = presaleRows.some((row) => {
        if (row.starts_at && row.starts_at > now) return false;
        if (row.ends_at && row.ends_at < now) return false;
        return true;
      });
    }
  } catch {
    // Table may not exist yet — silently skip
  }

  // 7. Fetch featured artists assigned to this event
  const { data: assignments } = await admin
    .from("artist_event_assignments")
    .select("artist_id")
    .eq("event_id", event.id);

  let featuredArtists: { id: string; name: string; avatar_url?: string; website_url?: string }[] = [];
  if (assignments && assignments.length > 0) {
    const artistIds = assignments.map((a: { artist_id: string }) => a.artist_id);
    const { data: artistData } = await admin
      .from("admin_users")
      .select("id, first_name, last_name, avatar_url, website_url")
      .in("id", artistIds);

    if (artistData) {
      featuredArtists = artistData.map((a: { id: string; first_name: string | null; last_name: string | null; avatar_url: string | null; website_url: string | null }) => ({
        id: a.id,
        name: [a.first_name, a.last_name].filter(Boolean).join(" ") || "Artist",
        avatar_url: a.avatar_url || undefined,
        website_url: a.website_url || undefined,
      }));
    }
  }

  // 8. Fetch venue info for map/directions
  let venueInfo: {
    address?: string;
    lat?: number;
    lng?: number;
    phone?: string;
    email?: string;
    directions_car?: string;
    parking_info?: string;
    directions_transit?: string;
  } | undefined;

  if (event.event_venue_id) {
    const { data: ev } = await admin
      .from("event_venues")
      .select("full_address, lat, lng, phone, email, directions_by_car, parking_info, directions_public_transit")
      .eq("id", event.event_venue_id)
      .single();
    if (ev) {
      venueInfo = {
        address: ev.full_address || undefined,
        lat: ev.lat || undefined,
        lng: ev.lng || undefined,
        phone: ev.phone || undefined,
        email: ev.email || undefined,
        directions_car: ev.directions_by_car || undefined,
        parking_info: ev.parking_info || undefined,
        directions_transit: ev.directions_public_transit || undefined,
      };
    }
  } else if (event.venue_id) {
    const { data: v } = await admin
      .from("venues")
      .select("address_street, address_city, address_state, address_zip, buyer_phone, buyer_email")
      .eq("id", event.venue_id)
      .single();
    if (v) {
      const parts = [v.address_street, v.address_city, v.address_state, v.address_zip].filter(Boolean);
      venueInfo = {
        address: parts.length > 0 ? parts.join(", ") : undefined,
        phone: v.buyer_phone || undefined,
        email: v.buyer_email || undefined,
      };
    }
  }

  // 9. Fetch other upcoming events for post-checkout YMAL
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  let otherEventsQuery = admin
    .from("events")
    .select("id, title, venue, date, price, image_url, is_free, on_sale_at")
    .eq("status", "published")
    .or("event_type.is.null,event_type.neq.private")
    .neq("id", event.id)
    .gte("date", todayStr)
    .order("date", { ascending: true })
    .limit(8);

  // Filter by same promoter/city (venue_id) when available
  if (event.venue_id) {
    otherEventsQuery = otherEventsQuery.eq("venue_id", event.venue_id);
  }

  const { data: otherEventsRaw } = await otherEventsQuery;

  const otherEvents = (otherEventsRaw ?? [])
    .filter((e) => !e.on_sale_at || new Date(e.on_sale_at) <= now)
    .slice(0, 4)
    .map((e) => ({
      id: e.id as string,
      title: e.title as string,
      venue: e.venue as string,
      date: e.date as string,
      price: (e.price ?? 0) as number,
      image_url: (e.image_url ?? undefined) as string | undefined,
      is_free: (e.is_free ?? false) as boolean,
    }));

  return (
    <EventLandingPage
      event={{
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
        externalTicketUrl: event.external_ticket_url || null,
        externalTicketLabel: event.external_ticket_label || null,
      }}
      ticketTypes={ticketTypes}
      attendeeCount={orderCount || 0}
      featuredArtists={featuredArtists}
      venueInfo={venueInfo}
      slug={slug}
      presaleAvailable={presaleAvailable}
      fees={{
        ticketingFee: fees.ticketing_fee,
        facilityFee: fees.facility_fee,
        taxRate: fees.tax_rate,
      }}
      otherEvents={otherEvents}
    />
  );
}
