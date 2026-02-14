// GET: single offer detail
// PUT: update offer (status, fields)
// DELETE: delete offer

import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // TODO: Phase 7 — get offer detail
  return NextResponse.json({ message: `Offer ${id} — not wired up yet` });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // TODO: Phase 7 — update offer
  return NextResponse.json({ message: `Update offer ${id} — not wired up yet` });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // TODO: Phase 7 — delete offer
  return NextResponse.json({ message: `Delete offer ${id} — not wired up yet` });
}
