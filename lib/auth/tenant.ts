import { can } from "./can";
import type { AdminActor } from "./can";

/**
 * Which venue's rows may this actor see?
 *
 * The platform is multi-tenant: venues run on their own subdomain
 * (venuename.venuecore.live) and must never see another venue's data. Several
 * routes took `?venue_id=` from the query string and filtered on it, which is
 * not a tenant boundary — it is a suggestion. Omitting the parameter returned
 * every tenant's rows, and supplying someone else's returned theirs.
 *
 * The rule, in one place:
 *
 *   • An actor with `cross_tenant_reporting` (the platform owner) may ask for
 *     any venue, or for all of them by asking for none.
 *   • Everyone else is pinned to the venue on their own admin_users row,
 *     whatever the request said. A request for another venue is not an error
 *     to argue with — it simply returns their own venue, because the client
 *     does not get a vote on this.
 *   • An actor with no venue and no cross-tenant capability can see nothing.
 *     Returning "everything" for a null venue is how the leak worked.
 *
 * Returns the venue id to filter by, `null` to mean "no filter — all tenants"
 * (only ever for a cross-tenant actor), or `DENY` when the answer is nothing.
 */
export const DENY = Symbol("deny");

export function tenantScope(
  actor: AdminActor | null,
  requestedVenueId?: string | null,
): string | null | typeof DENY {
  if (!actor) return DENY;

  const crossTenant = can(actor, "cross_tenant_reporting") !== "none";
  if (crossTenant) {
    // The owner may narrow to one venue, or see everything by not asking.
    return requestedVenueId && requestedVenueId.trim() ? requestedVenueId.trim() : null;
  }

  // Pinned to their own venue. The requested value is ignored on purpose.
  return actor.venueId ?? DENY;
}

/**
 * Apply the scope to a Supabase query builder.
 *
 * Kept as a helper so no call site has to remember that `null` means "do not
 * filter" while DENY means "return nothing" — getting those two the wrong way
 * round is precisely the bug this file exists to prevent.
 */
export function applyTenantScope<T extends { eq: (col: string, val: unknown) => T }>(
  query: T,
  scope: string | null | typeof DENY,
  column = "venue_id",
): T {
  if (scope === DENY) {
    // Impossible value — an empty result without a second code path.
    return query.eq(column, "00000000-0000-0000-0000-000000000000");
  }
  return scope === null ? query : query.eq(column, scope);
}
