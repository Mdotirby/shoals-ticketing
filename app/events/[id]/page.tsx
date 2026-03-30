import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase-server";
import { cookies } from "next/headers";
import { getOperator } from "@/lib/operators";
import EventDetailClient from "./EventDetailClient";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const admin = createAdminClient();

  // Fetch minimal event data for OG tags
  const { data: event } = await admin
    .from("events")
    .select("title, venue, date, image_url, description")
    .eq("id", id)
    .single();

  // Get operator for site_name
  const cookieStore = await cookies();
  const operatorSlug = cookieStore.get("operatorSlug")?.value ?? "venuecore";
  const operator = getOperator(operatorSlug);

  if (!event) {
    return { title: "Event Not Found" };
  }

  // Format date for description
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

  const description = dateStr
    ? `${dateStr} · ${event.venue || operator.name}`
    : event.description?.slice(0, 160) || `Get tickets at ${operator.name}`;

  return {
    title: `${event.title} | ${operator.name}`,
    description,
    openGraph: {
      title: event.title,
      description,
      siteName: operator.name,
      type: "website",
      ...(event.image_url ? { images: [{ url: event.image_url, width: 1200, height: 630 }] } : {}),
    },
    twitter: {
      card: event.image_url ? "summary_large_image" : "summary",
      title: event.title,
      description,
      ...(event.image_url ? { images: [event.image_url] } : {}),
    },
  };
}

export default function EventDetailPage() {
  return <EventDetailClient />;
}
