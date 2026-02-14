// POST: admin login (wraps Supabase Auth signInWithPassword)
// Body: { email, password }
// Returns: session token + admin user profile (role, must_change_password)

import { NextResponse } from "next/server";

export async function POST(request: Request) {
  // TODO: Phase 1 — admin auth
  // 1. Sign in with Supabase Auth
  // 2. Look up admin_users record to get role
  // 3. Return session + profile
  return NextResponse.json({ message: "Admin auth — not wired up yet" });
}
