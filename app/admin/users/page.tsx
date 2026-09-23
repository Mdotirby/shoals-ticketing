"use client";

import MergedPage from "@/app/components/admin/MergedPage";
import Onboarding from "./_panels/Onboarding";
import People from "./_panels/People";
import Portals from "./_panels/Portals";
import Access from "./_panels/Access";
import Tenants from "./_panels/Tenants";

/**
 * Users & tenants — the hub. PHASE1-EDIT-PAGES § 3 merges the team page,
 * the onboarding wizard and the venue (tenant) list into one page, in the
 * design's order: onboarding → people → tenants. Each tab is the old page
 * moved in unchanged; People keeps its credentials editor (email, phone,
 * access level, password override) as it was.
 *
 * Onboarding and Tenants are owner-only, as their routes were, so a venue
 * admin lands on People. The design's Credentials and Billing sections have
 * no screens behind them yet and are left out rather than shown empty.
 *
 * ── Why Access and Portals moved here ───────────────────────────────────
 * Who someone is, what they are allowed to do, and which door they come in
 * through are one subject, and they were three pages: this hub,
 * /admin/settings/permissions, and /portal — the last still on the old
 * structure. Granting an artist a login on one page while their capabilities
 * were governed on another is how an account nobody remembers issuing ends up
 * in the system. One page now, five tabs, in the order you work in them:
 * onboard someone, find them, give them a door, set what they can do, and see
 * which venue they belong to.
 */
export default function UsersAndTenantsPage() {
  return (
    <MergedPage
      pageId="identity"
      title="Users & tenants"
      sub="Onboarding, people, portals, access & venues"
      panels={{
        onboarding: () => <Onboarding />,
        people: () => <People />,
        portals: () => <Portals />,
        access: () => <Access />,
        tenants: () => <Tenants />,
      }}
    />
  );
}
