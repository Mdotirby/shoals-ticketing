import { createAdminClient } from "@/lib/supabase-server";

export async function GET() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("events")
    .select("id,title,venue,date,price,image_url,ticketing_fee,venue_rebate,status")
    .or("status.eq.published,status.is.null")
    .order("date", { ascending: true });
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify(data ?? []), { status: 200 })
}

export async function POST(request) {
  const admin = createAdminClient();
  const body = await request.json();

  // 1. Insert the event
  const { data: event, error: eventError } = await admin
    .from("events")
    .insert({
      title: body.title,
      venue: body.venue,
      date: body.date,
      price: body.price,
      ticketing_fee: body.ticketing_fee ?? 3.0,
      venue_rebate: body.venue_rebate ?? 0,
      description: body.description || null,
      image_url: body.image_url || null,
      status: body.status || "published",
    })
    .select()
    .single();

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
      // Event was created but tiers failed — log and return partial error
      console.error("Failed to insert tiers:", tierError.message);
      return new Response(
        JSON.stringify({ ...event, _tierError: tierError.message }),
        { status: 201 }
      );
    }
  }

  return new Response(JSON.stringify(event), { status: 201 });
}
