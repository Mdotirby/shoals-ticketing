import { redirect } from "next/navigation";

/**
 * Access control now lives in the identity hub, beside People and Portals —
 * who someone is, what they may do, and which door they come in through are
 * one subject and were three pages.
 *
 * Kept as a redirect rather than deleted: this URL is in bookmarks, in the
 * sidebar_permissions seed, and in older audit entries.
 */
export default function PermissionsRedirect() {
  redirect("/admin/users?tab=access");
}
