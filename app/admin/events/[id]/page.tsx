"use client";

/**
 * Event hub — built to handoff/screens/eventhub.dc.html.
 *
 * One page per show: pick a show and manage every part of it here, the way
 * a TM1 event page works. `?tab=` names the section; the frame (header,
 * KPIs, grouped sub-nav, save bar) is HubShell and the data every section
 * shares is HubContext.
 *
 * Sections land one at a time. Until a section is rebuilt to the mockup it
 * runs as the old workspace tab (_hub/interim.tsx) or, where the workspace
 * had nothing, points at the page that still owns it.
 */

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { useTabParam } from "@/lib/admin/useTabParam";
import { HubProvider, useHub } from "./_hub/HubContext";
import HubShell from "./_hub/HubShell";
import { HUB_TABS, type HubTab } from "./_hub/config";
import { InterimSection } from "./_hub/interim";
import { HubEmpty } from "./_hub/ui";
import Summary from "./_hub/sections/Summary";
import Details from "./_hub/sections/Details";
import Tickets from "./_hub/sections/Tickets";

export default function EventHubPage() {
  const id = useParams().id as string;
  return (
    <Suspense fallback={<div className="hub hub-booting">Loading show…</div>}>
      <HubProvider id={id}>
        <Hub />
      </HubProvider>
    </Suspense>
  );
}

function Hub() {
  const [tab, setTab] = useTabParam<HubTab>(HUB_TABS);
  return (
    <HubShell tab={tab} setTab={setTab}>
      <Section tab={tab} go={setTab} />
    </HubShell>
  );
}

const INTERIM: HubTab[] = ["inventory", "orders", "settlement", "marketing", "guests", "access"];

function Section({ tab, go }: { tab: HubTab; go: (t: HubTab) => void }) {
  const { id, offer } = useHub();
  if (tab === "summary") return <Summary go={go} />;
  if (tab === "details") return <Details />;
  if (tab === "tickets") return <Tickets go={go} />;
  if (INTERIM.includes(tab)) return <InterimSection key={tab} tab={tab} />;

  const elsewhere: Partial<Record<HubTab, { title: string; body: string; href?: string; cta?: string }>> = {
    promotions: { title: "Promo codes are still on the edit form", body: "Discount and presale codes move into this section next.", href: `/admin/events/${id}/edit?tab=promo`, cta: "Open promo & tracking" },
    dayof: { title: "The live view is still its own page", body: "Scan velocity, the capacity gauge and recent check-ins move into this section next.", href: `/admin/live/${id}`, cta: "Open the live view" },
    deal: offer
      ? { title: "The deal is still on the offer", body: "The linked offer's deal, scaling and P&L move into this section next.", href: `/admin/offers/${offer.id}`, cta: "Open the offer" }
      : { title: "No offer linked", body: "Link the signed offer for this show to bring in its deal, scaling and expenses, or start a new offer.", href: "/admin/offers", cta: "Go to offers" },
    activity: { title: "Activity is coming to this section", body: "Every edit, refund, hold and price change on this show will be listed here with who made it." },
  };
  const e = elsewhere[tab];
  if (!e) return null;
  return <HubEmpty title={e.title} body={e.body} ctas={e.href && e.cta ? [{ label: e.cta, href: e.href }] : []} />;
}
