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

  const { data, error } = await admin
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

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify(data), { status: 201 });
}
