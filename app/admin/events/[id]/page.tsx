"use client";

/**
 * Event hub — built to handoff/screens/eventhub.dc.html.
 *
 * One page per show: pick a show and manage every part of it here, the way
 * a TM1 event page works. `?tab=` names the section; the frame (header,
 * KPIs, grouped sub-nav, save bar) is HubShell and the data every section
 * shares is HubContext.
 *
 * Each section is its own file under _hub/sections, built to its part of
 * the mockup.
 */

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { useTabParam } from "@/lib/admin/useTabParam";
import { HubProvider } from "./_hub/HubContext";
import HubShell from "./_hub/HubShell";
import { HUB_TABS, type HubTab } from "./_hub/config";
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
import Activity from "./_hub/sections/Activity";
import Access from "./_hub/sections/Access";

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

const SECTIONS: Record<HubTab, (go: (t: HubTab) => void) => React.ReactNode> = {
  summary: (go) => <Summary go={go} />,
  details: () => <Details />,
  tickets: (go) => <Tickets go={go} />,
  inventory: () => <Inventory />,
  promotions: () => <Promotions />,
  marketing: () => <Marketing />,
  orders: () => <Orders />,
  guests: () => <Guests />,
  dayof: () => <DayOf />,
  deal: () => <Deal />,
  settlement: () => <Settlement />,
  activity: () => <Activity />,
  access: () => <Access />,
};

function Section({ tab, go }: { tab: HubTab; go: (t: HubTab) => void }) {
  return <>{SECTIONS[tab](go)}</>;
}
