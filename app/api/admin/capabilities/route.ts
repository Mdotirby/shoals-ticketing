import { createAdminClient } from "@/lib/supabase-server";
import { requireCapability } from "@/lib/auth/can";
import { writeAudit } from "@/lib/auth/audit";
import { CAPABILITIES, defaultCapabilityLevel, type Capability, type CapabilityLevel } from "@/lib/auth/capabilities";
import { STAFF_LEVELS, type StaffLevel } from "@/lib/auth/roles";
import { NextResponse } from "next/server";

/**
 * The capability matrix — defaults, plus this venue's overrides.
 *
 * ── WHY THE TABLE MAY NOT EXIST ────────────────────────────────────────────
 * `role_capabilities` ships as plans/role-capabilities-migration.sql and is
 * hand-run, like every migration in this repo. Until it is, this endpoint
 * returns the compiled defaults and says so, and PUT refuses with a message
 * naming the migration rather than a 500. That is the same shape
 * /api/events/[id]/holds already uses for its own pending table.
 */

const LEVELS: CapabilityLevel[] = ["full", "scoped", "read", "none"];

type Override = { role: string; capability_key: string; level: string };

async function readOverrides(
  admin: ReturnType<typeof createAdminClient>,
  venueId: string | null
): Promise<{ rows: Override[]; tableMissing: boolean }> {
  let q = admin.from("role_capabilities").select("role, capability_key, level");
  q = venueId ? q.eq("venue_id", venueId) : q.is("venue_id", null);
  const { data, error } = await q;
  if (error) {
    if (/does not exist|schema cache|Could not find the table/i.test(error.message)) {
      return { rows: [], tableMissing: true };
    }
    return { rows: [], tableMissing: false };
  }
  return { rows: (data ?? []) as Override[], tableMissing: false };
}

export async function GET() {
  const guard = await requireCapability("assign_roles");
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();
  const venueId = guard.actor.venueId ?? null;
  const { rows, tableMissing } = await readOverrides(admin, venueId);

  const byKey = new Map(rows.map((r) => [`${r.role}:${r.capability_key}`, r.level]));

  const matrix = CAPABILITIES.map((cap) => ({
    capability: cap,
    cells: STAFF_LEVELS.map((role) => {
      const fallback = defaultCapabilityLevel(role as StaffLevel, cap as Capability);
      const override = byKey.get(`${role}:${cap}`);
      return {
        role,
        level: (override as CapabilityLevel) ?? fallback,
        // Shown as a dot on the cell — an operator needs to know which of these
        // is a decision somebody made and which is just the shipped default.
        overridden: !!override && override !== fallback,
      };
    }),
  }));

  // Seat counts per level, so the role cards say how many people this affects.
  const { data: staff } = await admin.from("admin_users").select("role");
  const seats: Record<string, number> = {};
  for (const s of staff ?? []) seats[s.role] = (seats[s.role] || 0) + 1;

  return NextResponse.json({
    roles: STAFF_LEVELS,
    matrix,
    seats,
    editable: !tableMissing,
    tableMissing,
    note: tableMissing
      ? "Showing the shipped defaults. Run plans/role-capabilities-migration.sql to make them editable per venue."
      : null,
  });
}

export async function PUT(request: Request) {
  const guard = await requireCapability("assign_roles", { write: true });
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const { role, capability, level } = body as {
    role?: string; capability?: string; level?: string;
  };

  if (!role || !capability || !level) {
    return NextResponse.json({ error: "role, capability and level are required" }, { status: 400 });
  }
  if (!STAFF_LEVELS.includes(role as StaffLevel)) {
    return NextResponse.json({ error: "Unknown role" }, { status: 400 });
  }
  if (!CAPABILITIES.includes(capability as Capability)) {
    return NextResponse.json({ error: "Unknown capability" }, { status: 400 });
  }
  if (!LEVELS.includes(level as CapabilityLevel)) {
    return NextResponse.json({ error: "Unknown level" }, { status: 400 });
  }

  // Owner is not editable. An owner who can be demoted by whoever holds
  // assign_roles is not an owner — that is one UPDATE away from a complete
  // takeover of the account. The database trigger enforces this too; this is
  // the polite refusal before it gets there.
  if (role === "owner") {
    return NextResponse.json(
      { error: "Owner holds every capability and cannot be reduced." },
      { status: 403 }
    );
  }

  // You cannot grant a capability you do not hold yourself. Without this,
  // a venue admin without `sign_payout` could grant it to a role they hold
  // and sign their own payouts through the side door.
  const own = await requireCapability(capability as Capability);
  if (!own.ok) {
    return NextResponse.json(
      { error: "You cannot change a capability you do not hold." },
      { status: 403 }
    );
  }

  const admin = createAdminClient();
  const venueId = guard.actor.venueId ?? null;

  const { error } = await admin
    .from("role_capabilities")
    .upsert(
      {
        venue_id: venueId,
        role,
        capability_key: capability,
        level,
        updated_by: guard.actor.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "venue_id,role,capability_key" }
    );

  if (error) {
    if (/does not exist|schema cache|Could not find the table/i.test(error.message)) {
      return NextResponse.json(
        { error: "Capability overrides aren't set up yet — run plans/role-capabilities-migration.sql first." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await writeAudit(guard.actor, {
    action: "capability.changed",
    targetType: "role",
    targetId: role,
    detail: {
      capability,
      level,
      previous_default: defaultCapabilityLevel(role as StaffLevel, capability as Capability),
    },
  });

  return NextResponse.json({ ok: true });
}
