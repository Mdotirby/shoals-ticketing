// GET: list all artist offers (admin only)
// POST: create new offer (admin only)

import { NextResponse } from "next/server";

export async function GET() {
  // TODO: Phase 7 — list offers
  return NextResponse.json({ message: "Offers list — not wired up yet" });
}

export async function POST(request: Request) {
  // TODO: Phase 7 — create offer
  return NextResponse.json({ message: "Create offer — not wired up yet" });
}
