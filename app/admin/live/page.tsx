"use client";

import MergedPage from "@/app/components/admin/MergedPage";
import Pulse from "./_panels/Pulse";
import GuestCheckIn from "./_panels/GuestCheckIn";

/**
 * Tonight — PHASE1B § Merges: on show night nobody navigates, so live pulse
 * and guest check-in are one page. /admin/live?tab=pulse|guests. Pulse is
 * dayof.dc.html's show-night screen (hero, door KPIs, feed, tap-to-check-in)
 * and still links each show's full analytics at /admin/live/[eventId].
 * Guest check-in keeps the full list manager and its roles, artists
 * included — an artist sees only that tab. The scanner stays its own
 * surface, and selling stays at the box office POS.
 */
export default function TonightPage() {
  // The POS button lives in the Pulse hero now, as in dayof.dc.html — and
  // follows the same sidebar rule there, so an artist is never sent to the till.
  return (
    <MergedPage
      pageId="dayof"
      title="Tonight"
      sub="Live pulse and guest check-in"
      panels={{
        pulse: () => <Pulse />,
        guests: () => <GuestCheckIn />,
      }}
    />
  );
}
