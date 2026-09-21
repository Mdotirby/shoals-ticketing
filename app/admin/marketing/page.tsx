"use client";

import MergedPage from "@/app/components/admin/MergedPage";
import Campaigns from "./_panels/Campaigns";
import Broadcasts from "./_panels/Broadcasts";
import Auctions from "./_panels/Auctions";
import Sponsors from "./_panels/Sponsors";
import MarketRadarPage from "@/modules/market-radar/dashboard/MarketRadarPage";

/**
 * Marketing — five routes, one page (PHASE1B § Merges): campaigns,
 * broadcasts, auctions, market radar and sponsors. Each tab is the page that
 * used to live at its own route, moved here unchanged; the old routes
 * redirect to their tab (next.config.ts), and their detail pages
 * (/admin/broadcasts/new, /admin/auctions/[id]/edit, …) stay where they are.
 */
export default function MarketingPage() {
  return (
    <MergedPage
      pageId="marketing"
      title="Marketing"
      sub="Campaigns, broadcasts, auctions, radar & sponsors"
      panels={{
        campaigns: () => <Campaigns />,
        broadcasts: () => <Broadcasts />,
        auctions: () => <Auctions />,
        radar: () => <MarketRadarPage />,
        sponsors: () => <Sponsors />,
      }}
    />
  );
}
