"use client";

import { useParams } from "next/navigation";
import OrderWorkspace from "./OrderWorkspace";

/**
 * /admin/orders/[id]/[orderId] — next.config redirects this into the event
 * hub (?tab=orders&order=…); this stays as a fallback render.
 */
export default function OrderDetailPage() {
  const { id, orderId } = useParams() as { id: string; orderId: string };
  return <OrderWorkspace eventId={id} orderId={orderId} />;
}
