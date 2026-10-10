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
import { HubProvider } from "./_hub/HubContext";
import HubShell from "./_hub/HubShell";
import { HUB_TABS, type HubTab } from "./_hub/config";
import { InterimSection } from "./_hub/interim";
import { HubEmpty } from "./_hub/ui";
import Summary from "./_hub/sections/Summary";
import Details from "./_hub/sections/Details";
import Tickets from "./_hub/sections/Tickets";
import Inventory from "./_hub/sections/Inventory";
import Promotions from "./_hub/sections/Promotions";
import Marketing from "./_hub/sections/Marketing";
import Orders from "./_hub/sections/Orders";
import Guests from "./_hub/sections/Guests";
import DayOf from "./_hub/sections/DayOf";
import Deal from "./_hub/sections/Deal";
import Settlement from "./_hub/sections/Settlement";

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

const INTERIM: HubTab[] = ["access"];

function Section({ tab, go }: { tab: HubTab; go: (t: HubTab) => void }) {
  if (tab === "summary") return <Summary go={go} />;
  if (tab === "details") return <Details />;
  if (tab === "tickets") return <Tickets go={go} />;
  if (tab === "inventory") return <Inventory />;
  if (tab === "promotions") return <Promotions />;
  if (tab === "marketing") return <Marketing />;
  if (tab === "orders") return <Orders />;
  if (tab === "guests") return <Guests />;
  if (tab === "dayof") return <DayOf />;
  if (tab === "deal") return <Deal go={go} />;
  if (tab === "settlement") return <Settlement />;
  if (INTERIM.includes(tab)) return <InterimSection key={tab} tab={tab} />;

  const elsewhere: Partial<Record<HubTab, { title: string; body: string; href?: string; cta?: string }>> = {
    activity: { title: "Activity is coming to this section", body: "Every edit, refund, hold and price change on this show will be listed here with who made it." },
  };
  const e = elsewhere[tab];
  if (!e) return null;
  return <HubEmpty title={e.title} body={e.body} ctas={e.href && e.cta ? [{ label: e.cta, href: e.href }] : []} />;
}
