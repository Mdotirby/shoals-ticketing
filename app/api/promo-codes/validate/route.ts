import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// POST /api/promo-codes/validate
// Body: { code, event_id }
// Returns: { valid, discount_type, discount_value, promo_code_id } or { valid: false, error }
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { code, event_id } = body;

    if (!code || !event_id) {
      return NextResponse.json(
        { valid: false, error: "code and event_id are required" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    const { data: promo, error } = await admin
      .from("promo_codes")
      .select("*")
      .eq("event_id", event_id)
      .eq("code", code.toUpperCase().trim())
      .eq("active", true)
      .single();

    if (error || !promo) {
      return NextResponse.json({ valid: false, error: "Invalid promo code" });
    }

    // Check expiry
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
      return NextResponse.json({ valid: false, error: "This promo code has expired" });
    }

    // Check max uses
    if (promo.max_uses !== null && promo.current_uses >= promo.max_uses) {
      return NextResponse.json({ valid: false, error: "This promo code has reached its maximum uses" });
    }

    return NextResponse.json({
      valid: true,
      promo_code_id: promo.id,
      discount_type: promo.discount_type,
      discount_value: parseFloat(promo.discount_value),
    });
  } catch (err) {
    console.error("Validate promo code error:", err);
    return NextResponse.json(
      { valid: false, error: "Failed to validate promo code" },
      { status: 500 }
    );
  }
}
