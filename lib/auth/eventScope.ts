import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminActor } from "./can";
import { tenantScope, DENY } from "./tenant";

/**
 * Is this show in the actor's tenant? For routes keyed by an event id that
 * the client supplies — the id alone is not a boundary (lib/auth/tenant).
 */
export async function eventInTenant(admin: SupabaseClient, actor: AdminActor, eventId: string): Promise<boolean> {
  const { data: ev } = await admin.from("events").select("venue_id").eq("id", eventId).maybeSingle();
  if (!ev) return false;
  const scope = tenantScope(actor, ev.venue_id);
  return scope !== DENY && (scope === null || scope === ev.venue_id);
}
