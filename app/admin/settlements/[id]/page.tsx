"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import SettlementWorkspace from "./SettlementWorkspace";

/**
 * /admin/settlements/[id] — a show's settlement opens in its event hub
 * (eventhub.dc.html: Settlement is "the whole thing, now inside the hub").
 * An external settlement has no show in the system, so it stays here.
 */
export default function SettlementDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/settlements/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!live) return;
        const s = d?.settlement ?? d;
        if (s?.event_id && s?.source !== "external") router.replace(`/admin/events/${s.event_id}?tab=settlement`);
        else setStandalone(true);
      })
      .catch(() => live && setStandalone(true));
    return () => { live = false; };
  }, [id, router]);

  return standalone ? <SettlementWorkspace id={id} /> : null;
}
