// GET: ticket types for an event (public)
// POST: create ticket type (admin only)

import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // TODO: fetch ticket types for event from Supabase
  return NextResponse.json({ message: `Ticket types for event ${id} — not wired up yet` });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // TODO: create ticket type for event (admin only)
  return NextResponse.json({ message: `Create ticket type for event ${id} — not wired up yet` });
}
