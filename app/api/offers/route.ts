import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function GET() {
  const { data, error } = await supabase
    .from("artist_offers")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 200 });
}

export async function POST(request: Request) {
  const body = await request.json();

  const { data, error } = await supabase
    .from("artist_offers")
    .insert({
      artist_name: body.artist_name,
      venue: body.venue || null,
      event_date: body.event_date || null,
      guarantee: body.guarantee || null,
      door_split: body.door_split || null,
      merch_split: body.merch_split || null,
      terms: body.terms || null,
      notes: body.notes || null,
      status: body.status || "draft",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
