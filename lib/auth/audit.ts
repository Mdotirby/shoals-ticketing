import { createAdminClient } from "@/lib/supabase-server";
import type { AdminActor } from "./can";

/**
 * Append to audit_log. Insert-only by database trigger — see
 * plans/audit-log-migration.sql.
 *
 * NEVER THROWS. An audit write failing must not take down the action it is
 * recording: a refund that succeeded and then 500s because the log was
 * unreachable is worse than a refund with a missing log line. Failures are
 * reported to the server console and swallowed.
 *
 * That tradeoff is only acceptable because the log is append-only and the
 * table is indexed for reconciliation — a gap is detectable. If audit ever
 * becomes a compliance gate rather than an accountability trail, this decision
 * has to be revisited, and the caller has to handle the failure.
 */
export type AuditEntry = {
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  detail?: Record<string, unknown>;
  venueId?: string | null;
};

export async function writeAudit(
  actor: AdminActor | null,
  entry: AuditEntry
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
      venue_id: entry.venueId ?? actor?.venueId ?? null,
      actor_id: actor?.id ?? null,
      action: entry.action,
      target_type: entry.targetType ?? null,
      target_id: entry.targetId ?? null,
      detail: {
        // Denormalised on purpose: actor_id is ON DELETE SET NULL, so once a
        // staff member is removed the row would otherwise say only "someone".
        actor_email: actor?.email ?? null,
        actor_role: actor?.role ?? null,
        ...(entry.detail ?? {}),
      },
    });
  } catch (err) {
    console.error("audit_log write failed", entry.action, err);
  }
}
