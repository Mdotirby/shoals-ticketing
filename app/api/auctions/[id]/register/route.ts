import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";

type RouteContext = { params: Promise<{ id: string }> };

// POST /api/auctions/[id]/register — register a bidder
export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const supabase = createAdminClient();
  const body = await request.json();

  const { first_name, last_name, email, phone } = body;

  if (!first_name || !last_name || !email || !phone) {
    return NextResponse.json(
      { error: "first_name, last_name, email, and phone are required." },
      { status: 400 }
    );
  }

  // Check if bidder already registered for this auction (by email)
  const { data: existing } = await supabase
    .from("auction_bidders")
    .select("*")
    .eq("auction_id", id)
    .eq("email", email.toLowerCase().trim())
    .single();

  if (existing) {
    // Return existing bidder record (idempotent)
    return NextResponse.json(existing);
  }

  const { data, error } = await supabase
    .from("auction_bidders")
    .insert({
      auction_id: id,
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
    })
    .select()
    .single();

  if (error) {
    // Handle unique constraint violation gracefully
    if (error.code === "23505") {
      const { data: existing2 } = await supabase
        .from("auction_bidders")
        .select("*")
        .eq("auction_id", id)
        .eq("email", email.toLowerCase().trim())
        .single();
      return NextResponse.json(existing2);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
