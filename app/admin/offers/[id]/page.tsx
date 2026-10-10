"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import OfferWorkspace from "./OfferWorkspace";

/**
 * /admin/offers/[id] — an offer linked to a show opens in that show's event
 * hub (Deal). An offer not yet linked is still a negotiation with no show,
 * so it stays here.
 */
export default function OfferPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/offers/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((o) => {
        if (!live) return;
        if (o?.event_id) router.replace(`/admin/events/${o.event_id}?tab=deal&offer=${id}`);
        else setStandalone(true);
      })
      .catch(() => live && setStandalone(true));
    return () => { live = false; };
  }, [id, router]);

  return standalone ? <OfferWorkspace id={id} /> : null;
}
