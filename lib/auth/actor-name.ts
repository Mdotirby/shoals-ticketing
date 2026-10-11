import { createAdminClient } from "@/lib/supabase-server";
import type { AdminActor } from "./can";

/**
 * Who to write in a "recorded by" field, from the server rather than the client.
 *
 * The client has been passing getCookie("user-name"), set at login from
 * first_name with no max-age — a session cookie. It dies when the browser
 * closes, and anything recorded after that is stamped with nobody. A payout
 * was recorded that way during testing: amount, method and date all correct,
 * "by" blank.
 *
 * The signed-in actor is already known to every guarded route, so the name
 * comes from there instead. A client-supplied value still wins when there is
 * one — it is the same person and saves a lookup.
 */
export async function actorName(actor: AdminActor, supplied?: unknown): Promise<string | null> {
  const given = typeof supplied === "string" ? supplied.trim() : "";
  if (given) return given;

  const admin = createAdminClient();
  const { data } = await admin
    .from("admin_users")
    .select("first_name, last_name")
    .eq("id", actor.id)
    .maybeSingle();

  // Each part trimmed, not just the join: first_name is stored as "Matt "
  // with a trailing space on at least one row, which joined to "Matt  Irby".
  const name = [data?.first_name, data?.last_name]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean)
    .join(" ");
  // Email is a poor label on a settlement but a true one, and better than a
  // blank where a person should be.
  return name || actor.email || null;
}
