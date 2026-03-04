import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// GET /api/promo-codes?event_id=...
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("event_id");

  const admin = createAdminClient();

  let query = admin
    .from("promo_codes")
    .select("*")
    .order("created_at", { ascending: false });

  if (eventId) {
    query = query.eq("event_id", eventId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

// POST /api/promo-codes
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { event_id, code, discount_type, discount_value, max_uses, expires_at } = body;

    if (!event_id || !code || !discount_type || discount_value == null) {
      return NextResponse.json(
        { error: "event_id, code, discount_type, and discount_value are required" },
        { status: 400 }
      );
    }

    if (!["fixed", "percentage"].includes(discount_type)) {
      return NextResponse.json(
        { error: "discount_type must be 'fixed' or 'percentage'" },
        { status: 400 }
      );
    }

    if (discount_type === "percentage" && (discount_value < 0 || discount_value > 100)) {
      return NextResponse.json(
        { error: "Percentage discount must be between 0 and 100" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    const { data, error } = await admin
      .from("promo_codes")
      .insert({
        event_id,
        code: code.toUpperCase().trim(),
        discount_type,
        discount_value: parseFloat(discount_value),
        max_uses: max_uses ? parseInt(max_uses) : null,
        expires_at: expires_at || null,
        active: true,
        current_uses: 0,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A promo code with this name already exists for this event" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("Create promo code error:", err);
    return NextResponse.json({ error: "Failed to create promo code" }, { status: 500 });
  }
}

// DELETE /api/promo-codes
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("promo_codes").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
