"use client";

import MergedPage from "@/app/components/admin/MergedPage";
import Onboarding from "./_panels/Onboarding";
import People from "./_panels/People";
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
 */
export default function UsersAndTenantsPage() {
  return (
    <MergedPage
      pageId="identity"
      title="Users & tenants"
      sub="Onboarding, people, credentials & venues"
      panels={{
        onboarding: () => <Onboarding />,
        people: () => <People />,
        tenants: () => <Tenants />,
      }}
    />
  );
}
