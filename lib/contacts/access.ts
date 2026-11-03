import type { AdminActor } from "@/lib/auth/can";
import { tenantScope, DENY } from "@/lib/auth/tenant";
import type { createAdminClient } from "@/lib/supabase-server";
import { CONTACT_ROLES, EMAIL } from "./showContacts";

type Admin = ReturnType<typeof createAdminClient>;

/** The id alone is not a boundary (lib/auth/tenant.ts). */
export async function eventInScope(admin: Admin, actor: AdminActor, eventId: string): Promise<boolean> {
  const { data: event } = await admin.from("events").select("venue_id").eq("id", eventId).maybeSingle();
  if (!event) return false;
  const scope = tenantScope(actor, event.venue_id ?? null);
  return scope !== DENY && (scope === null || scope === event.venue_id);
}

/** A contact's fields from a request, or why they can't be saved. */
export function contactFields(body: Record<string, unknown>) {
  let name = String(body.name ?? "").trim() || null;
  let email = String(body.email ?? "").trim() || null;
  // An address typed into the name box still has to reach them.
  if (!email && name && EMAIL.test(name)) { email = name; name = null; }
  const phone = String(body.phone ?? "").trim() || null;
  const role = String(body.role ?? "other");
  if (!name && !email) return { error: "Add a name or an email." };
  if (email && !EMAIL.test(email)) return { error: `"${email}" isn't a valid email address.` };
  if (!CONTACT_ROLES.some((r) => r.value === role)) return { error: "Pick a role." };
  return { fields: { name, email, phone, role } };
}

