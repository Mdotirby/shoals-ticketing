// GET: list admin users (full_admin only)
// POST: create admin user (full_admin only)

import { NextResponse } from "next/server";

export async function GET() {
  // TODO: Phase 5 — list admin users
  return NextResponse.json({ message: "Admin users list — not wired up yet" });
}

export async function POST(request: Request) {
  // TODO: Phase 5 — create admin user
  // 1. Create user in Supabase Auth
  // 2. Insert record in admin_users table with role
  return NextResponse.json({ message: "Create admin user — not wired up yet" });
}
