"use client";

/**
 * Settlement — eventhub.dc.html ?tab=settlement: "settlement.dc.html — the
 * whole thing, now inside the hub". The settlement editor itself
 * (app/admin/settlements/[id]/SettlementWorkspace) renders here embedded:
 * manifest, tax, expenses offer vs actual, ancillary, deal terms, the
 * artist split, deposits, signatures, payout, finalize and the exports.
 * /admin/settlements/[id] renders the same component on its own page.
 *
 * No settlement yet: before the show it says when it opens and lets one be
 * started early; after it, one click starts it from the ticket manifest and
 * the linked offer (POST /api/settlements is idempotent on the show).
 */

import { useState } from "react";
import { isEventPast } from "@/lib/dates";
import SettlementWorkspace from "@/app/admin/settlements/[id]/SettlementWorkspace";
import { useHub } from "../HubContext";
import { HubEmpty, HubLoading } from "../ui";

export default function Settlement() {
  const hub = useHub();
  const { id, event, settlement } = hub;
  const [busy, setBusy] = useState(false);

  if (!event || settlement === undefined) return <HubLoading label="Settlement" />;

  if (settlement === null) {
    const played = isEventPast(event.date);
    const dayAfter = new Date(new Date(event.date.slice(0, 10) + "T12:00:00").getTime() + 86400000)
      .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const start = async () => {
      setBusy(true);
      const r = await fetch("/api/settlements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event_id: id }) });
      setBusy(false);
      if (!r.ok) { hub.toast((await r.json().catch(() => ({}))).error || "Couldn't start the settlement."); return; }
      hub.reload(["settlement"]);
      hub.toast("Settlement started from the ticket manifest and the linked offer.");
    };
    return (
      <HubEmpty
        title={played ? "Settlement not started" : "Settlement opens after the show"}
        body={played
          ? "Start it to pull in the ticket manifest, the deal from the linked offer and the fees and tax the orders carried. Expenses and ancillary go in next."
          : `Settle from ${dayAfter}, once the night has been scanned and the expenses are in. You can start a draft now to log costs as they land.`}
        ctas={[{ label: busy ? "Starting…" : played ? "Start the settlement" : "Start a draft now", onClick: busy ? undefined : start }]}
      />
    );
  }

  return (
    <div className="hub-settle">
      <SettlementWorkspace id={settlement.id} embedded />
    </div>
  );
}
