import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("events")
    .select("id,title,venue,date,price,image_url,ticketing_fee,venue_rebate")
    .order("date", { ascending: true });
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify(data), { status: 200 })
}

export async function POST(request) {
  const body = await request.json();

  const { data, error } = await supabase
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
