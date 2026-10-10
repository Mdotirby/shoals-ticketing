"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import OfferSigned from "./OfferSigned";

/**
 * /admin/offers/[id]/edit — a signed offer's terms and revisions. When the
 * offer is linked to a show it opens in that show's event hub (Deal).
 */
export default function EditOfferPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/offers/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((o) => {
        if (!live) return;
        if (o?.event_id) router.replace(`/admin/events/${o.event_id}?tab=deal&offer=${id}&view=signed`);
        else setStandalone(true);
      })
      .catch(() => live && setStandalone(true));
    return () => { live = false; };
  }, [id, router]);

  return standalone ? <OfferSigned id={id} /> : null;
}
