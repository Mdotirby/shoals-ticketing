// POST: validate a ticket QR code at the door
// Body: { qr_code }
// Returns: { valid: true, customer_name } or { valid: false, reason }

import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // TODO: Phase 6 — validate ticket
  // 1. Look up ticket by qr_code
  // 2. If not found → { valid: false, reason: "Ticket not found" }
  // 3. If already scanned → { valid: false, reason: "Already scanned" }
  // 4. Mark is_scanned = true, set scanned_at
  // 5. Return { valid: true, customer_name }
  return NextResponse.json({ message: `Validate ticket ${id} — not wired up yet` });
}
