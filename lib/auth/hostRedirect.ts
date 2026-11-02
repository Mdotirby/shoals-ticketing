import { getSupabaseBrowser } from "@/lib/supabase-browser";

const UNASSIGNED =
  "Your account isn't assigned to a venue yet. Ask your administrator to assign you, then sign in again.";

/**
 * Staff signed in on a site that isn't theirs: end the session here and send
 * them to their own site's login. Sessions are per host, so there is nothing
 * to carry across — they sign in again there.
 *
 * Returns `{ redirecting: true }` when the page is on its way out, and
 * `{ error }` when there is nowhere to send them. Otherwise this site is theirs.
 * The server refuses them either way (getAdminActor); this is only so they see
 * something better than a page of failed requests.
 */
export async function leaveIfWrongHost(accessToken: string): Promise<{ redirecting?: boolean; error?: string }> {
  const res = await fetch("/api/admin/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: accessToken }),
  });
  if (!res.ok) return {};

  const body = await res.json();
  if (!body.wrong_host) return {};

  await getSupabaseBrowser().auth.signOut();
  if (!body.home_url) return { error: UNASSIGNED };

  window.location.href = `${body.home_url}/login`;
  return { redirecting: true };
}
