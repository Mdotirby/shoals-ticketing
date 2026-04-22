/**
 * Shared cron authorization for /api/cron/email-engine/* routes.
 * Vercel Cron attaches `Authorization: Bearer ${CRON_SECRET}` when the
 * env var is present — we require it in production. Local dev runs
 * without a secret and is permitted.
 */
import type { NextRequest } from "next/server";

export function authorizeCron(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return true;
  return req.headers.get("authorization") === `Bearer ${expected}`;
}
