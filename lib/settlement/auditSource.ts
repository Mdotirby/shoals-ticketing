import type { TicketAuditRow } from "@/lib/types/settlement";

/** Where a ticket audit row's tickets came from, as the settlement prints it. */
export function auditSourceLabel(row: Pick<TicketAuditRow, "source" | "promo_code">): string {
  if (row.promo_code) return `Promo: ${row.promo_code}`;
  if (row.source === "cash") return "Door Cash";
  if (row.source === "terminal") return "Door Terminal";
  return "Online";
}
