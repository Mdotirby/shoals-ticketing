// GET: list all orders (admin only), with filters
// Query params: ?event_id=...&status=...&from=...&to=...

import { NextResponse } from "next/server";

export async function GET(request: Request) {
  // TODO: Phase 5 — list orders with filters
  // 1. Verify admin auth
  // 2. Parse query params for filters
  // 3. Query orders from Supabase with joins to events
  return NextResponse.json({ message: "Orders list — not wired up yet" });
}
