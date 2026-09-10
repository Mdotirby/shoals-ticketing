import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { normalizeRole, type ResolvedRole } from "./roles";
import {
  defaultCapabilityLevel,
  grants,
  grantsWrite,
  type Capability,
  type CapabilityLevel,
} from "./capabilities";

/**
 * Server-side access control for /api/admin/*.
 *
 * WHY THIS EXISTS — this is a security fix, not a design one
 * ---------------------------------------------------------
 * middleware.ts guards protected routes with
 * `pathname.startsWith("/admin")`. /api/admin/* starts with "/api/", so that
 * test is false and the middleware never guarded any admin API route. Twenty-
 * five of the twenty-seven route files then did no check of their own and used
 * createAdminClient() — the service-role client, which bypasses RLS.
 *
 * Verified against a running server before writing this, with no cookies and no
 * Authorization header:
 *
 *   GET /api/admin/dashboard  → 200, full financials
 *   GET /api/admin/users      → 200, 32 staff rows incl. email, phone, address
 *
 * Reads only — nothing mutating was exercised — but POST /api/admin/orders/
 * [orderId]/refund sat behind exactly the same absence of a check.
 *
 * HOW IT AUTHENTICATES
 * --------------------
 * By cookie, following app/api/agents/portal/route.ts, which is the one route
 * in the codebase already doing this. The Bearer-token helper in
 * lib/fwb/admin-auth.ts is NOT usable here: admin pages call these routes with
 * a plain fetch() and no Authorization header, so requiring a Bearer token
 * would authenticate nobody and lock the admin out.
 *
 * FAILS CLOSED. No session, no admin_users row, an unrecognised role string, or
 * a capability the level does not hold — all refuse. Legacy role strings still
 * in the database are resolved through normalizeRole(), so this works before
 * and after plans/role-taxonomy-migration.sql is run.
 */

export type AdminActor = {
  id: string;
  email: string | null;
  /** Role string exactly as stored. */
  role: string;
  resolved: ResolvedRole;
  venueId: string | null;
  /**
   * This venue's capability overrides, keyed "role:capability".
   *
   * Loaded WITH the actor rather than fetched inside can(). can() is
   * synchronous and called from dozens of handlers; making it async to read a
   * table would have meant touching every one. The actor is already an async
   * load, so the overrides ride along on it and can() stays a pure function of
   * what it was handed.
   *
   * Empty when the table has not been migrated yet, which is the same thing as
   * having no overrides — the compiled defaults answer either way.
   */
  capabilityOverrides: Record<string, CapabilityLevel>;
};

/** Reads the cookie session and the admin_users row. Null when either is absent. */
export async function getAdminActor(): Promise<AdminActor | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: record } = await admin
    .from("admin_users")
    .select("id, email, role, venue_id")
    .eq("id", user.id)
    .single();

  if (!record) return null;

  const venueId = record.venue_id ?? null;

  // Per-venue overrides (plans/role-capabilities-migration.sql). Missing table
  // and no rows are the same answer, so the failure is swallowed: an
  // un-migrated environment must resolve to the shipped defaults, not to a
  // 500 on every guarded route in the app.
  const capabilityOverrides: Record<string, CapabilityLevel> = {};
  try {
    let q = admin.from("role_capabilities").select("role, capability_key, level");
    q = venueId ? q.eq("venue_id", venueId) : q.is("venue_id", null);
    const { data: overrides } = await q;
    for (const o of overrides ?? []) {
      capabilityOverrides[`${o.role}:${o.capability_key}`] = o.level as CapabilityLevel;
    }
  } catch {
    /* defaults */
  }

  return {
    id: record.id,
    email: record.email ?? user.email ?? null,
    role: record.role,
    resolved: normalizeRole(record.role),
    venueId,
    capabilityOverrides,
  };
}

/**
 * What level does this actor hold for this capability?
 *
 * Reads the design defaults today. When role_capabilities lands (§ 3.1) this is
 * the one function that needs to consult it, and every call site keeps working.
 */
export function can(
  actor: AdminActor | null,
  capability: Capability
): CapabilityLevel {
  if (!actor) return "none";
  // read_only is unresolved by design (§ 8) — no level, so no capabilities.
  if (!actor.resolved.level) return "none";

  // Owner is not overridable. The database trigger says the same thing, and so
  // does the API — an owner whose capabilities can be reduced by whoever holds
  // assign_roles is one UPDATE away from not being the owner.
  if (actor.resolved.level === "owner") {
    return defaultCapabilityLevel("owner", capability);
  }

  const override = actor.capabilityOverrides?.[`${actor.resolved.level}:${capability}`];
  return override ?? defaultCapabilityLevel(actor.resolved.level, capability);
}

type GuardFailure = { ok: false; response: NextResponse };
type GuardSuccess = { ok: true; actor: AdminActor; level: CapabilityLevel };
export type GuardResult = GuardSuccess | GuardFailure;

const unauthorized = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });
const forbidden = () =>
  NextResponse.json({ error: "Forbidden" }, { status: 403 });

/**
 * Authenticated and holds a staff level. The baseline for routes that expose
 * admin data but map to no single capability.
 */
export async function requireStaff(): Promise<GuardResult> {
  const actor = await getAdminActor();
  if (!actor) return { ok: false, response: unauthorized() };
  if (!actor.resolved.level) return { ok: false, response: forbidden() };
  return { ok: true, actor, level: "full" };
}

/**
 * Holds `capability` at any level. Pass `write: true` for mutating handlers so
 * a `read` grant is refused rather than treated as permission.
 */
export async function requireCapability(
  capability: Capability,
  options: { write?: boolean } = {}
): Promise<GuardResult> {
  const actor = await getAdminActor();
  if (!actor) return { ok: false, response: unauthorized() };

  const level = can(actor, capability);
  const allowed = options.write ? grantsWrite(level) : grants(level);
  if (!allowed) return { ok: false, response: forbidden() };

  return { ok: true, actor, level };
}
