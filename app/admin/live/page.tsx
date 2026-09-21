"use client";

import Link from "next/link";
import MergedPage from "@/app/components/admin/MergedPage";
import { useAdminNav } from "@/app/components/admin/AdminNavContext";
import { visibleNav } from "@/lib/admin/nav";
import Pulse from "./_panels/Pulse";
import GuestCheckIn from "./_panels/GuestCheckIn";

/**
 * Tonight — PHASE1B § Merges: on show night nobody navigates, so live pulse
 * and guest check-in are one page. /admin/live?tab=pulse|guests; each tab is
 * the old page moved in unchanged. Pulse still picks a show and opens
 * /admin/live/[eventId]. Guest check-in keeps its roles, artists included —
 * an artist sees only that tab. The scanner stays its own surface, and
 * selling stays at the box office POS.
 */
export default function TonightPage() {
  // The POS button follows the sidebar's own Box office entry — an artist
  // checking in their guests doesn't get sent to the till.
  const { role, perms } = useAdminNav();
  const canSell = visibleNav(role, perms).some((g) => g.pages.some((p) => p.id === "boxoffice"));
  return (
    <MergedPage
      pageId="dayof"
      title="Tonight"
      sub="Live pulse and guest check-in"
      actions={
        canSell ? (
          <Link href="/boxoffice" className="btn btn-primary">
            Open box office POS
          </Link>
        ) : undefined
      }
      panels={{
        pulse: () => <Pulse />,
        guests: () => <GuestCheckIn />,
      }}
    />
  );
}
