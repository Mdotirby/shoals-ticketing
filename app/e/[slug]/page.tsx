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

  const priceStr = event.price ? `$${event.price} ALL-IN` : "Free";
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
      "id, title, venue, date, price, image_url, description, venue_id, event_venue_id, event_type, is_free, on_sale_at, capacity, landing_page_slug, start_time, end_time"
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

  // 4. Social proof: count of paid orders
  const { count: orderCount } = await admin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("event_id", event.id)
    .eq("status", "paid");

  // 5. Build ticket type data with all-in prices
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

  // Fallback: if no tiers, use the event base price
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
      }}
      ticketTypes={ticketTypes}
      attendeeCount={orderCount || 0}
    />
  );
}
