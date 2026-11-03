/**
 * Whether a ticket belongs at the door it was scanned at. Null means yes. A
 * scanner set to one show used to admit a ticket for any show, and marked it
 * used, so it would then be refused at its own show.
 */
export function wrongShowReason(
  ticket: { event_id: string | null; event_title?: string | null; event_date?: string | null },
  scanningEventId: string | null | undefined,
): string | null {
  if (!scanningEventId || ticket.event_id === scanningEventId) return null;
  const day = ticket.event_date
    ? new Date(`${String(ticket.event_date).slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";
  const show = [ticket.event_title, day].filter(Boolean).join(" on ");
  return show ? `This ticket is for ${show}.` : "This ticket is for a different show.";
}

export const POSTPONED_SCAN_REASON = "This show is postponed. The ticket stays valid for the new date.";
