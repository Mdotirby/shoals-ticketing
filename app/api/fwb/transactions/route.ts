import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase-server";
import { getOrCreateWallet } from "@/lib/fwb/earn";

export async function GET(request: Request) {
  try {
    const venueId = request.headers.get("x-venue-id");
    if (!venueId) {
      return NextResponse.json({ error: "x-venue-id header is required" }, { status: 400 });
    }

    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Authorization required" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const authClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: { user }, error: userError } = await authClient.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const type = searchParams.get("type");
    const offset = (page - 1) * limit;

    const supabase = createAdminClient();
    const wallet = await getOrCreateWallet(user.id, venueId, supabase);

    // Build query
    let query = supabase
      .from("fwb_transactions")
      .select("*", { count: "exact" })
      .eq("wallet_id", wallet.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (type) {
      query = query.eq("transaction_type", type);
    }

    const { data: transactions, error: txnError, count } = await query;

    if (txnError) {
      return NextResponse.json({ error: txnError.message }, { status: 500 });
    }

    const total = count || 0;

    return NextResponse.json({
      transactions: transactions || [],
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("FWB transactions error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
