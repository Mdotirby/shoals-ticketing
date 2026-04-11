import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// GET: fetch all trackable links for an event
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("trackable_links")
      .select("*")
      .eq("event_id", id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data ?? [], { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// POST: create a new trackable link for an event
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const admin = createAdminClient();
    const body = await request.json();

    if (!body.label || !body.slug) {
      return NextResponse.json(
        { error: "label and slug are required" },
        { status: 400 }
      );
    }

    // Look up the event to get venue_id and landing_page_slug
    const { data: event, error: eventError } = await admin
      .from("events")
      .select("venue_id, landing_page_slug")
      .eq("id", id)
      .single();

    if (eventError) {
      return NextResponse.json(
        { error: "Event not found: " + eventError.message },
        { status: 404 }
      );
    }

    // Build destination_url from the request origin
    // If destination_type is "landing_page", point to /e/[landing_page_slug] instead of /events/[id]
    const origin = new URL(request.url).origin;
    let destination_url: string;
    if (body.destination_type === "landing_page" && event.landing_page_slug) {
      destination_url = `${origin}/e/${event.landing_page_slug}?ref=${body.slug}`;
    } else {
      destination_url = `${origin}/events/${id}?ref=${body.slug}`;
    }

    const { data, error } = await admin
      .from("trackable_links")
      .insert({
        event_id: id,
        venue_id: event.venue_id || null,
        slug: body.slug,
        label: body.label,
        source: body.source || null,
        medium: body.medium || null,
        campaign: body.campaign || null,
        destination_url,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE: delete a trackable link for an event
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const admin = createAdminClient();

    // Support both body { id } and query param ?linkId=xxx
    const url = new URL(request.url);
    let linkId = url.searchParams.get("linkId");

    if (!linkId) {
      const body = await request.json().catch(() => ({}));
      linkId = body.id || null;
    }

    if (!linkId) {
      return NextResponse.json(
        { error: "linkId is required (query param or body.id)" },
        { status: 400 }
      );
    }

    const { error } = await admin
      .from("trackable_links")
      .delete()
      .eq("id", linkId)
      .eq("event_id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
