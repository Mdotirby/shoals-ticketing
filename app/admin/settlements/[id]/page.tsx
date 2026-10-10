"use client";

import { useParams } from "next/navigation";
import SettlementWorkspace from "./SettlementWorkspace";

/** /admin/settlements/[id] — the settlement editor on its own page. */
export default function SettlementDetailPage() {
  const { id } = useParams() as { id: string };
  return <SettlementWorkspace id={id} />;
}
