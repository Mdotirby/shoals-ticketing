// POST: upload image to Supabase Storage
// Returns: { url: "public URL of uploaded image" }

import { NextResponse } from "next/server";

export async function POST(request: Request) {
  // TODO: Phase 5 — image upload
  // 1. Verify admin auth
  // 2. Parse multipart form data
  // 3. Upload to Supabase Storage 'event-images' bucket
  // 4. Return public URL
  return NextResponse.json({ message: "Image upload — not wired up yet" });
}
