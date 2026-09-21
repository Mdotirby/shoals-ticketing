"use client";

import MergedPage from "@/app/components/admin/MergedPage";
import Profile from "./_panels/Profile";
import Branding from "./_panels/Branding";
import Pages from "./_panels/Pages";
import Procedures from "./_panels/Procedures";

/**
 * Venue settings — the design's six settings routes as one page (PHASE1B
 * § Merges): profile & fees, branding, storefront pages (FAQ), procedures.
 * The venue portal stays its own app at /portal and shows here as a link.
 * Fees keep their own guard inside the profile form: owner-edit only.
 *
 * Tabs, not the mockup's single scroll: procedures alone is a 65KB editor,
 * and a tab is what the sidebar's tab rows link to.
 */
export default function VenueSettingsPage() {
  return (
    <MergedPage
      pageId="settings"
      title="Venue settings"
      sub="Profile, fees, branding, storefront pages & procedures"
      panels={{
        profile: () => <Profile />,
        branding: () => <Branding />,
        pages: () => <Pages />,
        procedures: () => <Procedures />,
      }}
    />
  );
}
